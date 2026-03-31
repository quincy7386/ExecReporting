import { useEffect, useState, Component } from "react";
import type { ReactNode } from "react";
import {
  PieChart, Pie, Cell,
  BarChart, Bar, XAxis, YAxis, Tooltip,
  LineChart, Line,
  ResponsiveContainer,
} from "recharts";
import { getWidgetData } from "../api";
import type { Widget, WidgetData, Credentials } from "../api";

const COLORS = ["#4f86c6", "#f4a261", "#2a9d8f", "#e76f51", "#a8dadc", "#457b9d", "#e9c46a", "#264653"];

// Fields whose values are file paths — strip to basename for display
const PATH_FIELDS = new Set([
  "process_name", "parent_name", "childproc_name",
  "blocked_name", "process_sha256",
]);

function maybeBasename(field: string, value: string): string {
  if (!PATH_FIELDS.has(field)) return value;
  return value.replace(/.*[/\\]/, "") || value;
}

function cbcUrl(creds: Credentials, groupBy: string, label: string, dataSource: string): string {
  const host = creds.hostname.replace(/\/$/, "");
  const base = host.startsWith("http") ? host : `https://${host}`;
  const q = encodeURIComponent(`${groupBy}:"${label}"`);
  const page = dataSource === "devices" ? "endpoints" : "alerts";
  return `${base}/${page}?s[c][query_string]=${q}&orgKey=${creds.org_key}`;
}

// ---------------------------------------------------------------------------
// Error boundary — isolates render errors to a single widget
// ---------------------------------------------------------------------------

interface BoundaryState { error: string | null }

class WidgetErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { error: null };
  static getDerivedStateFromError(e: Error) { return { error: e.message }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 12, color: "#f38ba8", fontSize: 12 }}>
          Widget error: {this.state.error}
        </div>
      );
    }
    return this.props.children;
  }
}

// ---------------------------------------------------------------------------
// WidgetCard
// ---------------------------------------------------------------------------

interface Props {
  widget: Widget;
  creds: Credentials | null;
  onEdit: () => void;
  onDelete: () => void;
}

export default function WidgetCard({ widget, creds, onEdit, onDelete }: Props) {
  const [result, setResult] = useState<WidgetData | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetch = () => getWidgetData(widget.id).then(d => { if (!cancelled) setResult(d); });
    fetch();
    const interval = setInterval(fetch, Math.max(widget.poll_interval * 1000, 5000));
    return () => { cancelled = true; clearInterval(interval); };
  }, [widget.id, widget.poll_interval]);

  const rawData = result?.data as { label: string; count: number }[] | null;
  const data = rawData?.map(d => ({
    ...d,
    displayLabel: maybeBasename(widget.group_by, d.label),
  })) ?? null;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "#1e1e2e", border: "1px solid #333", borderRadius: 8, overflow: "hidden" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "#2a2a3e", flexShrink: 0 }}>
        <span className="drag-handle" style={{ fontWeight: 600, fontSize: 14, color: "#cdd6f4", cursor: "grab", flex: 1 }}>{widget.title}</span>
        <div style={{ display: "flex", gap: 8 }} onMouseDown={e => e.stopPropagation()}>
          <button onClick={onEdit} style={btnStyle}>Edit</button>
          <button onClick={onDelete} style={{ ...btnStyle, color: "#f38ba8" }}>Delete</button>
        </div>
      </div>

      <div style={{ flex: 1, padding: 8, overflow: "auto", minHeight: 0 }}>
        <WidgetErrorBoundary>
          {!result && <div style={mutedStyle}>Loading…</div>}
          {result?.status === "pending" && <div style={mutedStyle}>Waiting for first poll…</div>}
          {result?.status === "error" && <div style={{ color: "#f38ba8", fontSize: 12 }}>{result.error}</div>}
          {result?.status === "ok" && data && (
            <>
              {widget.chart_style === "list" && <ListChart data={result.data as Record<string, unknown>[]} creds={creds} groupBy={widget.group_by} dataSource={widget.data_source} />}
              {widget.chart_style === "pie" && <PieViz data={data} creds={creds} groupBy={widget.group_by} dataSource={widget.data_source} />}
              {widget.chart_style === "bar" && <BarViz data={data} creds={creds} groupBy={widget.group_by} dataSource={widget.data_source} />}
              {widget.chart_style === "line" && <LineViz data={data} creds={creds} groupBy={widget.group_by} dataSource={widget.data_source} />}
            </>
          )}
        </WidgetErrorBoundary>
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

