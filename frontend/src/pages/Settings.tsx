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
    try {
      if (configured) await updateCredentials(form);
      else await saveCredentials(form);
      setConfigured(true);
      setStatus("Saved successfully.");
    } catch {
      setStatus("Save failed. Check console.");
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setStatus(null);
    try {
      const result = await testCredentials();
      setStatus(result.ok ? `Connected. ${result.num_found?.toLocaleString()} alerts found.` : `Failed: ${result.error}`);
    } catch {
      setStatus("Connection test failed.");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div style={{ maxWidth: 480, margin: "40px auto", padding: "0 16px" }}>
      <h1 style={{ color: "#cdd6f4", marginBottom: 24 }}>CBC Credentials</h1>
      <form onSubmit={handleSave} style={{ background: "#1e1e2e", border: "1px solid #333", borderRadius: 10, padding: 24 }}>
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
          <input style={inputStyle} type="password" placeholder={configured ? "(unchanged)" : ""} value={form.api_secret} onChange={e => set("api_secret", e.target.value)} required={!configured} />
        </Field>

        {status && (
          <div style={{ fontSize: 13, margin: "12px 0", color: status.startsWith("Connected") || status.startsWith("Saved") ? "#a6e3a1" : "#f38ba8" }}>
            {status}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
          <button type="submit" style={primaryBtn}>{configured ? "Update" : "Save"}</button>
          {configured && (
            <button type="button" onClick={handleTest} disabled={testing} style={secondaryBtn}>
              {testing ? "Testing…" : "Test Connection"}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: "block", fontSize: 12, color: "#89b4fa", marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}

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
