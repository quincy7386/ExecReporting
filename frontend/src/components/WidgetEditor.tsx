import { useState } from "react";
import type { Widget, WidgetPayload, ChartStyle } from "../api";

interface Props {
  initial?: Widget;
  onSave: (payload: WidgetPayload) => void;
  onCancel: () => void;
}

const defaultForm: WidgetPayload = {
  title: "",
  search_query: "*",
  group_by: "severity",
  chart_style: "bar",
  poll_interval: 60,
  time_range: "-2w",
  row_limit: null,
  position_x: 0,
  position_y: 0,
  width: 4,
  height: 3,
  enabled: true,
};

export default function WidgetEditor({ initial, onSave, onCancel }: Props) {
  const [form, setForm] = useState<WidgetPayload>(initial ? { ...initial } : defaultForm);

  const set = (field: keyof WidgetPayload, value: unknown) =>
    setForm(f => ({ ...f, [field]: value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(form);
  };

  return (
    <div style={overlayStyle}>
      <form onSubmit={handleSubmit} style={modalStyle}>
        <h2 style={{ margin: "0 0 16px", color: "#cdd6f4" }}>{initial ? "Edit Widget" : "New Widget"}</h2>

        <Field label="Title">
          <input style={inputStyle} value={form.title} onChange={e => set("title", e.target.value)} required />
        </Field>

        <Field label="Search Query (CBC syntax)">
          <input style={inputStyle} value={form.search_query} onChange={e => set("search_query", e.target.value)} required />
        </Field>

        <Field label="Group By Field">
          <input style={inputStyle} value={form.group_by} onChange={e => set("group_by", e.target.value)} required />
        </Field>

        <Field label="Chart Style">
          <select style={inputStyle} value={form.chart_style} onChange={e => set("chart_style", e.target.value as ChartStyle)}>
            <option value="bar">Bar</option>
            <option value="pie">Pie</option>
            <option value="line">Line</option>
            <option value="list">List</option>
          </select>
        </Field>

        <Field label="Time Range">
          <select style={inputStyle} value={form.time_range} onChange={e => set("time_range", e.target.value)}>
            <option value="-1h">Last 1 hour</option>
            <option value="-4h">Last 4 hours</option>
            <option value="-1d">Last 24 hours</option>
            <option value="-3d">Last 3 days</option>
            <option value="-1w">Last 7 days</option>
            <option value="-2w">Last 14 days</option>
            <option value="-30d">Last 30 days</option>
          </select>
        </Field>

        <Field label="Poll Interval (seconds)">
          <input style={inputStyle} type="number" min={10} value={form.poll_interval} onChange={e => set("poll_interval", parseInt(e.target.value))} required />
        </Field>

        {form.chart_style === "list" && (
          <Field label="Row Limit">
            <input style={inputStyle} type="number" min={1} value={form.row_limit ?? 25} onChange={e => set("row_limit", parseInt(e.target.value))} />
          </Field>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
          <button type="button" onClick={onCancel} style={secondaryBtn}>Cancel</button>
          <button type="submit" style={primaryBtn}>Save</button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: "block", fontSize: 12, color: "#89b4fa", marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
  display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
};
const modalStyle: React.CSSProperties = {
  background: "#1e1e2e", border: "1px solid #333", borderRadius: 10,
  padding: 24, width: 440, maxWidth: "95vw",
};
const inputStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box", padding: "6px 10px",
  background: "#2a2a3e", border: "1px solid #444", borderRadius: 4,
  color: "#cdd6f4", fontSize: 13,
};
const primaryBtn: React.CSSProperties = {
  padding: "7px 18px", background: "#4f86c6", color: "#fff",
  border: "none", borderRadius: 4, cursor: "pointer", fontSize: 13,
};
const secondaryBtn: React.CSSProperties = {
  ...primaryBtn, background: "#2a2a3e", color: "#cdd6f4", border: "1px solid #444",
};
