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

type ManagerAccountRow = {
  account_id: number;
  bank_account_number: string;
  cardholder_id: number;
  cardholder_display_name: string;
};

type ManagerInboxItem = {
  batch_id: number;
  cardholder_id: number;
  cardholder_display_name: string;
  transaction_count: number;
  status: string;
  submitted_at: string | null;
  title: string | null;
  label: string | null;
};

type Format2Item = {
  transaction_id: number;
  date: string;
  bank_account: string;
  narrative: string;
  amount: number | null;
  debit_amount: number | null;
  credit_amount: number | null;
  balance: number | null;
  description: string | null;
  project: string | null;
  cost_category: string | null;
  gl_account: string | null;
  status: string;
  source: string | null;
  batch_id: number | null;
};

export function ManagerDashboard() {
  const { currentRole, currentCardholderId } = useRole();
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // For manager, we treat the ID entered in the role selector
  // as the Manager ID directly (mocked auth without SSO).
  const managerId = currentCardholderId;
  const [accounts, setAccounts] = useState<ManagerAccountRow[]>([]);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(false);
  const [selectedAccountLast4, setSelectedAccountLast4] = useState<string>("");
  const [activeView, setActiveView] = useState<"transactions" | "inbox">("transactions");
  const [inbox, setInbox] = useState<ManagerInboxItem[]>([]);
  const [isLoadingInbox, setIsLoadingInbox] = useState(false);
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(null);
  const [batchItems, setBatchItems] = useState<Format2Item[]>([]);
  const [isLoadingBatchItems, setIsLoadingBatchItems] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [rejectionReason, setRejectionReason] = useState<string>("");

  useEffect(() => {
    if (currentRole === "manager" && managerId) {
      void loadManagerAccounts();
      if (activeView === "transactions") {
        void loadTransactions();
      } else if (activeView === "inbox") {
        void loadInbox();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRole, managerId, activeView]);

  useEffect(() => {
    if (currentRole === "manager" && managerId) {
      void loadTransactions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAccountLast4]);

  async function loadManagerAccounts() {
    if (!managerId) return;
    setIsLoadingAccounts(true);
    setError(null);
    try {
      const response = await fetch(`/api/managers/${managerId}/accounts`);
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const detail = body?.detail ?? response.statusText;
        throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
      }
      const data = (await response.json()) as ManagerAccountRow[];
      setAccounts(data);
    } catch (e) {
      const err = e as Error;
      setError(err.message || "Failed to load manager accounts.");
      setAccounts([]);
    } finally {
      setIsLoadingAccounts(false);
    }
  }

  async function loadInbox() {
    if (!managerId) return;
    setIsLoadingInbox(true);
    setError(null);
    try {
      const response = await fetch(`/api/managers/${managerId}/inbox`);
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const detail = body?.detail ?? response.statusText;
        throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
      }
      const data = (await response.json()) as { items: ManagerInboxItem[] };
      setInbox(data.items);
    } catch (e) {
      const err = e as Error;
      setError(err.message || "Failed to load inbox.");
      setInbox([]);
    } finally {
      setIsLoadingInbox(false);
    }
  }

  async function loadBatchItems(batchId: number) {
    if (!managerId) return;
    setIsLoadingBatchItems(true);
    setError(null);
    try {
      const response = await fetch(`/api/managers/${managerId}/batches/${batchId}/items`);
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const detail = body?.detail ?? response.statusText;
        throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
      }
      const data = (await response.json()) as { items: Format2Item[] };
      setBatchItems(data.items);
    } catch (e) {
      const err = e as Error;
      setError(err.message || "Failed to load batch items.");
      setBatchItems([]);
    } finally {
      setIsLoadingBatchItems(false);
    }
  }

  async function approveBatch(batchId: number) {
    if (!managerId) return;
    setIsApproving(true);
    setError(null);
    try {
      const response = await fetch(`/api/managers/${managerId}/batches/${batchId}/approve`, {
        method: "POST",
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const detail = body?.detail ?? response.statusText;
        throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
      }

      setSelectedBatchId(null);
      setBatchItems([]);
      await loadInbox();
    } catch (e) {
      const err = e as Error;
      setError(err.message || "Failed to approve batch.");
    } finally {
      setIsApproving(false);
    }
  }

  async function rejectBatch(batchId: number) {
    if (!managerId) return;
    if (!rejectionReason.trim()) {
      setError("Rejection reason is required.");
      return;
    }
    setIsRejecting(true);
    setError(null);
    try {
      const response = await fetch(`/api/managers/${managerId}/batches/${batchId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: rejectionReason.trim() }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const detail = body?.detail ?? response.statusText;
        throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
      }

      setSelectedBatchId(null);
      setBatchItems([]);
      setRejectionReason("");
      await loadInbox();
    } catch (e) {
      const err = e as Error;
      setError(err.message || "Failed to reject batch.");
    } finally {
      setIsRejecting(false);
    }
  }

  async function loadTransactions() {
    if (!managerId) {
      setError("Manager ID not set. Please enter a Manager ID in the role selector.");
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("manager_id", managerId.toString());
      params.set("limit", "100");
      if (selectedAccountLast4.trim()) {
        params.set("account_last4", selectedAccountLast4.trim());
      }

      // Add a timeout so we don't get stuck on "Loading transactions..."
      const timeoutMs = 10000;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        controller.abort();
      }, timeoutMs);

      let response: Response;
      try {
        response = await fetch(`/api/transactions?${params.toString()}`, {
          signal: controller.signal,
        });
      } catch (fetchError) {
        clearTimeout(timeoutId);
        if (fetchError instanceof Error && fetchError.name === "AbortError") {
          throw new Error("Request timed out. Please check that the backend is running and reachable.");
        }
        throw fetchError;
      }

      clearTimeout(timeoutId);
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
          Please select "Manager" role and enter a Manager ID in the role selector above.
        </p>
        <p style={{ fontSize: "0.9rem", opacity: 0.8 }}>
          Note: In production, manager identity will come from SSO. For testing, we set the Manager ID directly via the role selector.
        </p>
        <div style={{ marginTop: "1rem", padding: "0.75rem", background: "rgba(99, 102, 241, 0.15)", borderRadius: "0.5rem", border: "1px solid rgba(99, 102, 241, 0.3)" }}>
          <div style={{ fontSize: "0.85rem", fontWeight: "bold", marginBottom: "0.5rem", color: "#a5b4fc" }}>
            💡 How to Test Manager View
          </div>
          <div style={{ fontSize: "0.8rem", opacity: 0.9 }}>
            <ol style={{ margin: 0, paddingLeft: "1.5rem" }}>
              <li>Go to Admin/Finance → Cardholders tab to see which cardholders are linked to which managers</li>
              <li>Note a Manager ID from the Manager column</li>
              <li>Select "Manager" role in the header</li>
              <li>Enter that Manager ID in the role selector</li>
              <li>Open the Manager Dashboard and refresh transactions</li>
            </ol>
          </div>
        </div>
      </section>
    );
  }

  if (!managerId) {
    return (
      <section>
        <h1>Manager Dashboard</h1>
        <p style={{ color: "#fecaca" }}>
          Please enter a Manager ID in the role selector above to view your cardholders' transactions.
        </p>
      </section>
    );
  }

  return (
    <section>
      <h1>Manager Dashboard</h1>
      <div style={{ marginBottom: "0.75rem", padding: "0.5rem", background: "rgba(15,23,42,0.5)", borderRadius: "0.5rem", fontSize: "0.85rem" }}>
        <strong>Manager ID (from role selector):</strong> {managerId}
      </div>

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem" }}>
        <button
          type="button"
          onClick={() => setActiveView("transactions")}
          style={{
            padding: "0.35rem 0.8rem",
            borderRadius: "999px",
            border: "1px solid",
            borderColor: activeView === "transactions" ? "#6366f1" : "rgba(148,163,184,0.5)",
            background: activeView === "transactions" ? "rgba(79,70,229,0.35)" : "transparent",
            color: "#e5e7eb",
            fontSize: "0.8rem",
          }}
        >
          Transactions
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveView("inbox");
            if (inbox.length === 0 && !isLoadingInbox) {
              void loadInbox();
            }
          }}
          style={{
            padding: "0.35rem 0.8rem",
            borderRadius: "999px",
            border: "1px solid",
            borderColor: activeView === "inbox" ? "#6366f1" : "rgba(148,163,184,0.5)",
            background: activeView === "inbox" ? "rgba(79,70,229,0.35)" : "transparent",
            color: "#e5e7eb",
            fontSize: "0.8rem",
          }}
        >
          Approval Inbox
        </button>
      </div>

      {activeView === "transactions" && (
        <>
          <p>
            View transactions for all cardholders assigned to you. This view shows transactions from accounts
            belonging to your assigned cardholders.
          </p>

      {error && (
        <p style={{ color: "#fecaca", marginTop: 0 }}>
          {error}
        </p>
      )}

      {accounts.length > 0 && (
        <div style={{ marginBottom: "0.75rem", display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ fontSize: "0.85rem" }}>
            Filter by card:
            <select
              value={selectedAccountLast4}
              onChange={(e) => setSelectedAccountLast4(e.target.value)}
              style={{
                marginLeft: "0.4rem",
                padding: "0.35rem 0.5rem",
                background: "rgba(15,23,42,0.9)",
                border: "1px solid rgba(148,163,184,0.3)",
                borderRadius: "0.25rem",
                color: "#e5e7eb",
                fontSize: "0.8rem",
                minWidth: "220px",
              }}
            >
              <option value="">All cards</option>
              {accounts.map((acc) => {
                const last4 =
                  acc.bank_account_number.length >= 4
                    ? acc.bank_account_number.slice(-4)
                    : acc.bank_account_number.padStart(4, "0");
                return (
                  <option key={acc.account_id} value={last4}>
                    {acc.cardholder_display_name} – {last4}
                  </option>
                );
              })}
            </select>
          </label>
          {isLoadingAccounts && (
            <span style={{ fontSize: "0.8rem", opacity: 0.8 }}>Loading cards…</span>
          )}
        </div>
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
        </>
      )}

      {activeView === "inbox" && (
        <>
          <p>
            Review and approve batches submitted by cardholders. Rejections require a reason.
          </p>

          {selectedBatchId === null ? (
            <>
              <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
                <button
                  type="button"
                  disabled={isLoadingInbox}
                  onClick={() => void loadInbox()}
                  style={{ paddingInline: "0.8rem" }}
                >
                  {isLoadingInbox ? "Refreshing..." : "Refresh Inbox"}
                </button>
              </div>

              <div style={{ maxHeight: "400px", overflow: "auto", borderRadius: "0.75rem", border: "1px solid rgba(148,163,184,0.35)" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                  <thead style={{ background: "rgba(15,23,42,0.9)", position: "sticky", top: 0 }}>
                    <tr>
                      <th style={{ textAlign: "left", padding: "0.4rem 0.6rem" }}>Cardholder</th>
                      <th style={{ textAlign: "left", padding: "0.4rem 0.6rem" }}>Batch</th>
                      <th style={{ textAlign: "right", padding: "0.4rem 0.6rem" }}>Transactions</th>
                      <th style={{ textAlign: "left", padding: "0.4rem 0.6rem" }}>Submitted</th>
                      <th style={{ textAlign: "left", padding: "0.4rem 0.6rem" }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inbox.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ padding: "0.6rem", textAlign: "center", opacity: 0.7 }}>
                          {isLoadingInbox ? "Loading inbox..." : "No batches awaiting approval."}
                        </td>
                      </tr>
                    ) : (
                      inbox.map((item) => (
                        <tr key={item.batch_id}>
                          <td style={{ padding: "0.4rem 0.6rem", fontWeight: "bold" }}>{item.cardholder_display_name}</td>
                          <td style={{ padding: "0.4rem 0.6rem" }}>{item.label || item.title || `Batch ${item.batch_id}`}</td>
                          <td style={{ padding: "0.4rem 0.6rem", textAlign: "right" }}>{item.transaction_count}</td>
                          <td style={{ padding: "0.4rem 0.6rem", whiteSpace: "nowrap" }}>
                            {item.submitted_at ? new Date(item.submitted_at).toLocaleDateString() : ""}
                          </td>
                          <td style={{ padding: "0.4rem 0.6rem" }}>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedBatchId(item.batch_id);
                                void loadBatchItems(item.batch_id);
                              }}
                              style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem", background: "#6366f1", color: "#fff", border: "none", borderRadius: "0.25rem", cursor: "pointer" }}
                            >
                              Review
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div>
              <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedBatchId(null);
                    setBatchItems([]);
                    setRejectionReason("");
                  }}
                  style={{ paddingInline: "0.8rem" }}
                >
                  ← Back to Inbox
                </button>
                <button
                  type="button"
                  disabled={isApproving}
                  onClick={() => void approveBatch(selectedBatchId)}
                  style={{ paddingInline: "0.8rem", background: "#10b981", color: "#fff" }}
                >
                  {isApproving ? "Approving..." : "Approve Batch"}
                </button>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flex: 1 }}>
                  <input
                    type="text"
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="Rejection reason (required)"
                    style={{
                      flex: 1,
                      padding: "0.4rem 0.6rem",
                      background: "rgba(15,23,42,0.9)",
                      border: "1px solid rgba(148,163,184,0.3)",
                      borderRadius: "0.25rem",
                      color: "#e5e7eb",
                      fontSize: "0.85rem",
                    }}
                  />
                  <button
                    type="button"
                    disabled={isRejecting || !rejectionReason.trim()}
                    onClick={() => void rejectBatch(selectedBatchId)}
                    style={{ paddingInline: "0.8rem", background: "#ef4444", color: "#fff" }}
                  >
                    {isRejecting ? "Rejecting..." : "Reject"}
                  </button>
                </div>
              </div>

              <h3 style={{ fontSize: "1rem", marginTop: 0 }}>
                Batch Review - {inbox.find(item => item.batch_id === selectedBatchId)?.cardholder_display_name || "Batch"}
              </h3>

              {isLoadingBatchItems ? (
                <p>Loading batch items...</p>
              ) : (
                <div style={{ maxHeight: "500px", overflow: "auto", borderRadius: "0.75rem", border: "1px solid rgba(148,163,184,0.35)" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                    <thead style={{ background: "rgba(15,23,42,0.9)", position: "sticky", top: 0 }}>
                      <tr>
                        <th style={{ textAlign: "left", padding: "0.4rem 0.6rem" }}>Date</th>
                        <th style={{ textAlign: "left", padding: "0.4rem 0.6rem" }}>Narrative</th>
                        <th style={{ textAlign: "right", padding: "0.4rem 0.6rem" }}>Amount</th>
                        <th style={{ textAlign: "left", padding: "0.4rem 0.6rem" }}>Description</th>
                        <th style={{ textAlign: "left", padding: "0.4rem 0.6rem" }}>Project</th>
                        <th style={{ textAlign: "left", padding: "0.4rem 0.6rem" }}>Cost Category</th>
                        <th style={{ textAlign: "left", padding: "0.4rem 0.6rem" }}>GL Account</th>
                        <th style={{ textAlign: "left", padding: "0.4rem 0.6rem" }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {batchItems.length === 0 ? (
                        <tr>
                          <td colSpan={8} style={{ padding: "0.6rem", textAlign: "center", opacity: 0.7 }}>
                            No transactions in this batch.
                          </td>
                        </tr>
                      ) : (
                        batchItems.map((item) => (
                          <tr key={item.transaction_id}>
                            <td style={{ padding: "0.4rem 0.6rem", whiteSpace: "nowrap" }}>{item.date}</td>
                            <td style={{ padding: "0.4rem 0.6rem" }}>{item.narrative}</td>
                            <td style={{ padding: "0.4rem 0.6rem", textAlign: "right" }}>
                              {item.amount != null ? item.amount.toFixed(2) : ""}
                            </td>
                            <td style={{ padding: "0.4rem 0.6rem" }}>{item.description || ""}</td>
                            <td style={{ padding: "0.4rem 0.6rem" }}>{item.project || ""}</td>
                            <td style={{ padding: "0.4rem 0.6rem" }}>{item.cost_category || ""}</td>
                            <td style={{ padding: "0.4rem 0.6rem" }}>{item.gl_account || ""}</td>
                            <td style={{ padding: "0.4rem 0.6rem" }}>
                              <span style={{
                                padding: "0.15rem 0.4rem",
                                borderRadius: "0.25rem",
                                fontSize: "0.7rem",
                                background: item.status === "user_confirmed" ? "rgba(16, 185, 129, 0.2)" : "rgba(148, 163, 184, 0.2)",
                                color: item.status === "user_confirmed" ? "#86efac" : "#cbd5e1",
                              }}>
                                {item.status}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
