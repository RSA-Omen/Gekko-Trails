import { Routes, Route, Navigate, Link } from "react-router-dom";
import { AdminFinanceDashboard } from "./pages/AdminFinanceDashboard";
import { CardholderDashboard } from "./pages/CardholderDashboard";
import { ManagerDashboard } from "./pages/ManagerDashboard";

export function App() {
  return (
    <div className="app-root">
      <header className="app-header">
        <div className="brand">Gekko Tracks</div>
        <nav className="nav-links">
          <Link to="/admin">Admin / Finance</Link>
          <Link to="/cardholder">Cardholder</Link>
          <Link to="/manager">Manager</Link>
        </nav>
      </header>

      <main className="app-main">
        <Routes>
          <Route path="/" element={<Navigate to="/admin" replace />} />
          <Route path="/admin" element={<AdminFinanceDashboard />} />
          <Route path="/cardholder" element={<CardholderDashboard />} />
          <Route path="/manager" element={<ManagerDashboard />} />
          <Route path="*" element={<div>Not found</div>} />
        </Routes>
      </main>
    </div>
  );
}


