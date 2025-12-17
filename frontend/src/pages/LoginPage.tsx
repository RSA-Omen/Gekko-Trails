import { useState, FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useRole } from "../contexts/RoleContext";

export function LoginPage() {
  const navigate = useNavigate();
  const { setCurrentRole, setCurrentCardholderId } = useRole();
  const [selectedRole, setSelectedRole] = useState<"admin" | "finance" | "cardholder" | "manager" | "">("");
  const [cardholderId, setCardholderId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const handleLogin = (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!selectedRole) {
      setError("Please select a role");
      return;
    }

    if ((selectedRole === "cardholder" || selectedRole === "manager") && !cardholderId.trim()) {
      setError("Please enter a Cardholder ID");
      return;
    }

    const cardholderIdNum = selectedRole === "cardholder" || selectedRole === "manager" 
      ? parseInt(cardholderId.trim(), 10) 
      : null;

    if ((selectedRole === "cardholder" || selectedRole === "manager") && (isNaN(cardholderIdNum!) || cardholderIdNum! <= 0)) {
      setError("Cardholder ID must be a positive number");
      return;
    }

    // Set role and cardholder ID
    setCurrentRole(selectedRole);
    setCurrentCardholderId(cardholderIdNum);

    // Navigate to appropriate dashboard
    if (selectedRole === "admin" || selectedRole === "finance") {
      navigate("/admin");
    } else if (selectedRole === "cardholder") {
      navigate("/cardholder");
    } else if (selectedRole === "manager") {
      navigate("/manager");
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)",
      padding: "2rem",
    }}>
      <div style={{
        background: "rgba(15, 23, 42, 0.95)",
        padding: "2.5rem",
        borderRadius: "1rem",
        border: "1px solid rgba(148, 163, 184, 0.2)",
        boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.3)",
        maxWidth: "450px",
        width: "100%",
      }}>
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <h1 style={{ 
            margin: 0, 
            fontSize: "2rem", 
            fontWeight: "bold",
            background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
            backgroundClip: "text",
          }}>
            Gekko Tracks
          </h1>
          <p style={{ marginTop: "0.5rem", opacity: 0.7, fontSize: "0.9rem" }}>
            Mock Authentication (Testing Mode)
          </p>
        </div>

        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: "1.5rem" }}>
            <label style={{ 
              display: "block", 
              marginBottom: "0.5rem", 
              fontSize: "0.9rem",
              fontWeight: "500",
              color: "#e5e7eb",
            }}>
              Select Role
            </label>
            <select
              value={selectedRole}
              onChange={(e) => {
                setSelectedRole(e.target.value as typeof selectedRole);
                setError(null);
              }}
              required
              style={{
                width: "100%",
                padding: "0.75rem",
                background: "rgba(15, 23, 42, 0.8)",
                border: "1px solid rgba(148, 163, 184, 0.3)",
                borderRadius: "0.5rem",
                color: "#e5e7eb",
                fontSize: "0.9rem",
                cursor: "pointer",
              }}
            >
              <option value="">-- Select Role --</option>
              <option value="admin">Admin</option>
              <option value="finance">Finance</option>
              <option value="cardholder">Cardholder</option>
              <option value="manager">Manager</option>
            </select>
          </div>

          {(selectedRole === "cardholder" || selectedRole === "manager") && (
            <div style={{ marginBottom: "1.5rem" }}>
              <label style={{ 
                display: "block", 
                marginBottom: "0.5rem", 
                fontSize: "0.9rem",
                fontWeight: "500",
                color: "#e5e7eb",
              }}>
                Cardholder ID
              </label>
              <input
                type="number"
                value={cardholderId}
                onChange={(e) => {
                  setCardholderId(e.target.value);
                  setError(null);
                }}
                placeholder="Enter Cardholder ID"
                required
                min="1"
                style={{
                  width: "100%",
                  padding: "0.75rem",
                  background: "rgba(15, 23, 42, 0.8)",
                  border: "1px solid rgba(148, 163, 184, 0.3)",
                  borderRadius: "0.5rem",
                  color: "#e5e7eb",
                  fontSize: "0.9rem",
                }}
              />
              <p style={{ 
                marginTop: "0.5rem", 
                fontSize: "0.75rem", 
                opacity: 0.7,
                color: "#94a3b8",
              }}>
                {selectedRole === "manager" 
                  ? "Enter a Cardholder ID to look up the manager"
                  : "Enter your Cardholder ID to view your transactions"}
              </p>
            </div>
          )}

          {error && (
            <div style={{
              marginBottom: "1rem",
              padding: "0.75rem",
              background: "rgba(239, 68, 68, 0.1)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              borderRadius: "0.5rem",
              color: "#fecaca",
              fontSize: "0.85rem",
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            style={{
              width: "100%",
              padding: "0.75rem",
              background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)",
              border: "none",
              borderRadius: "0.5rem",
              color: "#fff",
              fontSize: "1rem",
              fontWeight: "600",
              cursor: "pointer",
              transition: "opacity 0.2s",
            }}
            onMouseOver={(e) => e.currentTarget.style.opacity = "0.9"}
            onMouseOut={(e) => e.currentTarget.style.opacity = "1"}
          >
            Sign In
          </button>
        </form>

        <div style={{
          marginTop: "1.5rem",
          padding: "1rem",
          background: "rgba(99, 102, 241, 0.1)",
          borderRadius: "0.5rem",
          border: "1px solid rgba(99, 102, 241, 0.2)",
        }}>
          <p style={{ 
            margin: 0, 
            fontSize: "0.75rem", 
            opacity: 0.8,
            color: "#a5b4fc",
            lineHeight: "1.5",
          }}>
            <strong>Note:</strong> This is a mock authentication system for testing. 
            In production, authentication will be handled via Azure AD SSO.
          </p>
        </div>
      </div>
    </div>
  );
}

