import { useState, useEffect } from "react";
import type { Widget, WidgetPayload, ChartStyle, DataSource } from "../api";

const ALERT_GROUP_BY_FIELDS = [
  "attack_tactic","attack_technique","blocked_effective_reputation","blocked_name",
  "childproc_effective_reputation","childproc_name","childproc_username",
  "determination","determination_value","device_location","device_name",
  "device_os","device_os_version","device_policy","device_target_value",
  "device_username","ioc_field","ioc_hit","mdr_determination_value",
  "mdr_workflow_status","ml_classification_final_verdict",
  "ml_classification_global_prevalence","ml_classification_org_prevalence",
  "netconn_protocol","netconn_remote_domain","netconn_remote_port",
  "parent_effective_reputation","parent_name","parent_reputation","parent_username",
  "policy_applied","process_effective_reputation","process_issuer","process_name",
  "process_publisher","process_reputation","process_sha256","process_username",
  "reason","reason_code","report_name","report_tags","rule_config_category",
  "run_state","sensor_action","severity","tags","threat_name","ttps","type",
  "vendor_name","watchlists_name","workflow_closure_reason","workflow_status",
];

const DEVICE_GROUP_BY_FIELDS = [
  "av_status","current_sensor_policy_name","deployment_type","last_location",
  "login_user_name","os","os_version","policy_name","sensor_version","status",
  "target_priority",
];

const OBSERVATION_GROUP_BY_FIELDS = [
  "alert_id","device_name","device_os","parent_name","process_name",
  "process_username","sensor_action","ttp",
];

interface Props {
  initial?: Widget;
  onSave: (payload: WidgetPayload) => void;
  onCancel: () => void;
  error?: string | null;
}

const defaultForm: WidgetPayload = {
  title: "",
  data_source: "alerts",
  search_query: "*",
  group_by: "severity",
  chart_style: "bar",
  poll_interval: 60,
  time_range: "-2w",
  include_all_alerts: false,
  active_devices_only: true,
  row_limit: null,
  position_x: 0,
  position_y: 0,
  width: 4,
  height: 3,
  enabled: true,
};

function secondsToUnit(seconds: number): { value: number; unit: "minutes" | "hours" | "days" } {
  if (seconds % 86400 === 0) return { value: seconds / 86400, unit: "days" };
  if (seconds % 3600 === 0) return { value: seconds / 3600, unit: "hours" };
  return { value: Math.round(seconds / 60), unit: "minutes" };
}

export default function WidgetEditor({ initial, onSave, onCancel, error }: Props) {
  const [form, setForm] = useState<WidgetPayload>(initial ? { ...initial } : defaultForm);
  const [pollValue, setPollValue] = useState(() => secondsToUnit(form.poll_interval).value);
  const [pollUnit, setPollUnit] = useState(() => secondsToUnit(form.poll_interval).unit);

  useEffect(() => {
    const multiplier = pollUnit === "days" ? 86400 : pollUnit === "hours" ? 3600 : 60;
    setForm(f => ({ ...f, poll_interval: pollValue * multiplier }));
  }, [pollValue, pollUnit]);

  const set = (field: keyof WidgetPayload, value: unknown) =>
    setForm(f => ({ ...f, [field]: value }));

  // When data source changes, reset group_by to a sensible default for that source
  const handleDataSourceChange = (src: DataSource) => {
    const defaultGroupBy =
      src === "devices" ? "os" :
      src === "observations" ? "process_name" :
      "severity";
    setForm(f => ({ ...f, data_source: src, group_by: defaultGroupBy }));
  };

  const groupByFields =
    form.data_source === "devices" ? DEVICE_GROUP_BY_FIELDS :
    form.data_source === "observations" ? OBSERVATION_GROUP_BY_FIELDS :
    ALERT_GROUP_BY_FIELDS;

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

        <Field label="Data Source">
          <select style={inputStyle} value={form.data_source} onChange={e => handleDataSourceChange(e.target.value as DataSource)}>
            <option value="alerts">Alerts</option>
            <option value="devices">Devices</option>
          </select>
        </Field>

        <Field label="Search Query (CBC syntax)">
          <input style={inputStyle} value={form.search_query} onChange={e => set("search_query", e.target.value)} required />
        </Field>

        <Field label="Group By Field">
          <select style={inputStyle} value={form.group_by} onChange={e => set("group_by", e.target.value)}>
            {groupByFields.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </Field>

        <Field label="Chart Style">
          <select style={inputStyle} value={form.chart_style} onChange={e => set("chart_style", e.target.value as ChartStyle)}>
            <option value="bar">Bar</option>
            <option value="pie">Pie</option>
            <option value="line">Line</option>
            <option value="list">List</option>
          </select>
        </Field>

        {/* Alerts-specific fields */}
        {form.data_source === "alerts" && <>
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
          <Checkbox id="include_all" checked={form.include_all_alerts} onChange={v => set("include_all_alerts", v)}>
            Include all alerts <span style={{ color: "#585b70", fontSize: 11 }}>(unchecked = open only)</span>
          </Checkbox>
        </>}

        {/* Devices-specific fields */}
        {form.data_source === "devices" && <>
          <Checkbox id="active_only" checked={form.active_devices_only} onChange={v => set("active_devices_only", v)}>
            Active devices only <span style={{ color: "#585b70", fontSize: 11 }}>(unchecked = all statuses)</span>
          </Checkbox>
        </>}

        <Field label="Poll Interval">
          <div style={{ display: "flex", gap: 8 }}>
            <input
              style={{ ...inputStyle, width: 80 }}
              type="number"
              min={1}
              value={pollValue}
              onChange={e => setPollValue(Math.max(1, parseInt(e.target.value) || 1))}
              required
            />
            <select style={{ ...inputStyle, flex: 1 }} value={pollUnit} onChange={e => setPollUnit(e.target.value as "minutes" | "hours" | "days")}>
              <option value="minutes">Minutes</option>
              <option value="hours">Hours</option>
              <option value="days">Days</option>
            </select>
          </div>
        </Field>

        {form.chart_style === "list" && (
          <Field label="Row Limit">
            <input style={inputStyle} type="number" min={1} value={form.row_limit ?? 25} onChange={e => set("row_limit", parseInt(e.target.value))} />
          </Field>
        )}

        {error && (
          <div style={{ color: "#f38ba8", fontSize: 12, marginTop: 12 }}>Error: {error}</div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "flex-end" }}>
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

function Checkbox({ id, checked, onChange, children }: { id: string; checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
      <input type="checkbox" id={id} checked={checked} onChange={e => onChange(e.target.checked)} style={{ width: 14, height: 14, cursor: "pointer" }} />
      <label htmlFor={id} style={{ fontSize: 13, color: "#cdd6f4", cursor: "pointer" }}>{children}</label>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)",
  display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
};
const modalStyle: React.CSSProperties = {
  background: "#1e1e2e", border: "1px solid #333", borderRadius: 10,
  padding: 24, width: 440, maxWidth: "95vw", maxHeight: "90vh", overflowY: "auto",
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
