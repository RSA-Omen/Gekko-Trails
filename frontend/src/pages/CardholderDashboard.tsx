import { useEffect, useState } from "react";
import { useRole } from "../contexts/RoleContext";

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

type InboxItem = {
  batch_id: number;
  label: string | null;
  title: string | null;
  status: string;
  transaction_count: number;
  created_at: string;
  submitted_at: string | null;
};

// TransactionRow removed - using Format2Item for ledger view

export function CardholderDashboard() {
  const { currentRole, currentCardholderId } = useRole();
  const [viewMode, setViewMode] = useState<"inbox" | "ledger">("inbox");
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [isLoadingInbox, setIsLoadingInbox] = useState(false);
  const [selectedBatchId, setSelectedBatchId] = useState<number | null>(null);
  const [batchItems, setBatchItems] = useState<Format2Item[]>([]);
  const [isLoadingBatchItems, setIsLoadingBatchItems] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPredicting, setIsPredicting] = useState(false);
  const [editingItem, setEditingItem] = useState<{ transaction_id: number; field: string; value: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ledgerItems, setLedgerItems] = useState<Format2Item[]>([]);
  const [isLoadingTransactions, setIsLoadingTransactions] = useState(false);
  const [selectedTransactionsForSubmission, setSelectedTransactionsForSubmission] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (currentRole === "cardholder" && currentCardholderId) {
      if (viewMode === "inbox") {
        void loadInbox();
      } else if (viewMode === "ledger") {
        void loadTransactions();
      }
    }
  }, [currentRole, currentCardholderId, viewMode]);

  async function loadInbox() {
    if (!currentCardholderId) return;
    setIsLoadingInbox(true);
    setError(null);
    try {
      const response = await fetch(`/api/cardholders/${currentCardholderId}/inbox`);
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const detail = body?.detail ?? response.statusText;
        throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
      }
      const data = (await response.json()) as { items: InboxItem[] };
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
    if (!currentCardholderId) return;
    setIsLoadingBatchItems(true);
    setError(null);
    try {
      const response = await fetch(`/api/cardholders/${currentCardholderId}/batches/${batchId}/items`);
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

  async function updateClassification(transactionId: number, field: string, value: string) {
    setError(null);
    try {
      const currentItem = batchItems.find(item => item.transaction_id === transactionId);
      if (!currentItem) return;

      const payload: Record<string, string | null> = {};
      if (field === "description") payload.description = value || null;
      else if (field === "project") payload.project = value || null;
      else if (field === "cost_category") payload.cost_category = value || null;
      else if (field === "gl_account") payload.gl_account = value || null;

      const response = await fetch(`/api/classifications/${transactionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const detail = body?.detail ?? response.statusText;
        throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
      }

      const updated = (await response.json()) as Format2Item;
      setBatchItems(prev => prev.map(item => item.transaction_id === transactionId ? updated : item));
      setEditingItem(null);
    } catch (e) {
      const err = e as Error;
      setError(err.message || "Failed to update classification.");
    }
  }

  async function predictTransaction(transactionId: number) {
    setError(null);
    try {
      const response = await fetch(`/api/classifications/${transactionId}/predict`, {
        method: "POST",
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const detail = body?.detail ?? response.statusText;
        throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
      }

      const updated = (await response.json()) as Format2Item;
      setBatchItems(prev => prev.map(item => item.transaction_id === transactionId ? updated : item));
    } catch (e) {
      const err = e as Error;
      setError(err.message || "Failed to predict classification.");
    }
  }

  async function autoPredictBatch() {
    if (!currentCardholderId || !selectedBatchId) return;
    setIsPredicting(true);
    setError(null);
    try {
      const response = await fetch(`/api/cardholders/${currentCardholderId}/batches/${selectedBatchId}/auto-predict`, {
        method: "POST",
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const detail = body?.detail ?? response.statusText;
        throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
      }

      await loadBatchItems(selectedBatchId);
    } catch (e) {
      const err = e as Error;
      setError(err.message || "Failed to auto-predict batch.");
    } finally {
      setIsPredicting(false);
    }
  }

  async function loadTransactions() {
    if (!currentCardholderId) return;
    setIsLoadingTransactions(true);
    setError(null);
    try {
      const response = await fetch(`/api/classifications/cardholder/${currentCardholderId}?limit=1000`);
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const detail = body?.detail ?? response.statusText;
        throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
      }
      const data = (await response.json()) as { items: Format2Item[] };
      setLedgerItems(data.items);
    } catch (e) {
      const err = e as Error;
      setError(err.message || "Failed to load transactions.");
      setLedgerItems([]);
    } finally {
      setIsLoadingTransactions(false);
    }
  }

  async function submitBatch(transactionIds?: number[]) {
    if (!currentCardholderId || !selectedBatchId) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const payload: { transaction_ids?: number[] } = {};
      if (transactionIds && transactionIds.length > 0) {
        payload.transaction_ids = transactionIds;
      }

      const response = await fetch(`/api/cardholders/${currentCardholderId}/batches/${selectedBatchId}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const detail = body?.detail ?? response.statusText;
        throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
      }

      // If partial submission, reload batch items to see updated status
      // If full submission, go back to inbox
      if (transactionIds && transactionIds.length > 0) {
        // Partial submission - reload batch to see remaining items
        await loadBatchItems(selectedBatchId);
        setSelectedTransactionsForSubmission(new Set());
      } else {
        // Full submission - go back to inbox
        setSelectedBatchId(null);
        setBatchItems([]);
        setSelectedTransactionsForSubmission(new Set());
        await loadInbox();
      }
    } catch (e) {
      const err = e as Error;
      setError(err.message || "Failed to submit batch.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (currentRole !== "cardholder") {
    return (
      <section>
        <h1>Cardholder Dashboard</h1>
        <p style={{ color: "#fecaca" }}>
          Please select "Cardholder" role and enter a Cardholder ID in the role selector above.
        </p>
      </section>
    );
  }

  if (!currentCardholderId) {
    return (
      <section>
        <h1>Cardholder Dashboard</h1>
        <p style={{ color: "#fecaca" }}>
          Please enter a Cardholder ID in the role selector above.
        </p>
      </section>
    );
  }

  if (selectedBatchId === null) {
    // Main view (Inbox or Ledger)
    const unclassifiedCount = inbox.reduce((sum, item) => sum + (item.status === "open" ? item.transaction_count : 0), 0);
    const inReviewCount = inbox.filter(item => item.status === "in_review").length;
    const completedCount = inbox.filter(item => item.status === "completed").length;

    return (
      <section>
        <h1>Cardholder Dashboard</h1>
        <div style={{ marginBottom: "0.75rem", padding: "0.5rem", background: "rgba(15,23,42,0.5)", borderRadius: "0.5rem", fontSize: "0.85rem" }}>
          <strong>Cardholder ID:</strong> {currentCardholderId}
        </div>

        {/* View Switcher */}
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
          <button
            type="button"
            onClick={() => setViewMode("inbox")}
            style={{
              padding: "0.35rem 0.8rem",
              borderRadius: "999px",
              border: "1px solid",
              borderColor: viewMode === "inbox" ? "#6366f1" : "rgba(148,163,184,0.5)",
              background: viewMode === "inbox" ? "rgba(79,70,229,0.35)" : "transparent",
              color: "#e5e7eb",
              fontSize: "0.8rem",
            }}
          >
            Inbox
          </button>
          <button
            type="button"
            onClick={() => setViewMode("ledger")}
            style={{
              padding: "0.35rem 0.8rem",
              borderRadius: "999px",
              border: "1px solid",
              borderColor: viewMode === "ledger" ? "#6366f1" : "rgba(148,163,184,0.5)",
              background: viewMode === "ledger" ? "rgba(79,70,229,0.35)" : "transparent",
              color: "#e5e7eb",
              fontSize: "0.8rem",
            }}
          >
            Transaction Ledger
          </button>
        </div>

        {viewMode === "ledger" ? (
          <>
            <p>
              View all transactions from accounts assigned to you.
            </p>

            {error && (
              <p style={{ color: "#fecaca", marginTop: 0 }}>
                {error}
              </p>
            )}

            <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
              <button
                type="button"
                disabled={isLoadingTransactions}
                onClick={() => void loadTransactions()}
                style={{ paddingInline: "0.8rem" }}
              >
                {isLoadingTransactions ? "Loading..." : "Refresh Transactions"}
              </button>
            </div>

            <div style={{ maxHeight: "500px", overflow: "auto", borderRadius: "0.75rem", border: "1px solid rgba(148,163,184,0.35)" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                <thead style={{ background: "rgba(15,23,42,0.9)", position: "sticky", top: 0 }}>
                  <tr>
                    <th style={{ textAlign: "left", padding: "0.4rem 0.6rem" }}>Date</th>
                    <th style={{ textAlign: "left", padding: "0.4rem 0.6rem" }}>Bank Account</th>
                    <th style={{ textAlign: "left", padding: "0.4rem 0.6rem" }}>Narrative</th>
                    <th style={{ textAlign: "right", padding: "0.4rem 0.6rem" }}>Amount</th>
                    <th style={{ textAlign: "left", padding: "0.4rem 0.6rem" }}>Description</th>
                    <th style={{ textAlign: "left", padding: "0.4rem 0.6rem" }}>Project</th>
                    <th style={{ textAlign: "left", padding: "0.4rem 0.6rem" }}>Cost Category</th>
                    <th style={{ textAlign: "left", padding: "0.4rem 0.6rem" }}>GL Account</th>
                    <th style={{ textAlign: "left", padding: "0.4rem 0.6rem" }}>Status</th>
                    <th style={{ textAlign: "left", padding: "0.4rem 0.6rem" }}>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {ledgerItems.length === 0 ? (
                    <tr>
                      <td colSpan={10} style={{ padding: "0.6rem", textAlign: "center", opacity: 0.7 }}>
                        {isLoadingTransactions ? "Loading transactions..." : "No transactions found for this cardholder."}
                      </td>
                    </tr>
                  ) : (
                    ledgerItems.map((item) => (
                      <tr key={item.transaction_id}>
                        <td style={{ padding: "0.4rem 0.6rem", whiteSpace: "nowrap" }}>{item.date}</td>
                        <td style={{ padding: "0.4rem 0.6rem", whiteSpace: "nowrap" }}>{item.bank_account}</td>
                        <td style={{ padding: "0.4rem 0.6rem" }}>{item.narrative}</td>
                        <td style={{ padding: "0.4rem 0.6rem", textAlign: "right" }}>
                          {item.amount != null ? item.amount.toFixed(2) : ""}
                        </td>
                        <td style={{ padding: "0.4rem 0.6rem" }}>{item.description ?? ""}</td>
                        <td style={{ padding: "0.4rem 0.6rem" }}>{item.project ?? ""}</td>
                        <td style={{ padding: "0.4rem 0.6rem" }}>{item.cost_category ?? ""}</td>
                        <td style={{ padding: "0.4rem 0.6rem" }}>{item.gl_account ?? ""}</td>
                        <td style={{ padding: "0.4rem 0.6rem" }}>
                          <span style={{
                            padding: "0.2rem 0.4rem",
                            borderRadius: "0.25rem",
                            fontSize: "0.7rem",
                            background: item.status === "user_confirmed" ? "rgba(16, 185, 129, 0.2)" : 
                                       item.status === "predicted" ? "rgba(99, 102, 241, 0.2)" : 
                                       item.status === "submitted_for_approval" ? "rgba(251, 191, 36, 0.2)" :
                                       "rgba(148, 163, 184, 0.2)",
                            color: item.status === "user_confirmed" ? "#86efac" : 
                                   item.status === "predicted" ? "#a5b4fc" : 
                                   item.status === "submitted_for_approval" ? "#fcd34d" :
                                   "#cbd5e1",
                          }}>
                            {item.status}
                          </span>
                        </td>
                        <td style={{ padding: "0.4rem 0.6rem", fontSize: "0.75rem", opacity: 0.7 }}>{item.source ?? ""}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <>
            <div style={{ display: "flex", gap: "1rem", marginBottom: "1rem", flexWrap: "wrap" }}>
              <div style={{ padding: "0.75rem", background: "rgba(99, 102, 241, 0.15)", borderRadius: "0.5rem", border: "1px solid rgba(99, 102, 241, 0.3)" }}>
            <div style={{ fontSize: "0.75rem", opacity: 0.8, marginBottom: "0.25rem" }}>Tasks</div>
                <div style={{ fontSize: "1.5rem", fontWeight: "bold", color: "#a5b4fc" }}>{unclassifiedCount}</div>
              </div>
              <div style={{ padding: "0.75rem", background: "rgba(99, 102, 241, 0.15)", borderRadius: "0.5rem", border: "1px solid rgba(99, 102, 241, 0.3)" }}>
                <div style={{ fontSize: "0.75rem", opacity: 0.8, marginBottom: "0.25rem" }}>In Review</div>
                <div style={{ fontSize: "1.5rem", fontWeight: "bold", color: "#a5b4fc" }}>{inReviewCount}</div>
              </div>
              <div style={{ padding: "0.75rem", background: "rgba(16, 185, 129, 0.15)", borderRadius: "0.5rem", border: "1px solid rgba(16, 185, 129, 0.3)" }}>
                <div style={{ fontSize: "0.75rem", opacity: 0.8, marginBottom: "0.25rem" }}>Completed</div>
                <div style={{ fontSize: "1.5rem", fontWeight: "bold", color: "#86efac" }}>{completedCount}</div>
              </div>
            </div>

        <p>
          Classify your transactions. Finance has uploaded transactions for you to review and classify.
        </p>

        {error && (
          <p style={{ color: "#fecaca", marginTop: 0 }}>
            {error}
          </p>
        )}

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
                <th style={{ textAlign: "left", padding: "0.4rem 0.6rem" }}>Batch</th>
                <th style={{ textAlign: "right", padding: "0.4rem 0.6rem" }}>Transactions</th>
                <th style={{ textAlign: "left", padding: "0.4rem 0.6rem" }}>Status</th>
                <th style={{ textAlign: "left", padding: "0.4rem 0.6rem" }}>Created</th>
                <th style={{ textAlign: "left", padding: "0.4rem 0.6rem" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {inbox.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: "0.6rem", textAlign: "center", opacity: 0.7 }}>
                    {isLoadingInbox ? "Loading inbox..." : "No batches found. Finance will create batches for you to classify."}
                  </td>
                </tr>
              ) : (
                inbox.map((item) => (
                  <tr key={item.batch_id}>
                    <td style={{ padding: "0.4rem 0.6rem", fontWeight: "bold" }}>{item.label || item.title || `Batch ${item.batch_id}`}</td>
                    <td style={{ padding: "0.4rem 0.6rem", textAlign: "right" }}>{item.transaction_count}</td>
                    <td style={{ padding: "0.4rem 0.6rem" }}>
                      <span style={{
                        padding: "0.2rem 0.5rem",
                        borderRadius: "0.25rem",
                        fontSize: "0.75rem",
                        background: item.status === "completed" ? "rgba(16, 185, 129, 0.2)" : item.status === "open" ? "rgba(99, 102, 241, 0.2)" : "rgba(148, 163, 184, 0.2)",
                        color: item.status === "completed" ? "#86efac" : item.status === "open" ? "#a5b4fc" : "#cbd5e1",
                      }}>
                        {item.status}
                      </span>
                    </td>
                    <td style={{ padding: "0.4rem 0.6rem", whiteSpace: "nowrap" }}>{new Date(item.created_at).toLocaleDateString()}</td>
                    <td style={{ padding: "0.4rem 0.6rem" }}>
                      {item.status === "open" && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedBatchId(item.batch_id);
                            setSelectedTransactionsForSubmission(new Set());
                            void loadBatchItems(item.batch_id);
                          }}
                          style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem", background: "#6366f1", color: "#fff", border: "none", borderRadius: "0.25rem", cursor: "pointer" }}
                        >
                          Classify
                        </button>
                      )}
                      {item.status === "completed" && (
                        <span style={{ fontSize: "0.75rem", opacity: 0.7 }}>Submitted</span>
                      )}
                      {item.status === "in_review" && (
                        <span style={{ fontSize: "0.75rem", color: "#a5b4fc" }}>Partially Submitted</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
              </tbody>
            </table>
          </div>
          </>
        )}
      </section>
    );
  }

  // Batch classification view
  const unclassifiedCount = batchItems.filter(item => item.status === "unclassified").length;
  const predictedCount = batchItems.filter(item => item.status === "predicted").length;
  const confirmedCount = batchItems.filter(item => item.status === "user_confirmed").length;

  return (
    <section>
      <h1>Classify Transactions</h1>
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => {
            setSelectedBatchId(null);
            setBatchItems([]);
          }}
          style={{ paddingInline: "0.8rem" }}
        >
          ← Back to Inbox
        </button>
        <button
          type="button"
          disabled={isPredicting}
          onClick={() => void autoPredictBatch()}
          style={{ paddingInline: "0.8rem", background: "#6366f1", color: "#fff" }}
        >
          {isPredicting ? "Predicting..." : "Auto-Predict All"}
        </button>
        {confirmedCount > 0 && (
          <>
            <button
              type="button"
              disabled={isSubmitting || unclassifiedCount > 0}
              onClick={() => void submitBatch()}
              style={{ paddingInline: "0.8rem", background: "#10b981", color: "#fff" }}
            >
              {isSubmitting ? "Submitting..." : "Submit All for Approval"}
            </button>
            <button
              type="button"
              disabled={isSubmitting || selectedTransactionsForSubmission.size === 0}
              onClick={() => void submitBatch(Array.from(selectedTransactionsForSubmission))}
              style={{ paddingInline: "0.8rem", background: "#8b5cf6", color: "#fff" }}
            >
              {isSubmitting ? "Submitting..." : `Submit Selected (${selectedTransactionsForSubmission.size})`}
            </button>
          </>
        )}
      </div>

      <div style={{ display: "flex", gap: "1rem", marginBottom: "1rem", flexWrap: "wrap" }}>
        <div style={{ padding: "0.5rem", background: "rgba(148, 163, 184, 0.15)", borderRadius: "0.5rem", fontSize: "0.85rem" }}>
          <strong>Unclassified:</strong> {unclassifiedCount}
        </div>
        <div style={{ padding: "0.5rem", background: "rgba(99, 102, 241, 0.15)", borderRadius: "0.5rem", fontSize: "0.85rem" }}>
          <strong>Predicted:</strong> {predictedCount}
        </div>
        <div style={{ padding: "0.5rem", background: "rgba(16, 185, 129, 0.15)", borderRadius: "0.5rem", fontSize: "0.85rem" }}>
          <strong>Confirmed:</strong> {confirmedCount}
        </div>
      </div>

      {error && (
        <p style={{ color: "#fecaca", marginTop: 0 }}>
          {error}
        </p>
      )}

      {isLoadingBatchItems ? (
        <p>Loading batch items...</p>
      ) : (
        <div style={{ maxHeight: "500px", overflow: "auto", borderRadius: "0.75rem", border: "1px solid rgba(148,163,184,0.35)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
              <thead style={{ background: "rgba(15,23,42,0.9)", position: "sticky", top: 0 }}>
                <tr>
                  <th style={{ textAlign: "left", padding: "0.4rem 0.6rem", width: "30px" }}>
                    <input
                      type="checkbox"
                      checked={batchItems.filter(item => item.status === "user_confirmed").length > 0 && 
                               batchItems.filter(item => item.status === "user_confirmed").every(item => selectedTransactionsForSubmission.has(item.transaction_id))}
                      onChange={(e) => {
                        const confirmedItems = batchItems.filter(item => item.status === "user_confirmed");
                        if (e.target.checked) {
                          setSelectedTransactionsForSubmission(new Set(confirmedItems.map(item => item.transaction_id)));
                        } else {
                          setSelectedTransactionsForSubmission(new Set());
                        }
                      }}
                      style={{ cursor: "pointer" }}
                    />
                  </th>
                  <th style={{ textAlign: "left", padding: "0.4rem 0.6rem" }}>Date</th>
                  <th style={{ textAlign: "left", padding: "0.4rem 0.6rem" }}>Narrative</th>
                  <th style={{ textAlign: "right", padding: "0.4rem 0.6rem" }}>Amount</th>
                  <th style={{ textAlign: "left", padding: "0.4rem 0.6rem" }}>Description</th>
                  <th style={{ textAlign: "left", padding: "0.4rem 0.6rem" }}>Project</th>
                  <th style={{ textAlign: "left", padding: "0.4rem 0.6rem" }}>Cost Category</th>
                  <th style={{ textAlign: "left", padding: "0.4rem 0.6rem" }}>GL Account</th>
                  <th style={{ textAlign: "left", padding: "0.4rem 0.6rem" }}>Status</th>
                  <th style={{ textAlign: "left", padding: "0.4rem 0.6rem" }}>Actions</th>
                </tr>
              </thead>
            <tbody>
                      {batchItems.length === 0 ? (
                        <tr>
                          <td colSpan={10} style={{ padding: "0.6rem", textAlign: "center", opacity: 0.7 }}>
                            No transactions in this batch.
                          </td>
                        </tr>
                      ) : (
                batchItems.map((item) => {
                  const isEditing = editingItem?.transaction_id === item.transaction_id;
                  const isConfirmed = item.status === "user_confirmed";
                  const isSelected = selectedTransactionsForSubmission.has(item.transaction_id);
                  return (
                    <tr key={item.transaction_id} style={{ opacity: isConfirmed ? 1 : 0.8 }}>
                      <td style={{ padding: "0.4rem 0.6rem" }}>
                        {isConfirmed && (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              const newSet = new Set(selectedTransactionsForSubmission);
                              if (e.target.checked) {
                                newSet.add(item.transaction_id);
                              } else {
                                newSet.delete(item.transaction_id);
                              }
                              setSelectedTransactionsForSubmission(newSet);
                            }}
                            style={{ cursor: "pointer" }}
                          />
                        )}
                      </td>
                      <td style={{ padding: "0.4rem 0.6rem", whiteSpace: "nowrap" }}>{item.date}</td>
                      <td style={{ padding: "0.4rem 0.6rem" }}>{item.narrative}</td>
                      <td style={{ padding: "0.4rem 0.6rem", textAlign: "right" }}>
                        {item.amount != null ? item.amount.toFixed(2) : ""}
                      </td>
                      <td style={{ padding: "0.4rem 0.6rem" }}>
                        {isEditing && editingItem?.field === "description" ? (
                          <input
                            type="text"
                            value={editingItem.value}
                            onChange={(e) => setEditingItem({ ...editingItem, value: e.target.value })}
                            onBlur={() => {
                              if (editingItem) {
                                void updateClassification(editingItem.transaction_id, "description", editingItem.value);
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                if (editingItem) {
                                  void updateClassification(editingItem.transaction_id, "description", editingItem.value);
                                }
                              } else if (e.key === "Escape") {
                                setEditingItem(null);
                              }
                            }}
                            autoFocus
                            style={{ width: "100%", padding: "0.2rem", fontSize: "0.8rem" }}
                          />
                        ) : (
                          <span
                            onClick={() => setEditingItem({ transaction_id: item.transaction_id, field: "description", value: item.description || "" })}
                            style={{ cursor: "pointer", padding: "0.2rem", display: "block", minWidth: "100px" }}
                          >
                            {item.description || <span style={{ opacity: 0.5 }}>Click to edit</span>}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "0.4rem 0.6rem" }}>
                        {isEditing && editingItem?.field === "project" ? (
                          <input
                            type="text"
                            value={editingItem.value}
                            onChange={(e) => setEditingItem({ ...editingItem, value: e.target.value })}
                            onBlur={() => {
                              if (editingItem) {
                                void updateClassification(editingItem.transaction_id, "project", editingItem.value);
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                if (editingItem) {
                                  void updateClassification(editingItem.transaction_id, "project", editingItem.value);
                                }
                              } else if (e.key === "Escape") {
                                setEditingItem(null);
                              }
                            }}
                            autoFocus
                            style={{ width: "100%", padding: "0.2rem", fontSize: "0.8rem" }}
                          />
                        ) : (
                          <span
                            onClick={() => setEditingItem({ transaction_id: item.transaction_id, field: "project", value: item.project || "" })}
                            style={{ cursor: "pointer", padding: "0.2rem", display: "block", minWidth: "80px" }}
                          >
                            {item.project || <span style={{ opacity: 0.5 }}>Click to edit</span>}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "0.4rem 0.6rem" }}>
                        {isEditing && editingItem?.field === "cost_category" ? (
                          <input
                            type="text"
                            value={editingItem.value}
                            onChange={(e) => setEditingItem({ ...editingItem, value: e.target.value })}
                            onBlur={() => {
                              if (editingItem) {
                                void updateClassification(editingItem.transaction_id, "cost_category", editingItem.value);
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                if (editingItem) {
                                  void updateClassification(editingItem.transaction_id, "cost_category", editingItem.value);
                                }
                              } else if (e.key === "Escape") {
                                setEditingItem(null);
                              }
                            }}
                            autoFocus
                            style={{ width: "100%", padding: "0.2rem", fontSize: "0.8rem" }}
                          />
                        ) : (
                          <span
                            onClick={() => setEditingItem({ transaction_id: item.transaction_id, field: "cost_category", value: item.cost_category || "" })}
                            style={{ cursor: "pointer", padding: "0.2rem", display: "block", minWidth: "100px" }}
                          >
                            {item.cost_category || <span style={{ opacity: 0.5 }}>Click to edit</span>}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "0.4rem 0.6rem" }}>
                        {isEditing && editingItem?.field === "gl_account" ? (
                          <input
                            type="text"
                            value={editingItem.value}
                            onChange={(e) => setEditingItem({ ...editingItem, value: e.target.value })}
                            onBlur={() => {
                              if (editingItem) {
                                void updateClassification(editingItem.transaction_id, "gl_account", editingItem.value);
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                if (editingItem) {
                                  void updateClassification(editingItem.transaction_id, "gl_account", editingItem.value);
                                }
                              } else if (e.key === "Escape") {
                                setEditingItem(null);
                              }
                            }}
                            autoFocus
                            style={{ width: "100%", padding: "0.2rem", fontSize: "0.8rem" }}
                          />
                        ) : (
                          <span
                            onClick={() => setEditingItem({ transaction_id: item.transaction_id, field: "gl_account", value: item.gl_account || "" })}
                            style={{ cursor: "pointer", padding: "0.2rem", display: "block", minWidth: "80px" }}
                          >
                            {item.gl_account || <span style={{ opacity: 0.5 }}>Click to edit</span>}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "0.4rem 0.6rem" }}>
                        <span style={{
                          padding: "0.15rem 0.4rem",
                          borderRadius: "0.25rem",
                          fontSize: "0.7rem",
                          background: item.status === "unclassified" ? "rgba(148, 163, 184, 0.2)" : item.status === "predicted" ? "rgba(99, 102, 241, 0.2)" : "rgba(16, 185, 129, 0.2)",
                          color: item.status === "unclassified" ? "#cbd5e1" : item.status === "predicted" ? "#a5b4fc" : "#86efac",
                        }}>
                          {item.status}
                        </span>
                      </td>
                      <td style={{ padding: "0.4rem 0.6rem" }}>
                        {item.status === "unclassified" && (
                          <button
                            type="button"
                            onClick={() => void predictTransaction(item.transaction_id)}
                            style={{ padding: "0.2rem 0.4rem", fontSize: "0.7rem", background: "#6366f1", color: "#fff", border: "none", borderRadius: "0.25rem", cursor: "pointer" }}
                          >
                            Predict
                          </button>
                        )}
                        {item.status === "predicted" && (
                          <span style={{ fontSize: "0.7rem", opacity: 0.7 }}>Predicted</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
