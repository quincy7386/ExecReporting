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

// --- Widgets ---

export type ChartStyle = "pie" | "bar" | "line" | "list";

export interface Widget {
  id: number;
  title: string;
  search_query: string;
  group_by: string;
  chart_style: ChartStyle;
  poll_interval: number;
  row_limit: number | null;
  position_x: number;
  position_y: number;
  width: number;
  height: number;
  enabled: boolean;
}

export type WidgetPayload = Omit<Widget, "id">;

export const listWidgets = () => api.get<Widget[]>("/widgets").then(r => r.data);
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
