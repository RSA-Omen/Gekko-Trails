import { useEffect, useState } from "react";
import { useRole } from "../contexts/RoleContext";

type TransactionRow = {
  id: number;
  bank_account: string;
  date: string;
  narrative: string;
  debit_amount: number | null;
  credit_amount: number | null;
  balance: number | null;
  raw_categories: string | null;
  composite_key: string;
};

export function ManagerDashboard() {
  const { currentRole, currentCardholderId } = useRole();
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // For manager, we need to find the manager ID from the cardholder ID
  // In a real system, this would come from SSO, but for now we'll use a workaround
  const [managerId, setManagerId] = useState<number | null>(null);

  useEffect(() => {
    if (currentRole === "manager" && currentCardholderId) {
      // Find manager ID from cardholder's manager relationship
      findManagerId();
    }
  }, [currentRole, currentCardholderId]);

  async function findManagerId() {
    if (!currentCardholderId) return;
    
    try {
      const response = await fetch(`/api/cardholders/${currentCardholderId}`);
      if (response.ok) {
        const cardholder = await response.json();
        if (cardholder.manager?.id) {
          setManagerId(cardholder.manager.id);
        }
      }
    } catch (e) {
      console.error("Failed to find manager ID:", e);
    }
  }

  useEffect(() => {
    if (currentRole === "manager" && managerId) {
      loadTransactions();
    }
  }, [currentRole, managerId]);

  async function loadTransactions() {
    if (!managerId) {
      setError("Manager ID not found. Please ensure the cardholder has an assigned manager.");
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("manager_id", managerId.toString());
      params.set("limit", "100");

      const response = await fetch(`/api/transactions?${params.toString()}`);
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const detail = body?.detail ?? response.statusText;
        throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
      }
      const data = (await response.json()) as { items: TransactionRow[] };
      setTransactions(data.items);
    } catch (e) {
      const err = e as Error;
      setError(err.message || "Failed to load transactions.");
      setTransactions([]);
    } finally {
      setIsLoading(false);
    }
  }

  if (currentRole !== "manager") {
    return (
      <section>
        <h1>Manager Dashboard</h1>
        <p style={{ color: "#fecaca" }}>
          Please select "Manager" role and enter a Cardholder ID (to identify the manager) in the role selector above.
        </p>
        <p style={{ fontSize: "0.9rem", opacity: 0.8 }}>
          Note: In production, manager identity will come from SSO. For testing, we use a cardholder ID to look up the manager.
        </p>
        <div style={{ marginTop: "1rem", padding: "0.75rem", background: "rgba(99, 102, 241, 0.15)", borderRadius: "0.5rem", border: "1px solid rgba(99, 102, 241, 0.3)" }}>
          <div style={{ fontSize: "0.85rem", fontWeight: "bold", marginBottom: "0.5rem", color: "#a5b4fc" }}>
            💡 How to Test Manager View
          </div>
          <div style={{ fontSize: "0.8rem", opacity: 0.9 }}>
            <ol style={{ margin: 0, paddingLeft: "1.5rem" }}>
              <li>Go to Admin/Finance → Cardholders tab to find cardholders with managers</li>
              <li>Note the Cardholder ID and Manager ID from the table</li>
              <li>Select "Manager" role in the header</li>
              <li>Enter a Cardholder ID that has a manager assigned</li>
              <li>The system will automatically look up the Manager ID</li>
            </ol>
          </div>
        </div>
      </section>
    );
  }

  if (!currentCardholderId) {
    return (
      <section>
        <h1>Manager Dashboard</h1>
        <p style={{ color: "#fecaca" }}>
          Please enter a Cardholder ID in the role selector above to identify the manager.
        </p>
        <div style={{ marginTop: "1rem", padding: "0.75rem", background: "rgba(99, 102, 241, 0.15)", borderRadius: "0.5rem", border: "1px solid rgba(99, 102, 241, 0.3)" }}>
          <div style={{ fontSize: "0.85rem", fontWeight: "bold", marginBottom: "0.5rem", color: "#a5b4fc" }}>
            💡 Tip
          </div>
          <div style={{ fontSize: "0.8rem", opacity: 0.9 }}>
            Go to Admin/Finance → Cardholders tab to see available Cardholder IDs and their Manager IDs.
          </div>
        </div>
      </section>
    );
  }

  if (!managerId) {
    return (
      <section>
        <h1>Manager Dashboard</h1>
        <p>Loading manager information...</p>
        <p style={{ fontSize: "0.85rem", opacity: 0.8, marginTop: "0.5rem" }}>
          Looking up manager for Cardholder ID: {currentCardholderId}
        </p>
      </section>
    );
  }

  return (
    <section>
      <h1>Manager Dashboard</h1>
      <div style={{ marginBottom: "0.75rem", padding: "0.5rem", background: "rgba(15,23,42,0.5)", borderRadius: "0.5rem", fontSize: "0.85rem" }}>
        <strong>Manager ID:</strong> {managerId} | <strong>Cardholder ID (for lookup):</strong> {currentCardholderId}
      </div>
      <p>
        View transactions for all cardholders assigned to you. This view shows transactions from accounts
        belonging to your assigned cardholders.
      </p>

      {error && (
        <p style={{ color: "#fecaca", marginTop: 0 }}>
          {error}
        </p>
      )}

      <button
        type="button"
        disabled={isLoading}
        onClick={() => void loadTransactions()}
        style={{ marginBottom: "0.75rem", paddingInline: "0.8rem" }}
      >
        {isLoading ? "Loading..." : "Refresh Transactions"}
      </button>

      <div style={{ maxHeight: "400px", overflow: "auto", borderRadius: "0.75rem", border: "1px solid rgba(148,163,184,0.35)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
          <thead style={{ background: "rgba(15,23,42,0.9)", position: "sticky", top: 0 }}>
            <tr>
              <th style={{ textAlign: "left", padding: "0.4rem 0.6rem" }}>Date</th>
              <th style={{ textAlign: "left", padding: "0.4rem 0.6rem" }}>Bank Account</th>
              <th style={{ textAlign: "left", padding: "0.4rem 0.6rem" }}>Narrative</th>
              <th style={{ textAlign: "right", padding: "0.4rem 0.6rem" }}>Debit</th>
              <th style={{ textAlign: "right", padding: "0.4rem 0.6rem" }}>Credit</th>
              <th style={{ textAlign: "right", padding: "0.4rem 0.6rem" }}>Balance</th>
            </tr>
          </thead>
          <tbody>
            {transactions.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: "0.6rem", textAlign: "center", opacity: 0.7 }}>
                  {isLoading ? "Loading transactions..." : "No transactions found for your assigned cardholders."}
                </td>
              </tr>
            ) : (
              transactions.map((tx) => {
                // Extract last 4 digits for display
                const last4 = tx.bank_account.length >= 4 
                  ? tx.bank_account.slice(-4) 
                  : tx.bank_account.padStart(4, '0');
                return (
                  <tr key={tx.id}>
                    <td style={{ padding: "0.4rem 0.6rem", whiteSpace: "nowrap" }}>{tx.date}</td>
                    <td style={{ padding: "0.4rem 0.6rem", whiteSpace: "nowrap" }}>{last4}</td>
                    <td style={{ padding: "0.4rem 0.6rem" }}>{tx.narrative}</td>
                    <td style={{ padding: "0.4rem 0.6rem", textAlign: "right" }}>
                      {tx.debit_amount != null ? tx.debit_amount.toFixed(2) : ""}
                    </td>
                    <td style={{ padding: "0.4rem 0.6rem", textAlign: "right" }}>
                      {tx.credit_amount != null ? tx.credit_amount.toFixed(2) : ""}
                    </td>
                    <td style={{ padding: "0.4rem 0.6rem", textAlign: "right" }}>
                      {tx.balance != null ? tx.balance.toFixed(2) : ""}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
