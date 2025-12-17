import { FormEvent, useEffect, useState } from "react";

type ImportResult = {
  message: string;
  import_job_id: number | null;
  total_rows: number;
  inserted: number;
  skipped: number;
  accounts_created?: number;
} | null;

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

type AccountRow = {
  id: number;
  bank_account_number: string;
  label: string | null;
  cardholder: { id: number; display_name: string } | null;
};

export function AdminFinanceDashboard() {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [result, setResult] = useState<ImportResult>(null);
  const [error, setError] = useState<string | null>(null);
  const [bankAccountFilter, setBankAccountFilter] = useState<string>("");
  const [ledger, setLedger] = useState<TransactionRow[]>([]);
  const [isLoadingLedger, setIsLoadingLedger] = useState(false);
  const [activeTab, setActiveTab] = useState<"ledger" | "cards" | "cardholders">("ledger");
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(false);
  const [assigningAccountId, setAssigningAccountId] = useState<number | null>(null);
  const [assignNames, setAssignNames] = useState<Record<number, string>>({});
  const [selectedCardholderIds, setSelectedCardholderIds] = useState<Record<number, number | "">>({});
  const [showUnlinkedOnly, setShowUnlinkedOnly] = useState(false);
  
  // Cardholder management state
  type CardholderRow = {
    id: number;
    name: string;
    surname: string;
    email: string;
    user_id: number | null;
    display_name: string;
    manager: { id: number; user_id: number | null; email: string | null } | null;
  };
  const [cardholders, setCardholders] = useState<CardholderRow[]>([]);
  const [isLoadingCardholders, setIsLoadingCardholders] = useState(false);
  const [editingCardholderId, setEditingCardholderId] = useState<number | null>(null);
  const [newCardholder, setNewCardholder] = useState({ name: "", surname: "", email: "" });
  
  // Cardholder table filters and sorting
  const [cardholderFilters, setCardholderFilters] = useState({
    name: "",
    surname: "",
    email: "",
  });
  const [cardholderSort, setCardholderSort] = useState<{
    column: keyof CardholderRow | null;
    direction: "asc" | "desc";
  }>({ column: null, direction: "asc" });
  const [showCardholderDialog, setShowCardholderDialog] = useState(false);
  const [dialogMode, setDialogMode] = useState<"create" | "edit">("create");
  const [dialogCardholder, setDialogCardholder] = useState({ name: "", surname: "", email: "" });
  const [showSuccessNotification, setShowSuccessNotification] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setResult(null);

    if (!file) {
      setError("Please choose a CSV file to upload.");
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/imports/format1", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const detail = body?.detail ?? response.statusText;
        throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
      }

      const data = (await response.json()) as ImportResult;
      setResult(data);
    } catch (e) {
      const err = e as Error;
      setError(err.message || "Failed to upload CSV.");
    } finally {
      setIsUploading(false);
    }
  }

  async function loadLedger() {
    setIsLoadingLedger(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("limit", "100");
      if (bankAccountFilter.trim()) {
        params.set("bank_account", bankAccountFilter.trim());
      }

      const response = await fetch(`/api/transactions?${params.toString()}`);
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const detail = body?.detail ?? response.statusText;
        throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
      }
      const data = (await response.json()) as { items: TransactionRow[] };
      setLedger(data.items);
    } catch (e) {
      const err = e as Error;
      setError(err.message || "Failed to load ledger.");
      setLedger([]);
    } finally {
      setIsLoadingLedger(false);
    }
  }

  // Load initial ledger snapshot on mount.
  useEffect(() => {
    void loadLedger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activeTab === "cards") {
      void loadAccounts();
      // Load cardholders for the dropdown if not already loaded
      if (cardholders.length === 0) {
        void loadCardholders();
      }
    } else if (activeTab === "cardholders") {
      void loadCardholders();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  async function loadAccounts() {
    setIsLoadingAccounts(true);
    setError(null);
    try {
      const response = await fetch("/api/accounts");
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const detail = body?.detail ?? response.statusText;
        throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
      }
      const data = (await response.json()) as AccountRow[];
      setAccounts(data);
    } catch (e) {
      const err = e as Error;
      setError(err.message || "Failed to load accounts.");
      setAccounts([]);
    } finally {
      setIsLoadingAccounts(false);
    }
  }

  async function handleAssignCardholder(accountId: number) {
    const cardholderId = selectedCardholderIds[accountId];
    const name = (assignNames[accountId] ?? "").trim();
    
    if (!cardholderId && !name) {
      setError("Please select a cardholder or enter a name before assigning.");
      return;
    }
    
    setAssigningAccountId(accountId);
    setError(null);
    try {
      const payload: { cardholder_id?: number; display_name?: string } = {};
      if (cardholderId && cardholderId !== "") {
        payload.cardholder_id = cardholderId as number;
      } else if (name) {
        payload.display_name = name;
      }
      
      const response = await fetch(`/api/accounts/${accountId}/assign-cardholder`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const detail = body?.detail ?? response.statusText;
        throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
      }
      const updated = (await response.json()) as AccountRow;
      setAccounts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
      // Clear the selection
      setSelectedCardholderIds((prev) => ({ ...prev, [accountId]: "" }));
      setAssignNames((prev) => ({ ...prev, [accountId]: "" }));
    } catch (e) {
      const err = e as Error;
      setError(err.message || "Failed to assign cardholder.");
    } finally {
      setAssigningAccountId(null);
    }
  }

  async function handleUnassignCardholder(accountId: number) {
    if (!confirm("Are you sure you want to unassign this cardholder from the account?")) {
      return;
    }
    setAssigningAccountId(accountId);
    setError(null);
    try {
      const response = await fetch(`/api/accounts/${accountId}/unassign-cardholder`, {
        method: "POST",
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const detail = body?.detail ?? response.statusText;
        throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
      }
      const updated = (await response.json()) as AccountRow;
      setAccounts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
    } catch (e) {
      const err = e as Error;
      setError(err.message || "Failed to unassign cardholder.");
    } finally {
      setAssigningAccountId(null);
    }
  }

  async function loadCardholders() {
    console.log("=== loadCardholders START ===");
    setIsLoadingCardholders(true);
    setError(null);
    try {
      console.log("Fetching /api/cardholders");
      const response = await fetch("/api/cardholders");
      console.log("Response:", {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
      });
      
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const detail = body?.detail ?? response.statusText;
        console.error("Failed to load cardholders:", detail);
        throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
      }
      
      const data = (await response.json()) as CardholderRow[];
      console.log("Loaded cardholders:", {
        count: data.length,
        cardholders: data,
      });
      setCardholders(data);
      console.log("=== loadCardholders SUCCESS ===");
    } catch (e) {
      const err = e as Error;
      console.error("=== loadCardholders ERROR ===");
      console.error("Error:", err);
      setError(err.message || "Failed to load cardholders.");
      setCardholders([]);
    } finally {
      setIsLoadingCardholders(false);
      console.log("loadCardholders completed");
    }
  }

  async function handleCardholderSubmit(e?: React.FormEvent) {
    console.log("=== handleCardholderSubmit START ===");
    console.log("Event:", e);
    console.log("Current state:", {
      dialogCardholder,
      dialogMode,
      editingCardholderId,
      showCardholderDialog,
    });
    
    if (e) {
      e.preventDefault();
      e.stopPropagation();
      console.log("Prevented default and stopped propagation");
    }
    
    // Validation
    const nameTrimmed = dialogCardholder.name.trim();
    const surnameTrimmed = dialogCardholder.surname.trim();
    const emailTrimmed = dialogCardholder.email.trim();
    
    console.log("Validation check:", {
      nameTrimmed,
      surnameTrimmed,
      emailTrimmed,
      nameValid: !!nameTrimmed,
      surnameValid: !!surnameTrimmed,
      emailValid: !!emailTrimmed,
    });
    
    if (!nameTrimmed || !surnameTrimmed || !emailTrimmed) {
      const errorMsg = "Name, surname, and email are required.";
      console.error("Validation failed:", errorMsg);
      setError(errorMsg);
      return;
    }
    
    setError(null);
    console.log("Validation passed, proceeding with API call");
    
    try {
      const url = dialogMode === "create" ? "/api/cardholders" : `/api/cardholders/${editingCardholderId}`;
      const method = dialogMode === "create" ? "POST" : "PUT";
      
      const requestBody = {
        name: nameTrimmed,
        surname: surnameTrimmed,
        email: emailTrimmed,
      };
      
      console.log("API Request Details:", {
        url,
        method,
        requestBody,
        fullUrl: window.location.origin + url,
        windowLocation: {
          origin: window.location.origin,
          hostname: window.location.hostname,
          port: window.location.port,
          protocol: window.location.protocol,
        },
      });
      
      const fetchStartTime = Date.now();
      console.log("About to call fetch...");
      
      // Add timeout to fetch
      const timeoutMs = 10000; // 10 seconds
      const controller = new AbortController();
      const timeoutId = setTimeout(() => {
        console.error("Fetch timeout after", timeoutMs, "ms");
        controller.abort();
      }, timeoutMs);
      
      let response;
      try {
        response = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        console.log("Fetch promise resolved");
      } catch (fetchError) {
        clearTimeout(timeoutId);
        console.error("Fetch threw an error:", fetchError);
        if (fetchError instanceof Error) {
          if (fetchError.name === "AbortError") {
            throw new Error("Request timed out. Please check if the backend is running.");
          }
          throw new Error(`Network error: ${fetchError.message}`);
        }
        throw new Error(`Network error: ${String(fetchError)}`);
      }
      
      const fetchDuration = Date.now() - fetchStartTime;
      console.log("Fetch completed, processing response...");
      
      console.log("Fetch completed:", {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        headers: Object.fromEntries(response.headers.entries()),
        duration: `${fetchDuration}ms`,
      });
      
      // Try to read response body
      let responseBody = null;
      try {
        const text = await response.text();
        console.log("Response body (raw):", text);
        if (text) {
          responseBody = JSON.parse(text);
          console.log("Response body (parsed):", responseBody);
        }
      } catch (parseError) {
        console.warn("Could not parse response body:", parseError);
      }
      
      if (!response.ok) {
        const errorMsg = responseBody?.detail ?? `Failed to ${dialogMode} cardholder. Status: ${response.status}`;
        console.error("API Error Response:", {
          status: response.status,
          statusText: response.statusText,
          body: responseBody,
          errorMsg,
        });
        throw new Error(errorMsg);
      }
      
      console.log("API Success Response:", responseBody);
      
      // Close dialog immediately
      console.log("Closing dialog and resetting state");
      setShowCardholderDialog(false);
      setDialogCardholder({ name: "", surname: "", email: "" });
      setEditingCardholderId(null);
      setError(null);
      
      // Show success notification
      console.log("Showing success notification");
      setShowSuccessNotification(true);
      setTimeout(() => {
        console.log("Hiding success notification");
        setShowSuccessNotification(false);
      }, 3000);
      
      // Reload cardholders list
      console.log("Reloading cardholders list");
      await loadCardholders();
      console.log("=== handleCardholderSubmit SUCCESS ===");
    } catch (e) {
      const err = e as Error;
      console.error("=== handleCardholderSubmit ERROR ===");
      console.error("Error object:", err);
      console.error("Error message:", err.message);
      console.error("Error stack:", err.stack);
      setError(err.message || "An unexpected error occurred.");
      console.log("Error state set, keeping dialog open");
    }
  }

  function getFilteredAndSortedCardholders(): CardholderRow[] {
    let filtered = [...cardholders];

    // Apply filters
    if (cardholderFilters.name.trim()) {
      filtered = filtered.filter((ch) =>
        ch.name.toLowerCase().includes(cardholderFilters.name.toLowerCase())
      );
    }
    if (cardholderFilters.surname.trim()) {
      filtered = filtered.filter((ch) =>
        ch.surname.toLowerCase().includes(cardholderFilters.surname.toLowerCase())
      );
    }
    if (cardholderFilters.email.trim()) {
      filtered = filtered.filter((ch) =>
        ch.email.toLowerCase().includes(cardholderFilters.email.toLowerCase())
      );
    }

    // Apply sorting
    if (cardholderSort.column) {
      filtered.sort((a, b) => {
        const aVal = a[cardholderSort.column!];
        const bVal = b[cardholderSort.column!];
        if (aVal === bVal) return 0;
        const comparison = aVal < bVal ? -1 : 1;
        return cardholderSort.direction === "asc" ? comparison : -comparison;
      });
    }

    return filtered;
  }

  return (
    <>
      {/* Success Notification - outside section so it's always visible */}
      {showSuccessNotification && (
        <div
          style={{
            position: "fixed",
            top: "20px",
            right: "20px",
            background: "#10b981",
            color: "#fff",
            padding: "1rem 1.5rem",
            borderRadius: "0.5rem",
            boxShadow: "0 4px 6px rgba(0, 0, 0, 0.3)",
            zIndex: 2000,
            animation: "slideIn 0.3s ease-out",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ fontSize: "1.2rem" }}>✓</span>
            <span style={{ fontWeight: "500" }}>Added</span>
          </div>
        </div>
      )}
    <section>
      <h1>Admin / Finance</h1>

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem" }}>
        <button
          type="button"
          onClick={() => setActiveTab("ledger")}
          style={{
            padding: "0.35rem 0.8rem",
            borderRadius: "999px",
            border: "1px solid",
            borderColor: activeTab === "ledger" ? "#6366f1" : "rgba(148,163,184,0.5)",
            background: activeTab === "ledger" ? "rgba(79,70,229,0.35)" : "transparent",
            color: "#e5e7eb",
            fontSize: "0.8rem",
          }}
        >
          Imports & Ledger
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab("cards");
            if (accounts.length === 0 && !isLoadingAccounts) {
              void loadAccounts();
            }
          }}
          style={{
            padding: "0.35rem 0.8rem",
            borderRadius: "999px",
            border: "1px solid",
            borderColor: activeTab === "cards" ? "#6366f1" : "rgba(148,163,184,0.5)",
            background: activeTab === "cards" ? "rgba(79,70,229,0.35)" : "transparent",
            color: "#e5e7eb",
            fontSize: "0.8rem",
          }}
        >
          Cards & Accounts
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab("cardholders");
            if (cardholders.length === 0 && !isLoadingCardholders) {
              void loadCardholders();
            }
          }}
          style={{
            padding: "0.35rem 0.8rem",
            borderRadius: "999px",
            border: "1px solid",
            borderColor: activeTab === "cardholders" ? "#6366f1" : "rgba(148,163,184,0.5)",
            background: activeTab === "cardholders" ? "rgba(79,70,229,0.35)" : "transparent",
            color: "#e5e7eb",
            fontSize: "0.8rem",
          }}
        >
          Cardholders
        </button>
      </div>

      {activeTab === "ledger" && (
        <>
          <p>
            Upload a Format 1 bank CSV to populate the CCC ledger. The system will de-duplicate using
            composite keys so re-imports are safe.
          </p>

          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", alignItems: "center", flexWrap: "wrap" }}>
            <form onSubmit={handleSubmit} style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              <input
                type="file"
                accept=".csv"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setResult(null);
                  setError(null);
                }}
              />
              <button type="submit" disabled={isUploading || !file}>
                {isUploading ? "Uploading..." : "Upload CSV"}
              </button>
            </form>
            <button
              type="button"
              onClick={async () => {
                if (!confirm("Are you sure you want to clear the entire ledger? This will delete all transactions and import jobs. This action cannot be undone.")) {
                  return;
                }
                setError(null);
                try {
                  const response = await fetch("/api/imports/clear-ledger", { method: "DELETE" });
                  if (!response.ok) {
                    const body = await response.json().catch(() => null);
                    throw new Error(body?.detail ?? "Failed to clear ledger");
                  }
                  const data = await response.json();
                  alert(`Ledger cleared: ${data.transactions_deleted} transactions and ${data.import_jobs_deleted} import jobs deleted.`);
                  // Clear the ledger view
                  setLedger([]);
                  setResult(null);
                  // Reload accounts to refresh the view
                  if (activeTab === "cards") {
                    void loadAccounts();
                  }
                } catch (e) {
                  const err = e as Error;
                  setError(err.message || "Failed to clear ledger");
                }
              }}
              style={{
                padding: "0.5rem 1rem",
                background: "rgba(239, 68, 68, 0.2)",
                border: "1px solid rgba(239, 68, 68, 0.5)",
                color: "#fecaca",
                borderRadius: "0.25rem",
                cursor: "pointer",
              }}
            >
              Clear Ledger
            </button>
          </div>

          {error && activeTab === "ledger" && (
            <p style={{ color: "#fecaca", marginTop: 0 }}>
              {error}
            </p>
          )}

                  {result && (
                    <div>
                      <p>{result.message}</p>
                      <ul>
                        <li>Import job ID: {result.import_job_id ?? "n/a"}</li>
                        <li>Total parsed rows: {result.total_rows}</li>
                        <li>Inserted into ledger: {result.inserted}</li>
                        <li>Skipped (already existed): {result.skipped}</li>
                        {result.accounts_created !== undefined && (
                          <li>New accounts created: {result.accounts_created}</li>
                        )}
                      </ul>
                    </div>
                  )}

          <hr style={{ margin: "1.5rem 0", borderColor: "rgba(148,163,184,0.3)" }} />

          <h2 style={{ fontSize: "1.05rem", marginTop: 0 }}>Ledger (Format 1)</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void loadLedger();
            }}
            style={{ marginBottom: "0.75rem", display: "flex", gap: "0.5rem", alignItems: "center" }}
          >
            <label style={{ fontSize: "0.85rem" }}>
              Bank Account:
              <input
                type="text"
                value={bankAccountFilter}
                onChange={(e) => setBankAccountFilter(e.target.value)}
                placeholder="e.g. 033605207080"
                style={{ marginLeft: "0.4rem" }}
              />
            </label>
            <button type="submit" disabled={isLoadingLedger} style={{ paddingInline: "0.8rem" }}>
              {isLoadingLedger ? "Loading..." : "Refresh"}
            </button>
          </form>

          <div style={{ maxHeight: "320px", overflow: "auto", borderRadius: "0.75rem", border: "1px solid rgba(148,163,184,0.35)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
              <thead style={{ background: "rgba(15,23,42,0.9)" }}>
                <tr>
                  <th style={{ textAlign: "left", padding: "0.4rem 0.6rem" }}>Date</th>
                  <th style={{ textAlign: "left", padding: "0.4rem 0.6rem" }}>Bank Account</th>
                  <th style={{ textAlign: "left", padding: "0.4rem 0.6rem" }}>Narrative</th>
                  <th style={{ textAlign: "right", padding: "0.4rem 0.6rem" }}>Debit</th>
                  <th style={{ textAlign: "right", padding: "0.4rem 0.6rem" }}>Credit</th>
                  <th style={{ textAlign: "right", padding: "0.4rem 0.6rem" }}>Balance</th>
                  <th style={{ textAlign: "left", padding: "0.4rem 0.6rem" }}>Category</th>
                </tr>
              </thead>
              <tbody>
                {ledger.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: "0.6rem", textAlign: "center", opacity: 0.7 }}>
                      No transactions found for the current filter.
                    </td>
                  </tr>
                ) : (
                  ledger.map((tx) => (
                    <tr key={tx.id}>
                      <td style={{ padding: "0.4rem 0.6rem", whiteSpace: "nowrap" }}>{tx.date}</td>
                      <td style={{ padding: "0.4rem 0.6rem", whiteSpace: "nowrap" }}>{tx.bank_account}</td>
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
                      <td style={{ padding: "0.4rem 0.6rem" }}>{tx.raw_categories ?? ""}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {activeTab === "cards" && (
        <>
          {error && (
            <p style={{ color: "#fecaca", marginTop: 0 }}>
              {error}
            </p>
          )}

          <p>
            Manage cards (bank accounts) and assign them to cardholders. Select a cardholder from the dropdown
            or enter a name to create a new cardholder.
          </p>

          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
            <button
              type="button"
              disabled={isLoadingAccounts}
              onClick={() => void loadAccounts()}
              style={{ paddingInline: "0.8rem" }}
            >
              {isLoadingAccounts ? "Refreshing..." : "Refresh cards"}
            </button>
            <button
              type="button"
              onClick={async () => {
                try {
                  const response = await fetch("/api/accounts/link-transactions", { method: "POST" });
                  if (!response.ok) {
                    const body = await response.json().catch(() => null);
                    throw new Error(body?.detail ?? "Failed to link transactions");
                  }
                  const data = await response.json();
                  alert(`Success: ${data.message || `Linked ${data.linked || 0} transactions to accounts`}`);
                } catch (e) {
                  const err = e as Error;
                  setError(err.message || "Failed to link transactions to accounts");
                }
              }}
              style={{ paddingInline: "0.8rem", background: "#10b981", color: "#fff" }}
            >
              Link Transactions to Accounts
            </button>
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.85rem", cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={showUnlinkedOnly}
                onChange={(e) => setShowUnlinkedOnly(e.target.checked)}
              />
              Show unlinked only
            </label>
          </div>

          <div style={{ maxHeight: "320px", overflow: "auto", borderRadius: "0.75rem", border: "1px solid rgba(148,163,184,0.35)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
              <thead style={{ background: "rgba(15,23,42,0.9)" }}>
                <tr>
                  <th style={{ textAlign: "left", padding: "0.4rem 0.6rem" }}>Bank Account</th>
                  <th style={{ textAlign: "left", padding: "0.4rem 0.6rem" }}>Label</th>
                  <th style={{ textAlign: "left", padding: "0.4rem 0.6rem" }}>Cardholder</th>
                  <th style={{ textAlign: "left", padding: "0.4rem 0.6rem" }}>Assign</th>
                </tr>
              </thead>
              <tbody>
                {accounts.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ padding: "0.6rem", textAlign: "center", opacity: 0.7 }}>
                      No accounts loaded yet. Once cards are synced into the accounts table, they will
                      appear here.
                    </td>
                  </tr>
                ) : (
                  accounts
                    .filter((acc) => !showUnlinkedOnly || !acc.cardholder)
                    .map((acc) => {
                      // Extract last 4 digits for display
                      const last4 = acc.bank_account_number.length >= 4 
                        ? acc.bank_account_number.slice(-4) 
                        : acc.bank_account_number.padStart(4, '0');
                      return (
                      <tr key={acc.id}>
                        <td style={{ padding: "0.4rem 0.6rem" }}>{last4}</td>
                        <td style={{ padding: "0.4rem 0.6rem" }}>{acc.label ?? ""}</td>
                        <td style={{ padding: "0.4rem 0.6rem" }}>
                          {acc.cardholder ? (
                            <span>
                              {acc.cardholder.display_name}
                              <span style={{ fontSize: "0.75rem", opacity: 0.7, marginLeft: "0.5rem" }}>
                                (ID: {acc.cardholder.id})
                              </span>
                            </span>
                          ) : (
                            <span style={{ opacity: 0.7 }}>Unassigned</span>
                          )}
                        </td>
                        <td style={{ padding: "0.4rem 0.6rem" }}>
                          <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", flexWrap: "wrap" }}>
                            <select
                              value={selectedCardholderIds[acc.id] ?? ""}
                              onChange={(e) => {
                                const value = e.target.value === "" ? "" : parseInt(e.target.value, 10);
                                setSelectedCardholderIds((prev) => ({
                                  ...prev,
                                  [acc.id]: value,
                                }));
                                // Clear text input when selecting from dropdown
                                if (value !== "") {
                                  setAssignNames((prev) => ({ ...prev, [acc.id]: "" }));
                                }
                              }}
                              style={{
                                padding: "0.3rem 0.5rem",
                                background: "rgba(15, 23, 42, 0.9)",
                                border: "1px solid rgba(148, 163, 184, 0.3)",
                                borderRadius: "0.25rem",
                                color: "#e5e7eb",
                                fontSize: "0.8rem",
                                minWidth: "150px",
                              }}
                            >
                              <option value="">-- Select Cardholder --</option>
                              {cardholders.map((ch) => (
                                <option key={ch.id} value={ch.id}>
                                  {ch.display_name} (ID: {ch.id})
                                </option>
                              ))}
                            </select>
                            <span style={{ opacity: 0.6 }}>or</span>
                            <input
                              type="text"
                              placeholder="New cardholder name"
                              value={assignNames[acc.id] ?? ""}
                              onChange={(e) => {
                                setAssignNames((prev) => ({
                                  ...prev,
                                  [acc.id]: e.target.value,
                                }));
                                // Clear dropdown when typing
                                if (e.target.value) {
                                  setSelectedCardholderIds((prev) => ({ ...prev, [acc.id]: "" }));
                                }
                              }}
                              style={{
                                padding: "0.3rem 0.5rem",
                                minWidth: "150px",
                                fontSize: "0.8rem",
                              }}
                            />
                            <button
                              type="button"
                              disabled={assigningAccountId === acc.id}
                              onClick={() => void handleAssignCardholder(acc.id)}
                              style={{ padding: "0.3rem 0.6rem", fontSize: "0.8rem" }}
                            >
                              {assigningAccountId === acc.id ? "Saving..." : "Assign"}
                            </button>
                            {acc.cardholder && (
                              <button
                                type="button"
                                disabled={assigningAccountId === acc.id}
                                onClick={() => void handleUnassignCardholder(acc.id)}
                                style={{
                                  padding: "0.3rem 0.6rem",
                                  fontSize: "0.8rem",
                                  background: "rgba(239, 68, 68, 0.2)",
                                  border: "1px solid rgba(239, 68, 68, 0.3)",
                                  color: "#fecaca",
                                }}
                              >
                                Unassign
                              </button>
                            )}
                          </div>
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

      {activeTab === "cardholders" && (
        <>
          {error && activeTab === "cardholders" && (
            <p style={{ color: "#fecaca", marginTop: 0 }}>
              {error}
            </p>
          )}

          <p>
            Manage cardholders: name, surname, email, and manager assignment. Cardholders are independent
            of SSO accounts - when an employee leaves and SSO is revoked, the cardholder record persists
            for historical transaction data.
          </p>

          {/* Helper box for testing role views */}
          <div style={{ marginBottom: "0.75rem", padding: "0.75rem", background: "rgba(99, 102, 241, 0.15)", borderRadius: "0.5rem", border: "1px solid rgba(99, 102, 241, 0.3)" }}>
            <div style={{ fontSize: "0.85rem", fontWeight: "bold", marginBottom: "0.5rem", color: "#a5b4fc" }}>
              💡 Testing Role Views
            </div>
            <div style={{ fontSize: "0.8rem", opacity: 0.9 }}>
              To test Cardholder or Manager views: Select a role in the header dropdown, then enter a Cardholder ID below.
              <div style={{ marginTop: "0.5rem", display: "flex", gap: "1rem", flexWrap: "wrap" }}>
                <span>
                  <strong>Cardholder IDs:</strong> {cardholders.slice(0, 10).map(ch => ch.id).join(", ")}
                  {cardholders.length > 10 && ` (+${cardholders.length - 10} more)`}
                </span>
                <span>
                  <strong>Manager IDs:</strong> {Array.from(new Set(cardholders.filter(ch => ch.manager).map(ch => ch.manager!.id))).slice(0, 5).join(", ")}
                </span>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => {
                setDialogMode("create");
                setDialogCardholder({ name: "", surname: "", email: "" });
                setShowCardholderDialog(true);
              }}
              style={{ paddingInline: "0.8rem", background: "#6366f1", color: "#fff" }}
            >
              + Create Cardholder
            </button>
            <button
              type="button"
              disabled={isLoadingCardholders}
              onClick={() => void loadCardholders()}
              style={{ paddingInline: "0.8rem" }}
            >
              {isLoadingCardholders ? "Refreshing..." : "Refresh"}
            </button>
          </div>

          {/* Filters */}
          <div style={{ marginBottom: "0.75rem", padding: "0.75rem", background: "rgba(15,23,42,0.3)", borderRadius: "0.5rem", display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "flex-end" }}>
            <label style={{ fontSize: "0.85rem" }}>
              Filter Name:
              <input
                type="text"
                value={cardholderFilters.name}
                onChange={(e) => setCardholderFilters((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Filter by name..."
                style={{ marginLeft: "0.4rem", padding: "0.3rem", minWidth: "150px" }}
              />
            </label>
            <label style={{ fontSize: "0.85rem" }}>
              Filter Surname:
              <input
                type="text"
                value={cardholderFilters.surname}
                onChange={(e) => setCardholderFilters((prev) => ({ ...prev, surname: e.target.value }))}
                placeholder="Filter by surname..."
                style={{ marginLeft: "0.4rem", padding: "0.3rem", minWidth: "150px" }}
              />
            </label>
            <label style={{ fontSize: "0.85rem" }}>
              Filter Email:
              <input
                type="text"
                value={cardholderFilters.email}
                onChange={(e) => setCardholderFilters((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="Filter by email..."
                style={{ marginLeft: "0.4rem", padding: "0.3rem", minWidth: "150px" }}
              />
            </label>
            <button
              type="button"
              onClick={() => setCardholderFilters({ name: "", surname: "", email: "" })}
              style={{ paddingInline: "0.6rem", fontSize: "0.85rem" }}
            >
              Clear Filters
            </button>
          </div>

          <div style={{ maxHeight: "400px", overflow: "auto", borderRadius: "0.75rem", border: "1px solid rgba(148,163,184,0.35)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
              <thead style={{ background: "rgba(15,23,42,0.9)", position: "sticky", top: 0 }}>
                <tr>
                  <th style={{ textAlign: "left", padding: "0.4rem 0.6rem", fontWeight: "bold" }}>ID</th>
                  <th
                    style={{ textAlign: "left", padding: "0.4rem 0.6rem", cursor: "pointer", userSelect: "none" }}
                    onClick={() => {
                      setCardholderSort((prev) => ({
                        column: "name",
                        direction: prev.column === "name" && prev.direction === "asc" ? "desc" : "asc",
                      }));
                    }}
                  >
                    Name {cardholderSort.column === "name" && (cardholderSort.direction === "asc" ? "↑" : "↓")}
                  </th>
                  <th
                    style={{ textAlign: "left", padding: "0.4rem 0.6rem", cursor: "pointer", userSelect: "none" }}
                    onClick={() => {
                      setCardholderSort((prev) => ({
                        column: "surname",
                        direction: prev.column === "surname" && prev.direction === "asc" ? "desc" : "asc",
                      }));
                    }}
                  >
                    Surname {cardholderSort.column === "surname" && (cardholderSort.direction === "asc" ? "↑" : "↓")}
                  </th>
                  <th
                    style={{ textAlign: "left", padding: "0.4rem 0.6rem", cursor: "pointer", userSelect: "none" }}
                    onClick={() => {
                      setCardholderSort((prev) => ({
                        column: "email",
                        direction: prev.column === "email" && prev.direction === "asc" ? "desc" : "asc",
                      }));
                    }}
                  >
                    Email {cardholderSort.column === "email" && (cardholderSort.direction === "asc" ? "↑" : "↓")}
                  </th>
                  <th style={{ textAlign: "left", padding: "0.4rem 0.6rem" }}>SSO Linked</th>
                  <th style={{ textAlign: "left", padding: "0.4rem 0.6rem" }}>Manager</th>
                  <th style={{ textAlign: "left", padding: "0.4rem 0.6rem" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {getFilteredAndSortedCardholders().length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: "0.6rem", textAlign: "center", opacity: 0.7 }}>
                      {cardholders.length === 0
                        ? "No cardholders yet. Click 'Create Cardholder' to add one."
                        : "No cardholders match the current filters."}
                    </td>
                  </tr>
                ) : (
                  getFilteredAndSortedCardholders().map((ch) => (
                    <tr key={ch.id}>
                      <td style={{ padding: "0.4rem 0.6rem", fontWeight: "bold", color: "#a5b4fc" }}>{ch.id}</td>
                      <td style={{ padding: "0.4rem 0.6rem" }}>{ch.name}</td>
                      <td style={{ padding: "0.4rem 0.6rem" }}>{ch.surname}</td>
                      <td style={{ padding: "0.4rem 0.6rem" }}>{ch.email}</td>
                      <td style={{ padding: "0.4rem 0.6rem" }}>
                        {ch.user_id ? (
                          <span style={{ color: "#86efac" }}>Yes (ID: {ch.user_id})</span>
                        ) : (
                          <span style={{ opacity: 0.7 }}>No</span>
                        )}
                      </td>
                      <td style={{ padding: "0.4rem 0.6rem" }}>
                        {ch.manager ? (
                          <span style={{ color: "#86efac" }}>
                            {ch.manager.email || `Manager ID: ${ch.manager.id}`}
                            {ch.manager.id && (
                              <span style={{ fontSize: "0.75rem", opacity: 0.8, marginLeft: "0.25rem" }}>
                                (ID: {ch.manager.id})
                              </span>
                            )}
                          </span>
                        ) : (
                          <span style={{ opacity: 0.7 }}>No manager</span>
                        )}
                      </td>
                      <td style={{ padding: "0.4rem 0.6rem" }}>
                        <div style={{ display: "flex", gap: "0.3rem" }}>
                          <button
                            type="button"
                            onClick={() => {
                              setDialogMode("edit");
                              setDialogCardholder({ name: ch.name, surname: ch.surname, email: ch.email });
                              setEditingCardholderId(ch.id);
                              setShowCardholderDialog(true);
                            }}
                            style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem", background: "#6366f1", color: "#fff", border: "none", borderRadius: "0.25rem", cursor: "pointer" }}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={async () => {
                              if (!confirm(`Are you sure you want to delete ${ch.display_name}? This action cannot be undone.`)) {
                                return;
                              }
                              setError(null);
                              try {
                                // Note: We'll need to add a DELETE endpoint
                                const response = await fetch(`/api/cardholders/${ch.id}`, {
                                  method: "DELETE",
                                });
                                if (!response.ok) {
                                  const body = await response.json().catch(() => null);
                                  throw new Error(body?.detail ?? "Failed to delete cardholder.");
                                }
                                await loadCardholders();
                              } catch (e) {
                                const err = e as Error;
                                setError(err.message);
                              }
                            }}
                            style={{ padding: "0.2rem 0.5rem", fontSize: "0.75rem", background: "#ef4444", color: "#fff", border: "none", borderRadius: "0.25rem", cursor: "pointer" }}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Cardholder Dialog */}
          {showCardholderDialog && (
            <div
              style={{
                position: "fixed",
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: "rgba(0, 0, 0, 0.7)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 1000,
              }}
              onClick={(e) => {
                if (e.target === e.currentTarget) {
                  setShowCardholderDialog(false);
                }
              }}
            >
              <div
                style={{
                  background: "#1e293b",
                  padding: "1.5rem",
                  borderRadius: "0.75rem",
                  minWidth: "400px",
                  maxWidth: "90vw",
                  border: "1px solid rgba(148,163,184,0.3)",
                }}
                onClick={(e) => {
                  // Prevent clicks inside the dialog from closing it
                  e.stopPropagation();
                }}
                onKeyDown={(e) => {
                  // Close on Escape key
                  if (e.key === "Escape") {
                    setShowCardholderDialog(false);
                    setError(null);
                  }
                }}
              >
                <h2 style={{ marginTop: 0, marginBottom: "1rem" }}>
                  {dialogMode === "create" ? "Create Cardholder" : "Edit Cardholder"}
                </h2>
                {error && (
                  <p style={{ color: "#fecaca", marginBottom: "1rem", fontSize: "0.9rem" }}>
                    {error}
                  </p>
                )}
                <form
                  onSubmit={handleCardholderSubmit}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1rem" }}>
                    <label style={{ fontSize: "0.9rem" }}>
                      Name:
                      <input
                        type="text"
                        value={dialogCardholder.name}
                        onChange={(e) => setDialogCardholder((prev) => ({ ...prev, name: e.target.value }))}
                        required
                        style={{ width: "100%", marginTop: "0.25rem", padding: "0.5rem", background: "#0f172a", border: "1px solid rgba(148,163,184,0.3)", borderRadius: "0.25rem", color: "#e5e7eb" }}
                      />
                    </label>
                    <label style={{ fontSize: "0.9rem" }}>
                      Surname:
                      <input
                        type="text"
                        value={dialogCardholder.surname}
                        onChange={(e) => setDialogCardholder((prev) => ({ ...prev, surname: e.target.value }))}
                        required
                        style={{ width: "100%", marginTop: "0.25rem", padding: "0.5rem", background: "#0f172a", border: "1px solid rgba(148,163,184,0.3)", borderRadius: "0.25rem", color: "#e5e7eb" }}
                      />
                    </label>
                    <label style={{ fontSize: "0.9rem" }}>
                      Email:
                      <input
                        type="email"
                        value={dialogCardholder.email}
                        onChange={(e) => setDialogCardholder((prev) => ({ ...prev, email: e.target.value }))}
                        required
                        style={{ width: "100%", marginTop: "0.25rem", padding: "0.5rem", background: "#0f172a", border: "1px solid rgba(148,163,184,0.3)", borderRadius: "0.25rem", color: "#e5e7eb" }}
                      />
                    </label>
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                    <button
                      type="button"
                      onClick={() => {
                        setShowCardholderDialog(false);
                        setDialogCardholder({ name: "", surname: "", email: "" });
                        setEditingCardholderId(null);
                        setError(null);
                      }}
                      style={{ padding: "0.5rem 1rem", background: "transparent", border: "1px solid rgba(148,163,184,0.5)", borderRadius: "0.25rem", color: "#e5e7eb", cursor: "pointer" }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        console.log("Submit button clicked in dialog");
                        console.log("Button event:", e);
                        console.log("Current dialogCardholder:", dialogCardholder);
                        handleCardholderSubmit(e);
                      }}
                      style={{ padding: "0.5rem 1rem", background: "#6366f1", border: "none", borderRadius: "0.25rem", color: "#fff", cursor: "pointer" }}
                    >
                      {dialogMode === "create" ? "Create" : "Save"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </>
      )}
    </section>
    </>
  );
}



