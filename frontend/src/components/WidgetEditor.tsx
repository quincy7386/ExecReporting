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

// All fields tagged OBSERVATION or OBSERVATION_DETAILS per CBC platform search fields docs
const OBSERVATION_GROUP_BY_FIELDS = [
  "alert_category","alert_id","attack_tactic","attack_technique",
  "backend_timestamp","blocked_effective_reputation","blocked_hash","blocked_name",
  "childproc_cmdline","childproc_cmdline_length","childproc_cmdline_raw","childproc_count",
  "childproc_effective_reputation","childproc_effective_reputation_source",
  "childproc_guid","childproc_hash","childproc_issuer","childproc_name","childproc_pid",
  "childproc_product_name","childproc_publisher","childproc_publisher_state",
  "childproc_reputation",
  "crossproc_action","crossproc_api","crossproc_cmdline","crossproc_cmdline_length",
  "crossproc_count","crossproc_effective_reputation","crossproc_effective_reputation_source",
  "crossproc_excluded_count","crossproc_guid","crossproc_hash","crossproc_issuer",
  "crossproc_name","crossproc_pid","crossproc_product_name","crossproc_publisher",
  "crossproc_publisher_state","crossproc_reputation","crossproc_target","crossproc_username",
  "device_external_ip","device_group","device_group_id","device_id","device_installed_by",
  "device_internal_ip","device_location","device_name","device_os","device_os_version",
  "device_policy","device_policy_id","device_sensor_version","device_target_priority",
  "device_timestamp",
  "enriched","enriched_event_type",
  "event_attack_stage","event_description","event_id","event_threat_score","event_type",
  "file_scan_result",
  "fileless_scriptload_cmdline_raw","fileless_scriptload_hash",
  "filemod_action","filemod_count","filemod_hash","filemod_issuer","filemod_name",
  "filemod_publisher","filemod_publisher_state","filemod_reputation","filemod_type",
  "ingress_time","legacy",
  "modload_count","modload_hash","modload_issuer",
  "netconn_action","netconn_actions","netconn_application_protocol",
  "netconn_bytes_received","netconn_bytes_sent","netconn_community_id","netconn_count",
  "netconn_dns_answer_class","netconn_dns_answer_count","netconn_dns_answer_data",
  "netconn_dns_answer_data_length","netconn_dns_answer_name","netconn_dns_answer_ttl",
  "netconn_dns_answer_type","netconn_dns_flags","netconn_dns_query_class",
  "netconn_dns_query_name","netconn_dns_query_type","netconn_domain","netconn_failed",
  "netconn_first_packet_timestamp","netconn_inbound","netconn_ipv4","netconn_ipv6",
  "netconn_ja3_local_fingerprint","netconn_ja3_local_fingerprint_fields",
  "netconn_ja3_remote_fingerprint","netconn_ja3_remote_fingerprint_fields",
  "netconn_last_packet_timestamp","netconn_listen",
  "netconn_local_ipv4","netconn_local_ipv6","netconn_local_location","netconn_local_port",
  "netconn_location","netconn_port","netconn_protocol",
  "netconn_remote_device_id","netconn_remote_device_name",
  "netconn_request_headers","netconn_request_method","netconn_request_url",
  "netconn_response_headers","netconn_response_status_code","netconn_server_name_indication",
  "netconn_tls_certificate_issuer_name","netconn_tls_certificate_subject_name",
  "netconn_tls_certificate_subject_not_valid_after","netconn_tls_certificate_subject_not_valid_before",
  "netconn_tls_cipher","netconn_tls_version",
  "network_traffic_analysis_action","network_traffic_analysis_behavior",
  "network_traffic_analysis_identifier","network_traffic_analysis_is_client_relevant",
  "network_traffic_analysis_is_client_target","network_traffic_analysis_primary_alert",
  "observation_description","observation_id","observation_type","org_id",
  "parent_cmdline","parent_cmdline_length","parent_cmdline_raw",
  "parent_effective_reputation","parent_effective_reputation_source","parent_guid",
  "parent_hash","parent_issuer","parent_name","parent_pid","parent_product_name",
  "parent_publisher","parent_publisher_state","parent_reputation","parent_username",
  "process_cmdline","process_cmdline_length","process_cmdline_raw",
  "process_company_name","process_copyright","process_duration",
  "process_effective_reputation","process_effective_reputation_source","process_elevated",
  "process_end_time","process_file_description","process_file_size","process_guid",
  "process_hash","process_integrity_level","process_internal_name","process_issuer",
  "process_loaded_script_hash","process_name","process_original_filename","process_pid",
  "process_private_build","process_privileges","process_product_name",
  "process_product_version","process_publisher","process_publisher_state",
  "process_reputation","process_service_name","process_sha256","process_special_build",
  "process_start_time","process_terminated","process_trademark","process_user_id",
  "process_username",
  "regmod_action","regmod_count","regmod_name",
  "rule_config_id","rule_config_name","rule_id",
  "scriptload_content","scriptload_content_length","scriptload_count","scriptload_hash",
  "scriptload_issuer","scriptload_name","scriptload_publisher_state",
  "sensor_action","threat_name","tms_rule_id","ttp","watchlist_hit",
];

