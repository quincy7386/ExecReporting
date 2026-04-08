import { useEffect, useState } from "react";
import { getCredentials, saveCredentials, updateCredentials, testCredentials } from "../api";
import type { CredentialsPayload } from "../api";

export default function Settings() {
  const [form, setForm] = useState<CredentialsPayload>({ hostname: "", org_key: "", api_id: "", api_secret: "" });
  const [configured, setConfigured] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    getCredentials().then(c => {
      setConfigured(c.configured);
      if (c.configured) setForm(f => ({ ...f, hostname: c.hostname, org_key: c.org_key, api_id: c.api_id }));
    });
  }, []);

  const set = (field: keyof CredentialsPayload, value: string) =>
    setForm(f => ({ ...f, [field]: value }));

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus(null);
    try {
      if (configured) await updateCredentials(form);
      else await saveCredentials(form);
      setConfigured(true);
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setStatus(null);
    try {
      const result = await testCredentials();
      setStatus(result.ok ? `ok:Connected — ${result.num_found?.toLocaleString()} alerts found.` : `error:${result.error}`);
    } catch {
      setStatus("error:Connection test failed.");
    } finally {
      setTesting(false);
    }
  };

  const isOk = status === "saved" || status?.startsWith("ok:");
  const statusMsg = status === "saved" ? "Credentials saved." : status?.startsWith("ok:") ? status.slice(3) : status?.startsWith("error:") ? status.slice(6) : status;

  return (
    <div style={{ maxWidth: 520, margin: "32px auto", padding: "0 20px" }}>
      {/* Page header */}
      <div style={{ marginBottom: 20, paddingBottom: 12, borderBottom: "1px solid var(--border)" }}>
        <h1 style={{ fontSize: 18 }}>Settings</h1>
        <p style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 4 }}>
          Carbon Black Cloud API credentials
        </p>
      </div>

      <div style={{
        background: "var(--bg-card)",
        border: "1px solid var(--border)",
        borderRadius: 4,
        overflow: "hidden",
      }}>
        {/* Panel header */}
        <div style={{
          background: "var(--bg-dark)",
          borderBottom: "1px solid var(--border)",
          padding: "10px 16px",
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>API Credentials</span>
        </div>

        <form onSubmit={handleSave} style={{ padding: 20 }}>
          <Field label="Hostname">
            <input style={inputStyle} placeholder="defense.conferdeploy.net" value={form.hostname} onChange={e => set("hostname", e.target.value)} required />
          </Field>
          <Field label="Org Key">
            <input style={inputStyle} value={form.org_key} onChange={e => set("org_key", e.target.value)} required />
          </Field>
          <Field label="API ID">
            <input style={inputStyle} value={form.api_id} onChange={e => set("api_id", e.target.value)} required />
          </Field>
          <Field label="API Secret">
            <input style={inputStyle} type="password" placeholder={configured ? "(unchanged — leave blank to keep current)" : ""} value={form.api_secret} onChange={e => set("api_secret", e.target.value)} required={!configured} />
          </Field>

          {status && (
            <div style={{
              fontSize: 12, padding: "8px 10px", borderRadius: 3, margin: "8px 0 12px",
              background: isOk ? "rgba(45,184,122,0.1)" : "rgba(224,92,92,0.1)",
              border: `1px solid ${isOk ? "rgba(45,184,122,0.3)" : "rgba(224,92,92,0.3)"}`,
              color: isOk ? "var(--green)" : "var(--red)",
            }}>
              {statusMsg}
            </div>
          )}

          <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
            <button type="submit" style={primaryBtn}>{configured ? "Update" : "Save"}</button>
            {configured && (
              <button type="button" onClick={handleTest} disabled={testing} style={outlineBtn}>
                {testing ? "Testing…" : "Test Connection"}
              </button>
            )}
          </div>
        </form>
      </div>
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

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "7px 10px",
  background: "var(--bg-input)", border: "1px solid var(--border)",
  borderRadius: 3, color: "var(--text)", fontSize: 13, outline: "none",
};
const primaryBtn: React.CSSProperties = {
  padding: "7px 16px", background: "var(--blue)", color: "#fff",
  border: "1px solid var(--blue)", borderRadius: 3, cursor: "pointer", fontSize: 13, fontFamily: "inherit",
};
const outlineBtn: React.CSSProperties = {
  padding: "7px 16px", background: "transparent", color: "var(--blue-link)",
  border: "1px solid var(--blue-link)", borderRadius: 3, cursor: "pointer", fontSize: 13, fontFamily: "inherit",
};
