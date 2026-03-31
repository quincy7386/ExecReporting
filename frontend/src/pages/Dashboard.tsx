import { useEffect, useState, useCallback } from "react";
import GridLayout from "react-grid-layout";
import type { Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { listWidgets, createWidget, updateWidget, deleteWidget, getCredentials } from "../api";
import type { Widget, WidgetPayload, Credentials } from "../api";
import WidgetCard from "../components/WidgetCard";
import WidgetEditor from "../components/WidgetEditor";

const COLS = 12;
const ROW_HEIGHT = 80;

export default function Dashboard() {
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [creds, setCreds] = useState<Credentials | null>(null);
  const [editing, setEditing] = useState<Widget | null | "new">(null);
  const [containerWidth, setContainerWidth] = useState(window.innerWidth - 32);

  useEffect(() => {
    listWidgets().then(setWidgets);
    getCredentials().then(c => { if (c.configured) setCreds(c); });
    const onResize = () => setContainerWidth(window.innerWidth - 32);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

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

  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSave = async (payload: WidgetPayload) => {
    setSaveError(null);
    try {
      if (editing === "new") {
        const created = await createWidget(payload);
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

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1 style={{ margin: 0, color: "#cdd6f4", fontSize: 20 }}>Dashboard</h1>
        <button onClick={() => setEditing("new")} style={primaryBtn}>+ Add Widget</button>
      </div>

      {widgets.length === 0 && (
        <div style={{ color: "#585b70", textAlign: "center", marginTop: 80, fontSize: 15 }}>
          No widgets yet. Click <strong>+ Add Widget</strong> to get started.
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
              onEdit={() => setEditing(w)}
              onDelete={() => handleDelete(w.id)}
            />
          </div>
        ))}
      </GridLayout>

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

const primaryBtn: React.CSSProperties = {
  padding: "7px 16px", background: "#4f86c6", color: "#fff",
  border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13,
};