type ChartRow = { label: string; displayLabel: string; count: number };

interface ChartProps {
  data: ChartRow[];
  creds: Credentials | null;
  groupBy: string;
  dataSource: string;
}

function ListChart({ data, creds, groupBy, dataSource }: { data: Record<string, unknown>[]; creds: Credentials | null; groupBy: string; dataSource: string }) {
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
          const link = creds ? cbcUrl(creds, groupBy, rawVal, dataSource) : null;
          return (
            <tr key={i} style={{ background: i % 2 ? "#2a2a3e" : "transparent" }}>
              {keys.map(k => (
                <td key={k} style={{ padding: "3px 6px" }}>
                  {k === groupBy && link
                    ? <a href={link} target="_blank" rel="noreferrer" style={{ color: "#89b4fa" }}>{maybeBasename(groupBy, String(row[k] ?? ""))}</a>
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

function PieViz({ data, creds, groupBy, dataSource }: ChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart margin={{ top: 16, right: 40, bottom: 16, left: 40 }}>
        <Pie
          data={data}
          dataKey="count"
          nameKey="displayLabel"
          cx="50%"
          cy="50%"
          outerRadius="55%"
          onClick={(entry: { name?: string; payload?: { label: string } }) => {
            if (!creds) return;
            const raw = entry.payload?.label ?? entry.name ?? "";
            if (raw) window.open(cbcUrl(creds, groupBy, raw, dataSource), "_blank");
          }}
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

function BarViz({ data, creds, groupBy, dataSource }: ChartProps) {
  const maxLen = Math.max(...data.map(d => d.displayLabel.length));
  const bottomMargin = Math.min(maxLen * 5, 120);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: bottomMargin, left: 8 }}>
        <XAxis dataKey="displayLabel" tick={{ fill: "#cdd6f4", fontSize: 11 }} angle={-40} textAnchor="end" interval={0} />
        <YAxis tick={{ fill: "#cdd6f4", fontSize: 11 }} />
        <Tooltip formatter={(v) => [v, "count"]} labelFormatter={(l) => l} />
        <Bar
          dataKey="count"
          onClick={(entry) => {
            if (creds) window.open(cbcUrl(creds, groupBy, (entry as unknown as { label: string }).label, dataSource), "_blank");
          }}
          style={{ cursor: creds ? "pointer" : "default" }}
        >
          {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function LineViz({ data, creds, groupBy, dataSource }: ChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart
        data={data}
        margin={{ top: 8, right: 8, bottom: 8, left: 8 }}
        onClick={(point) => {
          if (!creds) return;
          const payload = (point as { activePayload?: { payload: { label: string } }[] })?.activePayload?.[0]?.payload;
          if (payload) window.open(cbcUrl(creds, groupBy, payload.label, dataSource), "_blank");
        }}
        style={{ cursor: creds ? "pointer" : "default" }}
      >
        <XAxis dataKey="displayLabel" tick={{ fill: "#cdd6f4", fontSize: 11 }} />
        <YAxis tick={{ fill: "#cdd6f4", fontSize: 11 }} />
        <Tooltip />
        <Line type="monotone" dataKey="count" stroke="#4f86c6" dot={true} />
      </LineChart>
    </ResponsiveContainer>
  );
}

const btnStyle: React.CSSProperties = { background: "none", border: "none", cursor: "pointer", color: "#89b4fa", fontSize: 12 };
const mutedStyle: React.CSSProperties = { color: "#585b70", fontSize: 13, padding: 8 };