const PROCESS_GROUP_BY_FIELDS = [
  "alert_category","alert_id","backend_timestamp",
  "blocked_effective_reputation","blocked_hash","blocked_name",
  "childproc_cmdline_raw","childproc_count",
  "container_cgroup","container_id","container_image_hash","container_image_name",
  "container_name",
  "crossproc_count","crossproc_excluded_count",
  "device_external_ip","device_group","device_group_id","device_id","device_installed_by",
  "device_internal_ip","device_location","device_name","device_os","device_os_version",
  "device_policy","device_policy_id","device_sensor_version","device_target_priority",
  "device_timestamp",
  "enriched","enriched_event_type",
  "event_attack_stage","event_threat_score","event_type",
  "file_scan_result",
  "fileless_scriptload_cmdline_raw",
  "filemod_count",
  "ingress_time","legacy",
  "modload_count",
  "netconn_count","netconn_dns_answer_class","netconn_dns_answer_count",
  "netconn_dns_answer_data","netconn_dns_answer_data_length","netconn_dns_answer_name",
  "netconn_dns_answer_ttl","netconn_dns_answer_type","netconn_dns_flags",
  "netconn_dns_query_class","netconn_dns_query_name","netconn_dns_query_type",
  "netconn_location","netconn_request_url","netconn_tls_cipher",
  "org_id",
  "parent_cmdline","parent_cmdline_length","parent_cmdline_raw",
  "parent_effective_reputation","parent_effective_reputation_source","parent_guid",
  "parent_hash","parent_issuer","parent_name","parent_pid","parent_product_name",
  "parent_publisher","parent_publisher_state","parent_reputation","parent_username",
  "process_cmdline","process_cmdline_length","process_cmdline_raw",
  "process_company_name","process_container_pid","process_copyright","process_duration",
  "process_effective_reputation","process_effective_reputation_source","process_elevated",
  "process_end_time","process_file_description","process_file_size","process_guid",
  "process_hash","process_integrity_level","process_internal_name","process_issuer",
  "process_name","process_original_filename","process_pid","process_private_build",
  "process_privileges","process_product_name","process_product_version","process_publisher",
  "process_publisher_state","process_reputation","process_service_name","process_sha256",
  "process_special_build","process_start_time","process_terminated","process_trademark",
  "process_user_id","process_username",
  "regmod_count","report_id","rule_config_id","rule_config_name",
  "scriptload_count","sensor_action","ttp","watchlist_hit","watchlist_id","watchlist_name",
];

const VULN_GROUP_BY_FIELDS = [
  // Executive / risk summary
  "vuln_info.severity",
  "category",
  "os_info.os_type",
  "product_info.vendor",
  "product_info.product",
  // SOC / exploitability
  "vuln_info.easily_exploitable",
  "vuln_info.malware_exploitable",
  "vuln_info.active_internet_breach",
  "vuln_info.cve_id",
  "vuln_info.cvss_access_vector",
  "vuln_info.cvss_access_complexity",
  "vuln_info.cvss_authentication",
  "vuln_info.risk_meter_score",
  // Device / OS detail
  "os_info.os_name",
  "os_info.os_arch",
  "os_info.os_version",
];

const AUDIT_LOG_GROUP_BY_FIELDS = [
  "actor","actor_ip","description","flagged","verbose",
];


interface Props {
  initial?: Widget;
  onSave: (payload: WidgetPayload) => void;
  onCancel: () => void;
  error?: string | null;
}

