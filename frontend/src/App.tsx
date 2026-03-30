import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Settings from "./pages/Settings";

export default function App() {
  return (
    <BrowserRouter>
      <div style={{ minHeight: "100vh", background: "#181825", fontFamily: "system-ui, sans-serif" }}>
        <nav style={{ background: "#1e1e2e", borderBottom: "1px solid #333", padding: "0 24px", display: "flex", alignItems: "center", gap: 24, height: 48 }}>
          <span style={{ color: "#89b4fa", fontWeight: 700, fontSize: 15 }}>ExecReporting</span>
          <NavLink to="/" end style={navLink}>Dashboard</NavLink>
          <NavLink to="/settings" style={navLink}>Settings</NavLink>
        </nav>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

const navLink = ({ isActive }: { isActive: boolean }): React.CSSProperties => ({
  color: isActive ? "#cdd6f4" : "#585b70",
  textDecoration: "none",
  fontSize: 14,
  fontWeight: isActive ? 600 : 400,
});
