import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Settings from "./pages/Settings";

export default function App() {
  return (
    <BrowserRouter>
      <div style={{ minHeight: "100vh", background: "var(--bg-main)", display: "flex", flexDirection: "column" }}>

        {/* Top nav bar */}
        <header style={{
          background: "var(--bg-darkest)",
          borderBottom: "1px solid var(--border)",
          height: 48,
          display: "flex",
          alignItems: "center",
          padding: "0 20px",
          gap: 0,
          flexShrink: 0,
        }}>
          {/* Logo */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginRight: 32 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" fill="#1255a0" />
              <circle cx="12" cy="12" r="5" fill="#4a9fd4" />
              <circle cx="12" cy="12" r="2" fill="#fff" />
            </svg>
            <span style={{ color: "#fff", fontWeight: 600, fontSize: 14, letterSpacing: 0.2 }}>Carbon Black Cloud</span>
          </div>

          {/* Nav links */}
          <nav style={{ display: "flex", height: "100%" }}>
            <NavLink to="/" end style={navLink}>Dashboard</NavLink>
            <NavLink to="/settings" style={navLink}>Settings</NavLink>
          </nav>
        </header>

        <main style={{ flex: 1, overflow: "auto" }}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

const navLink = ({ isActive }: { isActive: boolean }): React.CSSProperties => ({
  color: isActive ? "#fff" : "var(--text-muted)",
  textDecoration: "none",
  fontSize: 13,
  fontWeight: isActive ? 600 : 400,
  padding: "0 14px",
  height: "100%",
  display: "flex",
  alignItems: "center",
  borderBottom: isActive ? "2px solid var(--blue-link)" : "2px solid transparent",
  transition: "color 0.15s",
});
