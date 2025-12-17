import { Routes, Route, Navigate, Link, useNavigate } from "react-router-dom";
import { AdminFinanceDashboard } from "./pages/AdminFinanceDashboard";
import { CardholderDashboard } from "./pages/CardholderDashboard";
import { ManagerDashboard } from "./pages/ManagerDashboard";
import { LoginPage } from "./pages/LoginPage";
import { useRole } from "./contexts/RoleContext";

function ProtectedRoute({ children, requiredRole }: { children: React.ReactNode; requiredRole?: "admin" | "finance" | "cardholder" | "manager" }) {
  const { currentRole } = useRole();
  const navigate = useNavigate();

  if (!currentRole) {
    navigate("/login");
    return null;
  }

  if (requiredRole && currentRole !== requiredRole && !(requiredRole === "admin" && currentRole === "finance") && !(requiredRole === "finance" && currentRole === "admin")) {
    navigate("/login");
    return null;
  }

  return <>{children}</>;
}

function Header() {
  const { currentRole, currentCardholderId, setCurrentRole, setCurrentCardholderId } = useRole();
  const navigate = useNavigate();

  const handleLogout = () => {
    setCurrentRole(null);
    setCurrentCardholderId(null);
    navigate("/login");
  };

  if (!currentRole) {
    return null;
  }

  return (
    <header className="app-header">
      <div className="brand">Gekko Tracks</div>
      <nav className="nav-links" style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
        {(currentRole === "admin" || currentRole === "finance") && (
          <Link to="/admin">Admin / Finance</Link>
        )}
        {currentRole === "cardholder" && (
          <Link to="/cardholder">Cardholder</Link>
        )}
        {currentRole === "manager" && (
          <Link to="/manager">Manager</Link>
        )}
        <div style={{ 
          display: "flex", 
          alignItems: "center", 
          gap: "0.5rem", 
          fontSize: "0.85rem",
          padding: "0.25rem 0.5rem",
          background: "rgba(99, 102, 241, 0.2)",
          borderRadius: "0.25rem",
        }}>
          <span style={{ opacity: 0.8 }}>
            {currentRole}
            {currentCardholderId && ` (ID: ${currentCardholderId})`}
          </span>
        </div>
        <button
          onClick={handleLogout}
          style={{
            padding: "0.25rem 0.5rem",
            background: "rgba(239, 68, 68, 0.2)",
            border: "1px solid rgba(239, 68, 68, 0.3)",
            borderRadius: "0.25rem",
            color: "#fecaca",
            fontSize: "0.85rem",
            cursor: "pointer",
          }}
        >
          Logout
        </button>
      </nav>
    </header>
  );
}

function RootRedirect() {
  const { currentRole } = useRole();
  
  if (currentRole) {
    if (currentRole === "admin" || currentRole === "finance") {
      return <Navigate to="/admin" replace />;
    } else if (currentRole === "cardholder") {
      return <Navigate to="/cardholder" replace />;
    } else if (currentRole === "manager") {
      return <Navigate to="/manager" replace />;
    }
  }
  return <Navigate to="/login" replace />;
}

export function App() {
  return (
    <div className="app-root">
      <Header />
      <main className="app-main">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<RootRedirect />} />
          <Route 
            path="/admin" 
            element={
              <ProtectedRoute requiredRole="admin">
                <AdminFinanceDashboard />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/cardholder" 
            element={
              <ProtectedRoute requiredRole="cardholder">
                <CardholderDashboard />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="/manager" 
            element={
              <ProtectedRoute requiredRole="manager">
                <ManagerDashboard />
              </ProtectedRoute>
            } 
          />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </main>
    </div>
  );
}


