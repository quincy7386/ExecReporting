import { useEffect, useState } from "react";
import {
  PieChart, Pie, Cell,
  BarChart, Bar, XAxis, YAxis, Tooltip,
  LineChart, Line,
  ResponsiveContainer,
} from "recharts";
import { getWidgetData, getCredentials } from "../api";
import type { Widget, WidgetData, Credentials } from "../api";

const COLORS = ["#4f86c6", "#f4a261", "#2a9d8f", "#e76f51", "#a8dadc", "#457b9d", "#e9c46a", "#264653"];

// Strip directory path, return just the filename (handles / and \)
function basename(s: string): string {
  return s.replace(/.*[/\\]/, "") || s;
}

// Build a CBC console deep-link for a group-by value
function cbcUrl(creds: Credentials, groupBy: string, label: string): string {
  const host = creds.hostname.replace(/\/$/, "");
  const base = host.startsWith("http") ? host : `https://${host}`;
  const q = encodeURIComponent(`${groupBy}:"${label}"`);
  return `${base}/alerts?s[c][query_string]=${q}&orgKey=${creds.org_key}`;
}

interface Props {
  widget: Widget;
  onEdit: () => void;
  onDelete: () => void;
}

export default function WidgetCard({ widget, onEdit, onDelete }: Props) {
  const [result, setResult] = useState<WidgetData | null>(null);
  const [creds, setCreds] = useState<Credentials | null>(null);

  useEffect(() => {
    getCredentials().then(c => { if (c.configured) setCreds(c); });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const fetch = () => getWidgetData(widget.id).then(d => { if (!cancelled) setResult(d); });
    fetch();
    const interval = setInterval(fetch, Math.max(widget.poll_interval * 1000, 5000));
    return () => { cancelled = true; clearInterval(interval); };
  }, [widget.id, widget.poll_interval]);

  // Normalise chart data: strip paths from labels
  const rawData = result?.data as { label: string; count: number }[] | null;
  const data = rawData?.map(d => ({ ...d, label: basename(d.label) })) ?? null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#1e1e2e", border: "1px solid #333", borderRadius: 8, overflow: "hidden" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "#2a2a3e", flexShrink: 0 }}>
        <span className="drag-handle" style={{ fontWeight: 600, fontSize: 14, color: "#cdd6f4", cursor: "grab", flex: 1 }}>{widget.title}</span>
        <div style={{ display: "flex", gap: 8 }} onMouseDown={e => e.stopPropagation()}>
          <button onClick={onEdit} style={btnStyle}>Edit</button>
          <button onClick={onDelete} style={{ ...btnStyle, color: "#f38ba8" }}>Delete</button>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, padding: 8, overflow: "auto", minHeight: 0 }}>
        {!result && <div style={mutedStyle}>Loading…</div>}
        {result?.status === "pending" && <div style={mutedStyle}>Waiting for first poll…</div>}
        {result?.status === "error" && <div style={{ color: "#f38ba8", fontSize: 12 }}>{result.error}</div>}
        {result?.status === "ok" && data && (
          <>
            {widget.chart_style === "list" && <ListChart data={result.data as Record<string, unknown>[]} creds={creds} groupBy={widget.group_by} />}
            {widget.chart_style === "pie" && <PieViz data={data} creds={creds} groupBy={widget.group_by} />}
            {widget.chart_style === "bar" && <BarViz data={data} creds={creds} groupBy={widget.group_by} />}
            {widget.chart_style === "line" && <LineViz data={data} creds={creds} groupBy={widget.group_by} />}
          </>
        )}
      </div>

      {result?.last_updated && (
        <div style={{ fontSize: 10, color: "#585b70", padding: "2px 12px 6px", flexShrink: 0 }}>
          Updated: {new Date(result.last_updated).toLocaleTimeString()}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chart components
// ---------------------------------------------------------------------------

interface ChartProps {
  data: { label: string; count: number }[];
  creds: Credentials | null;
  groupBy: string;
}

function ListChart({ data, creds, groupBy }: { data: Record<string, unknown>[]; creds: Credentials | null; groupBy: string }) {
  if (!data.length) return <div style={mutedStyle}>No results</div>;
  const keys = Object.keys(data[0]);
  return (
    <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse", color: "#cdd6f4" }}>
      <thead>
        <tr>{keys.map(k => <th key={k} style={{ textAlign: "left", padding: "4px 6px", borderBottom: "1px solid #333", color: "#89b4fa" }}>{k}</th>)}</tr>
      </thead>
      <tbody>
        {data.map((row, i) => {
          const rawVal = String(row[groupBy] ?? "");
          const link = creds ? cbcUrl(creds, groupBy, rawVal) : null;
          return (
            <tr key={i} style={{ background: i % 2 ? "#2a2a3e" : "transparent" }}>
              {keys.map(k => (
                <td key={k} style={{ padding: "3px 6px" }}>
                  {k === groupBy && link
                    ? <a href={link} target="_blank" rel="noreferrer" style={{ color: "#89b4fa" }}>{basename(String(row[k] ?? ""))}</a>
                    : String(row[k] ?? "")}
                </td>
              ))}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function PieViz({ data, creds, groupBy }: ChartProps) {
  const handleClick = (entry: { name?: string }) => {
    if (!creds || !entry.name) return;
    window.open(cbcUrl(creds, groupBy, entry.name), "_blank");
  };
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart margin={{ top: 16, right: 40, bottom: 16, left: 40 }}>
        <Pie
          data={data}
          dataKey="count"
          nameKey="label"
          cx="50%"
          cy="50%"
          outerRadius="55%"
          onClick={handleClick}
          style={{ cursor: creds ? "pointer" : "default" }}
          label={({ name, percent }) => `${name} (${((percent ?? 0) * 100).toFixed(0)}%)`}
          labelLine={true}
        >
          {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Pie>
        <Tooltip formatter={(v) => [v, "count"]} />
      </PieChart>
    </ResponsiveContainer>
  );
}

function BarViz({ data, creds, groupBy }: ChartProps) {
  // Estimate bottom margin based on longest label
  const maxLen = Math.max(...data.map(d => d.label.length));
  const bottomMargin = Math.min(maxLen * 5, 120);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: bottomMargin, left: 8 }}>
        <XAxis
          dataKey="label"
          tick={{ fill: "#cdd6f4", fontSize: 11 }}
          angle={-40}
          textAnchor="end"
          interval={0}
        />
        <YAxis tick={{ fill: "#cdd6f4", fontSize: 11 }} />
        <Tooltip />
        <Bar
          dataKey="count"
          onClick={(entry) => {
            if (creds) window.open(cbcUrl(creds, groupBy, (entry.payload as { label: string }).label), "_blank");
          }}
          style={{ cursor: creds ? "pointer" : "default" }}
        >
          {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function LineViz({ data, creds, groupBy }: ChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart
        data={data}
        margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
        onClick={(point) => {
          if (!creds) return;
          const payload = (point as { activePayload?: { payload: { label: string } }[] })?.activePayload?.[0]?.payload;
          if (payload) window.open(cbcUrl(creds, groupBy, payload.label), "_blank");
        }}
        style={{ cursor: creds ? "pointer" : "default" }}
      >
        <XAxis dataKey="label" tick={{ fill: "#cdd6f4", fontSize: 11 }} />
        <YAxis tick={{ fill: "#cdd6f4", fontSize: 11 }} />
        <Tooltip />
        <Line type="monotone" dataKey="count" stroke="#4f86c6" dot={true} />
      </LineChart>
    </ResponsiveContainer>
  );
}

const btnStyle: React.CSSProperties = { background: "none", border: "none", cursor: "pointer", color: "#89b4fa", fontSize: 12 };
const mutedStyle: React.CSSProperties = { color: "#585b70", fontSize: 13, padding: 8 };