const defaultForm: WidgetPayload = {
  dashboard_id: null,
  title: "",
  data_source: "alerts",
  search_query: "*",
  group_by: "severity",
  chart_style: "bar",
  poll_interval: 60,
  time_range: "-2w",
  include_all_alerts: false,
  active_devices_only: true,
  sort_order: "desc",
  list_columns: null,
  agg_field: null,
  agg_func: "count",
  line_split_by: null,
  bar_split_by: null,
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
    setForm(f => ({
      ...f,
      [field]: value,
      ...(field === "chart_style" && value !== "list" ? { row_limit: null } : {}),
      ...(field === "chart_style" && value !== "line" ? { line_split_by: null } : {}),
      ...(field === "chart_style" && value !== "bar" ? { bar_split_by: null } : {}),
    }));

  const handleDataSourceChange = (src: DataSource) => {
    const defaultGroupBy =
      src === "devices" ? "os" :
      src === "observations" ? "process_name" :
      src === "process_search" ? "process_name" :
      src === "vulnerability_assessment" ? "vuln_info.severity" :
      src === "audit_logs" ? "actor" :
      "severity";
    setForm(f => ({ ...f, data_source: src, group_by: defaultGroupBy, list_columns: null }));
  };

  const groupByFields =
    form.data_source === "devices" ? DEVICE_GROUP_BY_FIELDS :
    form.data_source === "observations" ? OBSERVATION_GROUP_BY_FIELDS :
    form.data_source === "process_search" ? PROCESS_GROUP_BY_FIELDS :
    form.data_source === "vulnerability_assessment" ? VULN_GROUP_BY_FIELDS :
    form.data_source === "audit_logs" ? AUDIT_LOG_GROUP_BY_FIELDS :
    ALERT_GROUP_BY_FIELDS;


  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onSave(form);
  };

  const supportsTimeRange = form.data_source === "alerts" || form.data_source === "observations"
    || form.data_source === "process_search" || form.data_source === "audit_logs";

  return (
    <div style={overlayStyle}>
      <form onSubmit={handleSubmit} style={modalStyle}>
        {/* Modal header */}
        <div style={{
          background: "var(--bg-dark)", borderBottom: "1px solid var(--border)",
          padding: "12px 20px", margin: "-20px -20px 20px",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, color: "var(--text)", margin: 0 }}>
            {initial ? "Edit Widget" : "New Widget"}
          </h2>
          <button type="button" onClick={onCancel} style={iconBtn}>✕</button>
        </div>

        <Field label="Title">
          <input style={inputStyle} value={form.title} onChange={e => set("title", e.target.value)} required />
        </Field>

        <Field label="Data Source">
          <select style={inputStyle} value={form.data_source} onChange={e => handleDataSourceChange(e.target.value as DataSource)}>
            <option value="alerts">Alerts</option>
            <option value="devices">Devices</option>
            <option value="observations">Observations (Endpoint Standard)</option>
            <option value="process_search">Process Search (Enterprise EDR)</option>
            <option value="vulnerability_assessment">Vulnerability Assessment</option>
            <option value="audit_logs">Audit Logs</option>
          </select>
        </Field>

        <Field label="Search Query (CBC syntax)">
          <input style={inputStyle} value={form.search_query} onChange={e => set("search_query", e.target.value)} required />
        </Field>

        <Field label="Group By Field (type to search)">
          <input
            style={inputStyle}
            list={`group-by-${form.data_source}`}
            value={form.group_by}
            onChange={e => set("group_by", e.target.value)}
            placeholder="Type to search fields…"
            required
          />
          <datalist id={`group-by-${form.data_source}`}>
            {groupByFields.map(f => <option key={f} value={f} />)}
          </datalist>
        </Field>

        <Field label="Aggregate Function">
          <select style={inputStyle} value={form.agg_func} onChange={e => set("agg_func", e.target.value)}>
            <option value="count">Count (number of records)</option>
            <option value="sum">Sum</option>
            <option value="avg">Average</option>
            <option value="max">Max</option>
            <option value="min">Min</option>
          </select>
        </Field>

        {form.agg_func !== "count" && (
          <Field label="Aggregate Field (type to search)">
            <input
              style={inputStyle}
              list={`agg-field-${form.data_source}`}
              value={form.agg_field ?? ""}
              onChange={e => set("agg_field", e.target.value || null)}
              placeholder="Field to aggregate…"
              required
            />
            <datalist id={`agg-field-${form.data_source}`}>
              {groupByFields.map(f => <option key={f} value={f} />)}
            </datalist>
          </Field>
        )}

        <Field label="Sort Order">
          <select style={inputStyle} value={form.sort_order} onChange={e => set("sort_order", e.target.value)}>
            <option value="desc">Descending (highest first)</option>
            <option value="asc">Ascending (lowest first)</option>
          </select>
        </Field>

        <Field label="Chart Style">
          <select style={inputStyle} value={form.chart_style} onChange={e => set("chart_style", e.target.value as ChartStyle)}>
            <option value="bar">Bar</option>
            <option value="pie">Pie</option>
            <option value="line">Line (trend over time)</option>
            <option value="list">List</option>
          </select>
        </Field>

        {form.chart_style === "line" && form.data_source !== "vulnerability_assessment" && (
          <Field label="Split by field (optional)">
            <input
              style={inputStyle}
              list={`split-by-${form.data_source}`}
              value={form.line_split_by ?? ""}
              onChange={e => set("line_split_by", e.target.value || null)}
              placeholder="e.g. severity — up to 6 series"
            />
            <datalist id={`split-by-${form.data_source}`}>
              {groupByFields.map(f => <option key={f} value={f} />)}
            </datalist>
          </Field>
        )}

        {form.chart_style === "bar" && (
          <Field label="Stack by field (optional)">
            <input
              style={inputStyle}
              list={`bar-split-by-${form.data_source}`}
              value={form.bar_split_by ?? ""}
              onChange={e => set("bar_split_by", e.target.value || null)}
              placeholder="e.g. device_os — up to 8 segments"
            />
            <datalist id={`bar-split-by-${form.data_source}`}>
              {groupByFields.map(f => <option key={f} value={f} />)}
            </datalist>
          </Field>
        )}

        {supportsTimeRange && (
          <>
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
            {form.data_source === "alerts" && (
              <Checkbox id="include_all" checked={form.include_all_alerts} onChange={v => set("include_all_alerts", v)}>
                Include all alerts <span style={{ color: "var(--text-muted)", fontSize: 11 }}>(unchecked = open only)</span>
              </Checkbox>
            )}
          </>
        )}

        {form.data_source === "devices" && (
          <Checkbox id="active_only" checked={form.active_devices_only} onChange={v => set("active_devices_only", v)}>
            Active devices only <span style={{ color: "var(--text-muted)", fontSize: 11 }}>(unchecked = all statuses)</span>
          </Checkbox>
        )}

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
          <div style={{
            color: "var(--red)", fontSize: 12, marginTop: 8, padding: "6px 10px",
            background: "rgba(224,92,92,0.1)", border: "1px solid rgba(224,92,92,0.3)", borderRadius: 3,
          }}>
            Error: {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
          <button type="button" onClick={onCancel} style={outlineBtn}>Cancel</button>
          <button type="submit" style={primaryBtn}>Save</button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "var(--text-muted)", marginBottom: 5, textTransform: "uppercase", letterSpacing: 0.5 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function Checkbox({ id, checked, onChange, children }: { id: string; checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
      <input
        type="checkbox" id={id} checked={checked}
        onChange={e => onChange(e.target.checked)}
        style={{ width: 14, height: 14, cursor: "pointer", accentColor: "var(--blue-link)" }}
      />
      <label htmlFor={id} style={{ fontSize: 13, color: "var(--text)", cursor: "pointer" }}>{children}</label>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: "fixed", inset: 0, background: "rgba(0,0,0,0.65)",
  display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
};
const modalStyle: React.CSSProperties = {
  background: "var(--bg-card)",
  border: "1px solid var(--border)",
  borderRadius: 4,
  padding: 20,
  width: 460,
  maxWidth: "95vw",
  maxHeight: "90vh",
  overflowY: "auto",
};
const inputStyle: React.CSSProperties = {
  width: "100%", padding: "7px 10px",
  background: "var(--bg-input)", border: "1px solid var(--border)",
  borderRadius: 3, color: "var(--text)", fontSize: 13, outline: "none", fontFamily: "inherit",
};
const primaryBtn: React.CSSProperties = {
  padding: "7px 18px", background: "var(--blue)", color: "#fff",
  border: "1px solid var(--blue)", borderRadius: 3, cursor: "pointer", fontSize: 13, fontFamily: "inherit",
};
const outlineBtn: React.CSSProperties = {
  padding: "7px 18px", background: "transparent", color: "var(--blue-link)",
  border: "1px solid var(--blue-link)", borderRadius: 3, cursor: "pointer", fontSize: 13, fontFamily: "inherit",
};
const iconBtn: React.CSSProperties = {
  background: "none", border: "none", color: "var(--text-muted)",
  cursor: "pointer", fontSize: 14, padding: "2px 4px", lineHeight: 1, fontFamily: "inherit",
};
