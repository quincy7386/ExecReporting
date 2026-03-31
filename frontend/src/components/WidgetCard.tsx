import { useEffect, useState } from "react";
import {
  PieChart, Pie, Cell,
  BarChart, Bar, XAxis, YAxis, Tooltip,
  LineChart, Line,
  ResponsiveContainer,
} from "recharts";
import { getWidgetData } from "../api";
import type { Widget, WidgetData } from "../api";

const COLORS = ["#4f86c6", "#f4a261", "#2a9d8f", "#e76f51", "#a8dadc", "#457b9d", "#e9c46a", "#264653"];

interface Props {
  widget: Widget;
  onEdit: () => void;
  onDelete: () => void;
}

export default function WidgetCard({ widget, onEdit, onDelete }: Props) {
  const [result, setResult] = useState<WidgetData | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetch = () => getWidgetData(widget.id).then(d => { if (!cancelled) setResult(d); });
    fetch();
    const interval = setInterval(fetch, Math.max(widget.poll_interval * 1000, 5000));
    return () => { cancelled = true; clearInterval(interval); };
  }, [widget.id, widget.poll_interval]);

  const data = result?.data as { label: string; count: number }[] | null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#1e1e2e", border: "1px solid #333", borderRadius: 8, overflow: "hidden" }}>
      {/* Header — title is the drag handle, buttons are excluded */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "#2a2a3e", flexShrink: 0 }}>
        <span className="drag-handle" style={{ fontWeight: 600, fontSize: 14, color: "#cdd6f4", cursor: "grab", flex: 1 }}>{widget.title}</span>
        <div style={{ display: "flex", gap: 8 }} onMouseDown={e => e.stopPropagation()}>
          <button onClick={onEdit} style={btnStyle}>Edit</button>
          <button onClick={onDelete} style={{ ...btnStyle, color: "#f38ba8" }}>Delete</button>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, padding: 8, overflow: "auto" }}>
        {!result && <div style={mutedStyle}>Loading…</div>}
        {result?.status === "pending" && <div style={mutedStyle}>Waiting for first poll…</div>}
        {result?.status === "error" && <div style={{ color: "#f38ba8", fontSize: 12 }}>{result.error}</div>}
        {result?.status === "ok" && data && (
          <>
            {widget.chart_style === "list" && <ListChart data={result.data as Record<string, unknown>[]} />}
            {widget.chart_style === "pie" && <PieViz data={data} />}
            {widget.chart_style === "bar" && <BarViz data={data} />}
            {widget.chart_style === "line" && <LineViz data={data} />}
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

function ListChart({ data }: { data: Record<string, unknown>[] }) {
  if (!data.length) return <div style={mutedStyle}>No results</div>;
  const keys = Object.keys(data[0]);
  return (
    <table style={{ width: "100%", fontSize: 12, borderCollapse: "collapse", color: "#cdd6f4" }}>
      <thead>
        <tr>{keys.map(k => <th key={k} style={{ textAlign: "left", padding: "4px 6px", borderBottom: "1px solid #333", color: "#89b4fa" }}>{k}</th>)}</tr>
      </thead>
      <tbody>
        {data.map((row, i) => (
          <tr key={i} style={{ background: i % 2 ? "#2a2a3e" : "transparent" }}>
            {keys.map(k => <td key={k} style={{ padding: "3px 6px" }}>{String(row[k] ?? "")}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PieViz({ data }: { data: { label: string; count: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart margin={{ top: 16, right: 32, bottom: 16, left: 32 }}>
        <Pie data={data} dataKey="count" nameKey="label" cx="50%" cy="50%" outerRadius="60%" label={({ name, percent }) => `${name} (${((percent ?? 0) * 100).toFixed(0)}%)`} labelLine={true}>
          {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Pie>
        <Tooltip formatter={(v) => [v, "count"]} />
      </PieChart>
    </ResponsiveContainer>
  );
}

function BarViz({ data }: { data: { label: string; count: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data}>
        <XAxis dataKey="label" tick={{ fill: "#cdd6f4", fontSize: 11 }} />
        <YAxis tick={{ fill: "#cdd6f4", fontSize: 11 }} />
        <Tooltip />
        <Bar dataKey="count" fill="#4f86c6" />
      </BarChart>
    </ResponsiveContainer>
  );
}

function LineViz({ data }: { data: { label: string; count: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data}>
        <XAxis dataKey="label" tick={{ fill: "#cdd6f4", fontSize: 11 }} />
        <YAxis tick={{ fill: "#cdd6f4", fontSize: 11 }} />
        <Tooltip />
        <Line type="monotone" dataKey="count" stroke="#4f86c6" dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

const btnStyle: React.CSSProperties = { background: "none", border: "none", cursor: "pointer", color: "#89b4fa", fontSize: 12 };
const mutedStyle: React.CSSProperties = { color: "#585b70", fontSize: 13, padding: 8 };
