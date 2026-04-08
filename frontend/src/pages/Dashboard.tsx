import { useEffect, useState, useCallback, useRef } from "react";
import GridLayout from "react-grid-layout";
import type { Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import {
  listDashboards, createDashboard, updateDashboard, deleteDashboard,
  listWidgets, createWidget, updateWidget, deleteWidget, getCredentials,
} from "../api";
import type { Dashboard, Widget, WidgetPayload, Credentials } from "../api";
import WidgetCard from "../components/WidgetCard";
import WidgetEditor from "../components/WidgetEditor";

const COLS = 12;
const ROW_HEIGHT = 80;

export default function DashboardPage() {
  const [dashboards, setDashboards] = useState<Dashboard[]>([]);
  const [activeDashboardId, setActiveDashboardId] = useState<number | null>(null);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef<HTMLInputElement>(null);

  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [creds, setCreds] = useState<Credentials | null>(null);
  const [editing, setEditing] = useState<Widget | null | "new">(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [containerWidth, setContainerWidth] = useState(window.innerWidth - 32);

  // Load dashboards and credentials on mount
  useEffect(() => {
    listDashboards().then(ds => {
      setDashboards(ds);
      if (ds.length > 0) setActiveDashboardId(ds[0].id);
    });
    getCredentials().then(c => { if (c.configured) setCreds(c); });
    const onResize = () => setContainerWidth(window.innerWidth - 32);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Load widgets whenever active dashboard changes
  useEffect(() => {
    if (activeDashboardId == null) return;
    listWidgets(activeDashboardId).then(setWidgets);
  }, [activeDashboardId]);

  // Focus rename input when entering rename mode
  useEffect(() => {
    if (renamingId != null) renameInputRef.current?.focus();
  }, [renamingId]);

  // --- Dashboard tab management ---

  const handleAddDashboard = async () => {
    const position = dashboards.length;
    const created = await createDashboard({ name: "New Dashboard", position });
    setDashboards(prev => [...prev, created]);
    setActiveDashboardId(created.id);
    // Immediately enter rename mode
    setRenamingId(created.id);
    setRenameValue("New Dashboard");
  };

  const handleStartRename = (d: Dashboard) => {
    setRenamingId(d.id);
    setRenameValue(d.name);
  };

  const handleCommitRename = async () => {
    if (renamingId == null) return;
    const name = renameValue.trim() || "Dashboard";
    const d = dashboards.find(x => x.id === renamingId);
    if (d && name !== d.name) {
      const updated = await updateDashboard(renamingId, { name, position: d.position });
      setDashboards(prev => prev.map(x => x.id === renamingId ? updated : x));
    }
    setRenamingId(null);
  };

  const handleDeleteDashboard = async (id: number) => {
    if (dashboards.length <= 1) return;
    if (!confirm("Delete this dashboard and reassign its widgets to the first remaining dashboard?")) return;
    await deleteDashboard(id);
    const remaining = dashboards.filter(d => d.id !== id);
    setDashboards(remaining);
    if (activeDashboardId === id) setActiveDashboardId(remaining[0]?.id ?? null);
  };

  // --- Widget management ---

  const layout: Layout[] = widgets.map(w => ({
    i: String(w.id),
    x: w.position_x,
    y: w.position_y,
    w: w.width,
    h: w.height,
    minW: 2,
    minH: 2,
  }));

  const handleLayoutChange = useCallback((newLayout: Layout[]) => {
    newLayout.forEach(item => {
      const widget = widgets.find(w => String(w.id) === item.i);
      if (!widget) return;
      if (widget.position_x !== item.x || widget.position_y !== item.y || widget.width !== item.w || widget.height !== item.h) {
        const payload: WidgetPayload = { ...widget, position_x: item.x, position_y: item.y, width: item.w, height: item.h };
        updateWidget(widget.id, payload);
      }
    });
    setWidgets(prev => prev.map(w => {
      const item = newLayout.find(l => l.i === String(w.id));
      return item ? { ...w, position_x: item.x, position_y: item.y, width: item.w, height: item.h } : w;
    }));
  }, [widgets]);

  const handleSave = async (payload: WidgetPayload) => {
    setSaveError(null);
    try {
      if (editing === "new") {
        const created = await createWidget({ ...payload, dashboard_id: activeDashboardId });
        setWidgets(prev => [...prev, created]);
      } else if (editing) {
        const updated = await updateWidget(editing.id, payload);
        setWidgets(prev => prev.map(w => w.id === updated.id ? updated : w));
      }
      setEditing(null);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setSaveError(msg);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this widget?")) return;
    await deleteWidget(id);
    setWidgets(prev => prev.filter(w => w.id !== id));
  };

  const handleMove = async (widgetId: number, targetDashboardId: number) => {
    const widget = widgets.find(w => w.id === widgetId);
    if (!widget) return;
    await updateWidget(widgetId, { ...widget, dashboard_id: targetDashboardId });
    setWidgets(prev => prev.filter(w => w.id !== widgetId));
  };

  const handleCopy = async (widgetId: number, targetDashboardId: number) => {
    const widget = widgets.find(w => w.id === widgetId);
    if (!widget) return;
    await createWidget({ ...widget, dashboard_id: targetDashboardId, position_y: widget.position_y + widget.height });
  };

  return (
    <div style={{ padding: "0 0 16px", display: "flex", flexDirection: "column", height: "100%" }}>

      {/* Tab bar */}
      <div style={{
        display: "flex", alignItems: "stretch",
        background: "var(--bg-dark)",
        borderBottom: "1px solid var(--border)",
        padding: "0 12px",
        gap: 2,
        flexShrink: 0,
        overflowX: "auto",
      }}>
        {dashboards.map(d => (
          <div
            key={d.id}
            onClick={() => { if (renamingId !== d.id) setActiveDashboardId(d.id); }}
            onDoubleClick={() => handleStartRename(d)}
            style={{
              display: "flex", alignItems: "center", gap: 4,
              padding: "0 12px",
              height: 34,
              marginTop: 4,
              cursor: "pointer",
              border: "1px solid",
              borderColor: d.id === activeDashboardId ? "var(--border)" : "transparent",
              borderBottom: d.id === activeDashboardId ? "1px solid var(--bg-dark)" : "1px solid transparent",
              borderRadius: "3px 3px 0 0",
              background: d.id === activeDashboardId ? "var(--bg-card)" : "transparent",
              color: d.id === activeDashboardId ? "var(--text)" : "var(--text-muted)",
              fontSize: 13,
              fontWeight: d.id === activeDashboardId ? 600 : 400,
              whiteSpace: "nowrap",
              userSelect: "none",
              position: "relative",
              bottom: -1,
            }}
          >
            {renamingId === d.id ? (
              <input
                ref={renameInputRef}
                value={renameValue}
                onChange={e => setRenameValue(e.target.value)}
                onBlur={handleCommitRename}
                onKeyDown={e => { if (e.key === "Enter") handleCommitRename(); if (e.key === "Escape") setRenamingId(null); }}
                onClick={e => e.stopPropagation()}
                style={{
                  background: "var(--bg-raised)", border: "1px solid var(--blue-link)",
                  borderRadius: 2, color: "var(--text)", fontSize: 13,
                  padding: "1px 4px", width: Math.max(renameValue.length * 8, 80),
                  fontFamily: "inherit",
                }}
              />
            ) : (
              <span>{d.name}</span>
            )}
            {dashboards.length > 1 && renamingId !== d.id && (
              <button
                onClick={e => { e.stopPropagation(); handleDeleteDashboard(d.id); }}
                style={{
                  background: "none", border: "none", cursor: "pointer",
                  color: "var(--text-muted)", fontSize: 14, padding: "0 2px",
                  lineHeight: 1, marginLeft: 2,
                }}
                title="Delete dashboard"
              >×</button>
            )}
          </div>
        ))}
        <button
          onClick={handleAddDashboard}
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: "var(--text-muted)", fontSize: 18, padding: "0 10px",
            alignSelf: "center", lineHeight: 1,
          }}
          title="Add dashboard"
        >+</button>

        {/* Push Add Widget to the right */}
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", padding: "0 4px" }}>
          <button onClick={() => setEditing("new")} style={outlineBtn}>+ Add Widget</button>
        </div>
      </div>

      {/* Widget grid */}
      <div style={{ flex: 1, padding: "12px 16px 0", overflowY: "auto" }}>
        {widgets.length === 0 && (
          <div style={{ color: "var(--text-muted)", textAlign: "center", marginTop: 80, fontSize: 14 }}>
            No widgets yet. Click <strong style={{ color: "var(--blue-link)" }}>+ Add Widget</strong> to get started.
          </div>
        )}

        <GridLayout
          className="layout"
          layout={layout}
          cols={COLS}
          rowHeight={ROW_HEIGHT}
          width={containerWidth}
          onLayoutChange={handleLayoutChange}
          draggableHandle=".drag-handle"
        >
          {widgets.map(w => (
            <div key={String(w.id)} style={{ height: "100%" }}>
              <WidgetCard
                widget={w}
                creds={creds}
                dashboards={dashboards}
                onEdit={() => setEditing(w)}
                onDelete={() => handleDelete(w.id)}
                onMove={targetId => handleMove(w.id, targetId)}
                onCopy={targetId => handleCopy(w.id, targetId)}
              />
            </div>
          ))}
        </GridLayout>
      </div>

      {editing !== null && (
        <WidgetEditor
          initial={editing === "new" ? undefined : editing}
          onSave={handleSave}
          onCancel={() => { setEditing(null); setSaveError(null); }}
          error={saveError}
        />
      )}
    </div>
  );
}

const outlineBtn: React.CSSProperties = {
  padding: "5px 12px",
  background: "transparent",
  color: "var(--blue-link)",
  border: "1px solid var(--blue-link)",
  borderRadius: 3,
  cursor: "pointer",
  fontSize: 13,
  fontFamily: "inherit",
};
