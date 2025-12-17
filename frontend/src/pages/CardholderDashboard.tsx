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

export function CardholderDashboard() {
  const { currentRole, currentCardholderId } = useRole();
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (currentRole === "cardholder" && currentCardholderId) {
      loadTransactions();
    }
  }, [currentRole, currentCardholderId]);

  async function loadTransactions() {
    if (!currentCardholderId) {
      setError("Please set a Cardholder ID in the role selector above.");
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("cardholder_id", currentCardholderId.toString());
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

  if (currentRole !== "cardholder") {
    return (
      <section>
        <h1>Cardholder Dashboard</h1>
        <p style={{ color: "#fecaca" }}>
          Please select "Cardholder" role and enter a Cardholder ID in the role selector above to view your transactions.
        </p>
        <div style={{ marginTop: "1rem", padding: "0.75rem", background: "rgba(99, 102, 241, 0.15)", borderRadius: "0.5rem", border: "1px solid rgba(99, 102, 241, 0.3)" }}>
          <div style={{ fontSize: "0.85rem", fontWeight: "bold", marginBottom: "0.5rem", color: "#a5b4fc" }}>
            💡 How to Test Cardholder View
          </div>
          <div style={{ fontSize: "0.8rem", opacity: 0.9 }}>
            <ol style={{ margin: 0, paddingLeft: "1.5rem" }}>
              <li>Go to Admin/Finance → Cardholders tab to find available Cardholder IDs</li>
              <li>Select "Cardholder" role in the header</li>
              <li>Enter the Cardholder ID in the input field</li>
              <li>Click "Refresh Transactions" to see filtered transactions</li>
            </ol>
          </div>
        </div>
      </section>
    );
  }

  if (!currentCardholderId) {
    return (
      <section>
        <h1>Cardholder Dashboard</h1>
        <p style={{ color: "#fecaca" }}>
          Please enter a Cardholder ID in the role selector above to view your transactions.
        </p>
        <div style={{ marginTop: "1rem", padding: "0.75rem", background: "rgba(99, 102, 241, 0.15)", borderRadius: "0.5rem", border: "1px solid rgba(99, 102, 241, 0.3)" }}>
          <div style={{ fontSize: "0.85rem", fontWeight: "bold", marginBottom: "0.5rem", color: "#a5b4fc" }}>
            💡 Tip
          </div>
          <div style={{ fontSize: "0.8rem", opacity: 0.9 }}>
            Go to Admin/Finance → Cardholders tab to see available Cardholder IDs.
          </div>
        </div>
      </section>
    );
  }

  return (
    <section>
      <h1>Cardholder Dashboard</h1>
      <div style={{ marginBottom: "0.75rem", padding: "0.5rem", background: "rgba(15,23,42,0.5)", borderRadius: "0.5rem", fontSize: "0.85rem" }}>
        <strong>Cardholder ID:</strong> {currentCardholderId}
      </div>
      <p>
        View your transactions. This view shows only transactions from accounts assigned to you.
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
                  {isLoading ? "Loading transactions..." : "No transactions found for this cardholder."}
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
