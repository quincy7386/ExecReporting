import axios from "axios";

const api = axios.create({ baseURL: "/api" });

// --- Credentials ---

export interface Credentials {
  hostname: string;
  org_key: string;
  api_id: string;
  configured: boolean;
}

export interface CredentialsPayload {
  hostname: string;
  org_key: string;
  api_id: string;
  api_secret: string;
}

export const getCredentials = () => api.get<Credentials>("/credentials").then(r => r.data);
export const saveCredentials = (data: CredentialsPayload) => api.post<Credentials>("/credentials", data).then(r => r.data);
export const updateCredentials = (data: CredentialsPayload) => api.put<Credentials>("/credentials", data).then(r => r.data);
export const testCredentials = () => api.post<{ ok: boolean; error?: string; num_found?: number }>("/credentials/test").then(r => r.data);

// --- Dashboards ---

export interface Dashboard {
  id: number;
  name: string;
  position: number;
}

export type DashboardPayload = Omit<Dashboard, "id">;

export const listDashboards = () => api.get<Dashboard[]>("/dashboards").then(r => r.data);
export const createDashboard = (data: DashboardPayload) => api.post<Dashboard>("/dashboards", data).then(r => r.data);
export const updateDashboard = (id: number, data: DashboardPayload) => api.put<Dashboard>(`/dashboards/${id}`, data).then(r => r.data);
export const deleteDashboard = (id: number) => api.delete(`/dashboards/${id}`);

// --- Widgets ---

export type ChartStyle = "pie" | "bar" | "line" | "list";
export type DataSource = "alerts" | "devices" | "observations" | "process_search" | "vulnerability_assessment" | "audit_logs";

export interface Widget {
  id: number;
  dashboard_id: number | null;
  title: string;
  data_source: DataSource;
  search_query: string;
  group_by: string;
  chart_style: ChartStyle;
  poll_interval: number;
  time_range: string;
  include_all_alerts: boolean;
  active_devices_only: boolean;
  sort_order: string;
  list_columns: string[] | null;
  agg_field: string | null;
  agg_func: string;
  line_split_by: string | null;
  bar_split_by: string | null;
  row_limit: number | null;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  enabled: boolean;
}

export type WidgetPayload = Omit<Widget, "id">;

export const listWidgets = (dashboardId?: number) =>
  api.get<Widget[]>("/widgets", { params: dashboardId != null ? { dashboard_id: dashboardId } : {} }).then(r => r.data);
export const createWidget = (data: WidgetPayload) => api.post<Widget>("/widgets", data).then(r => r.data);
export const updateWidget = (id: number, data: WidgetPayload) => api.put<Widget>(`/widgets/${id}`, data).then(r => r.data);
export const deleteWidget = (id: number) => api.delete(`/widgets/${id}`);

export interface WidgetData {
  status: "ok" | "error" | "pending";
  data: Record<string, unknown>[] | null;
  error: string | null;
  last_updated: string | null;
}

export const getWidgetData = (id: number) => api.get<WidgetData>(`/widgets/${id}/data`).then(r => r.data);
