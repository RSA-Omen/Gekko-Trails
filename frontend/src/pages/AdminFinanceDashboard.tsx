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

type ManagerRow = {
  id: number;
  user_id: number | null;
  email: string | null;
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

export function AdminFinanceDashboard() {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [result, setResult] = useState<ImportResult>(null);
  const [error, setError] = useState<string | null>(null);
  const [bankAccountFilter, setBankAccountFilter] = useState<string>("");
  const [ledger, setLedger] = useState<TransactionRow[]>([]);
  const [isLoadingLedger, setIsLoadingLedger] = useState(false);
  
  // Ledger table filters and sorting
  const [ledgerFilters, setLedgerFilters] = useState({
    bankAccount: "",
    narrative: "",
    category: "",
    dateFrom: "",
    dateTo: "",
  });
  const [ledgerSort, setLedgerSort] = useState<{
    column: keyof TransactionRow | null;
    direction: "asc" | "desc";
  }>({ column: null, direction: "asc" });
  const [activeTab, setActiveTab] = useState<"ledger" | "cards" | "cardholders" | "managers" | "finance-inbox">("ledger");
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
  const [dialogManagerId, setDialogManagerId] = useState<number | "">("");

  // Managers management state
  const [managers, setManagers] = useState<ManagerRow[]>([]);
  const [isLoadingManagers, setIsLoadingManagers] = useState(false);

  // Finance Inbox state
  type FinanceInboxItem = {
    import_job_id: number;
    file_name: string;
    created_at: string;
    transaction_count: number;
    finance_batch_id: number | null;
    status: string;
    released_to_cardholders: boolean;
  };
  const [financeInbox, setFinanceInbox] = useState<FinanceInboxItem[]>([]);
  const [isLoadingFinanceInbox, setIsLoadingFinanceInbox] = useState(false);
  const [selectedImportJobId, setSelectedImportJobId] = useState<number | null>(null);
  const [batchItems, setBatchItems] = useState<Format2Item[]>([]);
  const [isLoadingBatchItems, setIsLoadingBatchItems] = useState(false);
  const [showReleaseDialog, setShowReleaseDialog] = useState(false);
  const [releasingBatchId, setReleasingBatchId] = useState<number | null>(null);
  const [selectedCardholdersForRelease, setSelectedCardholdersForRelease] = useState<Set<number>>(new Set());
  const [isReleasing, setIsReleasing] = useState(false);
  const [cardholdersWithTransactions, setCardholdersWithTransactions] = useState<Set<number>>(new Set());
  const [alreadyReleasedCardholders, setAlreadyReleasedCardholders] = useState<Set<number>>(new Set());
  const [isLoadingCardholdersWithTransactions, setIsLoadingCardholdersWithTransactions] = useState(false);
  
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
      // Managers are used when editing cardholders
      if (managers.length === 0 && !isLoadingManagers) {
        void loadManagers();
      }
    } else if (activeTab === "managers") {
      void loadManagers();
    } else if (activeTab === "finance-inbox") {
      void loadFinanceInbox();
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

  async function loadManagers() {
    setIsLoadingManagers(true);
    setError(null);
    try {
      const response = await fetch("/api/managers");
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const detail = body?.detail ?? response.statusText;
        throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
      }
      const data = (await response.json()) as ManagerRow[];
      setManagers(data);
    } catch (e) {
      const err = e as Error;
      setError(err.message || "Failed to load managers.");
      setManagers([]);
    } finally {
      setIsLoadingManagers(false);
    }
  }

  async function loadFinanceInbox() {
    setIsLoadingFinanceInbox(true);
    setError(null);
    try {
      const response = await fetch("/api/finance/inbox");
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const detail = body?.detail ?? response.statusText;
        throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
      }
      const data = (await response.json()) as { items: FinanceInboxItem[] };
      setFinanceInbox(data.items);
    } catch (e) {
      const err = e as Error;
      setError(err.message || "Failed to load finance inbox.");
      setFinanceInbox([]);
    } finally {
      setIsLoadingFinanceInbox(false);
    }
  }

  async function openFinanceBatch(importJobId: number) {
    setError(null);
    try {
      console.log(`Opening finance batch for import job ${importJobId}...`);
      const response = await fetch(`/api/finance/batches/${importJobId}/open`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner_type: "finance",
          owner_id: null,
        }),
      });
      console.log(`Open batch response status: ${response.status} ${response.statusText}`);
      
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        console.error("Error response body:", body);
        const detail = body?.detail ?? response.statusText;
        const errorMsg = typeof detail === "string" ? detail : JSON.stringify(detail);
        console.error("Error message:", errorMsg);
        throw new Error(errorMsg);
      }
      
      const batchData = await response.json();
      console.log("Batch opened successfully:", batchData);
      
      await loadFinanceInbox();
      setSelectedImportJobId(importJobId);
      await loadBatchItems(importJobId);
    } catch (e) {
      const err = e as Error;
      console.error("Error opening finance batch:", err);
      setError(err.message || "Failed to open finance batch.");
    }
  }

  async function completeFinanceBatch(batchId: number) {
    setError(null);
    try {
      const response = await fetch(`/api/finance/batches/${batchId}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const detail = body?.detail ?? response.statusText;
        throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
      }
      // Reload inbox to update status, but keep the review screen open
      await loadFinanceInbox();
      // Don't navigate away - user can now click "Release to Cardholders"
    } catch (e) {
      const err = e as Error;
      setError(err.message || "Failed to complete finance batch.");
    }
  }

  async function loadBatchItems(importJobId: number) {
    setIsLoadingBatchItems(true);
    setError(null);
    try {
      console.log(`Loading batch items for import job ${importJobId}...`);
      const response = await fetch(`/api/classifications/finance/batch/${importJobId}`);
      console.log(`Response status: ${response.status} ${response.statusText}`);
      
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        console.error("Error response body:", body);
        const detail = body?.detail ?? response.statusText;
        const errorMsg = typeof detail === "string" ? detail : JSON.stringify(detail);
        console.error("Error message:", errorMsg);
        throw new Error(errorMsg);
      }
      
      const data = (await response.json()) as { items: Format2Item[] };
      console.log(`Loaded ${data.items.length} batch items`);
      setBatchItems(data.items);
    } catch (e) {
      const err = e as Error;
      console.error("Error loading batch items:", err);
      const errorMsg = err.message || "Failed to load batch items.";
      setError(errorMsg);
      setBatchItems([]);
    } finally {
      setIsLoadingBatchItems(false);
    }
  }

  async function loadCardholdersWithTransactions(batchId: number) {
    setIsLoadingCardholdersWithTransactions(true);
    setError(null);
    try {
      const response = await fetch(`/api/finance/batches/${batchId}/cardholders-with-transactions`);
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const detail = body?.detail ?? response.statusText;
        throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
      }
      const data = (await response.json()) as { cardholder_ids: number[]; already_released_ids?: number[] };
      setCardholdersWithTransactions(new Set(data.cardholder_ids));
      setAlreadyReleasedCardholders(new Set(data.already_released_ids || []));
    } catch (e) {
      const err = e as Error;
      console.error("Error loading cardholders with transactions:", err);
      setError(err.message || "Failed to load cardholders with transactions.");
      setCardholdersWithTransactions(new Set());
      setAlreadyReleasedCardholders(new Set());
    } finally {
      setIsLoadingCardholdersWithTransactions(false);
    }
  }

  async function releaseBatchToCardholders(batchId: number, cardholderIds: number[]) {
    setIsReleasing(true);
    setError(null);
    const results: Array<{ cardholderId: number; success: boolean; message: string }> = [];
    
    for (const cardholderId of cardholderIds) {
      try {
        const response = await fetch(`/api/cardholders/${cardholderId}/batches/from-finance`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            owner_type: "cardholder",
            parent_batch_id: batchId,
            title: `Cardholder ${cardholderId} - Classification`,
            label: `Batch ${batchId}`,
          }),
        });
        
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          const detail = body?.detail ?? response.statusText;
          results.push({
            cardholderId,
            success: false,
            message: typeof detail === "string" ? detail : JSON.stringify(detail),
          });
        } else {
          const data = await response.json();
          results.push({
            cardholderId,
            success: true,
            message: `Batch with ${data.transaction_count} transactions`,
          });
        }
      } catch (e) {
        const err = e as Error;
        results.push({
          cardholderId,
          success: false,
          message: err.message || "Failed to create batch",
        });
      }
    }
    
    setIsReleasing(false);
    
    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    
    if (failCount === 0) {
      alert(`Successfully released batch to ${successCount} cardholder(s).`);
      // Reload the list to update "already released" status
      if (releasingBatchId) {
        await loadCardholdersWithTransactions(releasingBatchId);
      }
      setSelectedCardholdersForRelease(new Set());
      // Don't close dialog - user can release to more cardholders if needed
    } else {
      const errorDetails = results.filter(r => !r.success).map(r => `Cardholder ${r.cardholderId}: ${r.message}`).join("\n");
      setError(`Released to ${successCount} cardholder(s), failed for ${failCount}:\n${errorDetails}`);
    }
  }

  async function handleAssignCardholder(accountId: number) {
    const cardholderId = selectedCardholderIds[accountId];
    const name = (assignNames[accountId] ?? "").trim();
    
    if ((cardholderId === undefined || cardholderId === "") && !name) {
      setError("Please select a cardholder or enter a name before assigning.");
      return;
    }
    
    setAssigningAccountId(accountId);
    setError(null);
    try {
      const payload: { cardholder_id?: number; display_name?: string } = {};
      if (cardholderId !== undefined && cardholderId !== "") {
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
        manager_id: dialogManagerId === "" ? null : dialogManagerId,
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
      setDialogManagerId("");
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
        const column = cardholderSort.column!;
        const aVal = a[column] as string | number | null;
        const bVal = b[column] as string | number | null;
        if (aVal === bVal) return 0;
        const aSafe = aVal ?? "";
        const bSafe = bVal ?? "";
        const comparison = aSafe < bSafe ? -1 : 1;
        return cardholderSort.direction === "asc" ? comparison : -comparison;
      });
    }

    return filtered;
  }

  function getFilteredAndSortedLedger(): TransactionRow[] {
    let filtered = [...ledger];

    // Apply filters
    if (ledgerFilters.bankAccount.trim()) {
      filtered = filtered.filter((tx) =>
        tx.bank_account.toLowerCase().includes(ledgerFilters.bankAccount.toLowerCase())
      );
    }
    if (ledgerFilters.narrative.trim()) {
      filtered = filtered.filter((tx) =>
        (tx.narrative || "").toLowerCase().includes(ledgerFilters.narrative.toLowerCase())
      );
    }
    if (ledgerFilters.category.trim()) {
      filtered = filtered.filter((tx) =>
        (tx.raw_categories || "").toLowerCase().includes(ledgerFilters.category.toLowerCase())
      );
    }
    if (ledgerFilters.dateFrom.trim()) {
      filtered = filtered.filter((tx) => tx.date >= ledgerFilters.dateFrom);
    }
    if (ledgerFilters.dateTo.trim()) {
      filtered = filtered.filter((tx) => tx.date <= ledgerFilters.dateTo);
    }

    // Apply sorting
    if (ledgerSort.column) {
      filtered.sort((a, b) => {
        const column = ledgerSort.column!;
        let aVal: string | number | null = a[column] as string | number | null;
        let bVal: string | number | null = b[column] as string | number | null;

        // Handle numeric columns
        if (column === "debit_amount" || column === "credit_amount" || column === "balance") {
          aVal = aVal ?? 0;
          bVal = bVal ?? 0;
          const comparison = (aVal as number) < (bVal as number) ? -1 : 1;
          return ledgerSort.direction === "asc" ? comparison : -comparison;
        }

        // Handle string columns
        if (aVal === bVal) return 0;
        const aSafe = (aVal ?? "").toString();
        const bSafe = (bVal ?? "").toString();
        const comparison = aSafe < bSafe ? -1 : 1;
        return ledgerSort.direction === "asc" ? comparison : -comparison;
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
        <button
          type="button"
          onClick={() => {
            setActiveTab("managers");
            if (managers.length === 0 && !isLoadingManagers) {
              void loadManagers();
            }
          }}
          style={{
            padding: "0.35rem 0.8rem",
            borderRadius: "999px",
            border: "1px solid",
            borderColor: activeTab === "managers" ? "#6366f1" : "rgba(148,163,184,0.5)",
            background: activeTab === "managers" ? "rgba(79,70,229,0.35)" : "transparent",
            color: "#e5e7eb",
            fontSize: "0.8rem",
          }}
        >
          Managers
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab("finance-inbox");
            if (financeInbox.length === 0 && !isLoadingFinanceInbox) {
              void loadFinanceInbox();
            }
          }}
          style={{
            padding: "0.35rem 0.8rem",
            borderRadius: "999px",
            border: "1px solid",
            borderColor: activeTab === "finance-inbox" ? "#6366f1" : "rgba(148,163,184,0.5)",
            background: activeTab === "finance-inbox" ? "rgba(79,70,229,0.35)" : "transparent",
            color: "#e5e7eb",
            fontSize: "0.8rem",
          }}
        >
          Finance Inbox
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
                  // Reload accounts to refresh the view if needed
                  void loadAccounts();
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
          
          {/* Filters */}
          <div style={{ marginBottom: "0.75rem", padding: "0.5rem", background: "rgba(15,23,42,0.3)", borderRadius: "0.5rem", display: "flex", gap: "0.4rem", flexWrap: "nowrap", alignItems: "center" }}>
            <label style={{ fontSize: "0.75rem", display: "flex", alignItems: "center", gap: "0.25rem" }}>
              Account:
              <input
                type="text"
                value={ledgerFilters.bankAccount}
                onChange={(e) => setLedgerFilters((prev) => ({ ...prev, bankAccount: e.target.value }))}
                placeholder="Account..."
                style={{ padding: "0.25rem 0.4rem", width: "100px", fontSize: "0.75rem" }}
              />
            </label>
            <label style={{ fontSize: "0.75rem", display: "flex", alignItems: "center", gap: "0.25rem" }}>
              Narrative:
              <input
                type="text"
                value={ledgerFilters.narrative}
                onChange={(e) => setLedgerFilters((prev) => ({ ...prev, narrative: e.target.value }))}
                placeholder="Narrative..."
                style={{ padding: "0.25rem 0.4rem", width: "120px", fontSize: "0.75rem" }}
              />
            </label>
            <label style={{ fontSize: "0.75rem", display: "flex", alignItems: "center", gap: "0.25rem" }}>
              Category:
              <input
                type="text"
                value={ledgerFilters.category}
                onChange={(e) => setLedgerFilters((prev) => ({ ...prev, category: e.target.value }))}
                placeholder="Category..."
                style={{ padding: "0.25rem 0.4rem", width: "100px", fontSize: "0.75rem" }}
              />
            </label>
            <label style={{ fontSize: "0.75rem", display: "flex", alignItems: "center", gap: "0.25rem" }}>
              From:
              <input
                type="date"
                value={ledgerFilters.dateFrom}
                onChange={(e) => setLedgerFilters((prev) => ({ ...prev, dateFrom: e.target.value }))}
                style={{ padding: "0.25rem 0.4rem", fontSize: "0.75rem" }}
              />
            </label>
            <label style={{ fontSize: "0.75rem", display: "flex", alignItems: "center", gap: "0.25rem" }}>
              To:
              <input
                type="date"
                value={ledgerFilters.dateTo}
                onChange={(e) => setLedgerFilters((prev) => ({ ...prev, dateTo: e.target.value }))}
                style={{ padding: "0.25rem 0.4rem", fontSize: "0.75rem" }}
              />
            </label>
            <button
              type="button"
              onClick={() => setLedgerFilters({ bankAccount: "", narrative: "", category: "", dateFrom: "", dateTo: "" })}
              style={{ padding: "0.25rem 0.5rem", fontSize: "0.75rem", whiteSpace: "nowrap" }}
            >
              Clear
            </button>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void loadLedger();
            }}
            style={{ marginBottom: "0.75rem", display: "flex", gap: "0.5rem", alignItems: "center" }}
          >
            <label style={{ fontSize: "0.85rem" }}>
              Bank Account (API Filter):
              <input
                type="text"
                value={bankAccountFilter}
                onChange={(e) => setBankAccountFilter(e.target.value)}
                placeholder="e.g. 033605207080"
                style={{ marginLeft: "0.4rem" }}
              />
            </label>
            <button type="submit" disabled={isLoadingLedger} style={{ paddingInline: "0.8rem" }}>
              {isLoadingLedger ? "Loading..." : "Refresh from Server"}
            </button>
          </form>

          <div style={{ maxHeight: "320px", overflow: "auto", borderRadius: "0.75rem", border: "1px solid rgba(148,163,184,0.35)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
              <thead style={{ background: "rgba(15,23,42,0.9)", position: "sticky", top: 0 }}>
                <tr>
                  <th
                    style={{ textAlign: "left", padding: "0.4rem 0.6rem", cursor: "pointer", userSelect: "none" }}
                    onClick={() => {
                      setLedgerSort((prev) => ({
                        column: "date",
                        direction: prev.column === "date" && prev.direction === "asc" ? "desc" : "asc",
                      }));
                    }}
                  >
                    Date {ledgerSort.column === "date" && (ledgerSort.direction === "asc" ? "↑" : "↓")}
                  </th>
                  <th
                    style={{ textAlign: "left", padding: "0.4rem 0.6rem", cursor: "pointer", userSelect: "none" }}
                    onClick={() => {
                      setLedgerSort((prev) => ({
                        column: "bank_account",
                        direction: prev.column === "bank_account" && prev.direction === "asc" ? "desc" : "asc",
                      }));
                    }}
                  >
                    Bank Account {ledgerSort.column === "bank_account" && (ledgerSort.direction === "asc" ? "↑" : "↓")}
                  </th>
                  <th
                    style={{ textAlign: "left", padding: "0.4rem 0.6rem", cursor: "pointer", userSelect: "none" }}
                    onClick={() => {
                      setLedgerSort((prev) => ({
                        column: "narrative",
                        direction: prev.column === "narrative" && prev.direction === "asc" ? "desc" : "asc",
                      }));
                    }}
                  >
                    Narrative {ledgerSort.column === "narrative" && (ledgerSort.direction === "asc" ? "↑" : "↓")}
                  </th>
                  <th
                    style={{ textAlign: "right", padding: "0.4rem 0.6rem", cursor: "pointer", userSelect: "none" }}
                    onClick={() => {
                      setLedgerSort((prev) => ({
                        column: "debit_amount",
                        direction: prev.column === "debit_amount" && prev.direction === "asc" ? "desc" : "asc",
                      }));
                    }}
                  >
                    Debit {ledgerSort.column === "debit_amount" && (ledgerSort.direction === "asc" ? "↑" : "↓")}
                  </th>
                  <th
                    style={{ textAlign: "right", padding: "0.4rem 0.6rem", cursor: "pointer", userSelect: "none" }}
                    onClick={() => {
                      setLedgerSort((prev) => ({
                        column: "credit_amount",
                        direction: prev.column === "credit_amount" && prev.direction === "asc" ? "desc" : "asc",
                      }));
                    }}
                  >
                    Credit {ledgerSort.column === "credit_amount" && (ledgerSort.direction === "asc" ? "↑" : "↓")}
                  </th>
                  <th
                    style={{ textAlign: "right", padding: "0.4rem 0.6rem", cursor: "pointer", userSelect: "none" }}
                    onClick={() => {
                      setLedgerSort((prev) => ({
                        column: "balance",
                        direction: prev.column === "balance" && prev.direction === "asc" ? "desc" : "asc",
                      }));
                    }}
                  >
                    Balance {ledgerSort.column === "balance" && (ledgerSort.direction === "asc" ? "↑" : "↓")}
                  </th>
                  <th
                    style={{ textAlign: "left", padding: "0.4rem 0.6rem", cursor: "pointer", userSelect: "none" }}
                    onClick={() => {
                      setLedgerSort((prev) => ({
                        column: "raw_categories",
                        direction: prev.column === "raw_categories" && prev.direction === "asc" ? "desc" : "asc",
                      }));
                    }}
                  >
                    Category {ledgerSort.column === "raw_categories" && (ledgerSort.direction === "asc" ? "↑" : "↓")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {getFilteredAndSortedLedger().length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: "0.6rem", textAlign: "center", opacity: 0.7 }}>
                      {ledger.length === 0
                        ? "No transactions found. Upload a CSV to populate the ledger."
                        : "No transactions match the current filters."}
                    </td>
                  </tr>
                ) : (
                  getFilteredAndSortedLedger().map((tx) => (
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
                setDialogManagerId("");
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
                              setDialogManagerId(ch.manager?.id ?? "");
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
                    <label style={{ fontSize: "0.9rem" }}>
                      Manager:
                      <select
                        value={dialogManagerId === "" ? "" : dialogManagerId}
                        onChange={(e) => {
                          const value = e.target.value === "" ? "" : parseInt(e.target.value, 10);
                          setDialogManagerId(value);
                        }}
                        style={{
                          width: "100%",
                          marginTop: "0.25rem",
                          padding: "0.5rem",
                          background: "#0f172a",
                          border: "1px solid rgba(148,163,184,0.3)",
                          borderRadius: "0.25rem",
                          color: "#e5e7eb",
                        }}
                      >
                        <option value="">No manager</option>
                        {managers.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.email ? `${m.email} (ID: ${m.id})` : `Manager ID: ${m.id}`}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                    <button
                      type="button"
                      onClick={() => {
                        setShowCardholderDialog(false);
                        setDialogCardholder({ name: "", surname: "", email: "" });
                        setDialogManagerId("");
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
      {activeTab === "managers" && (
        <>
          {error && activeTab === "managers" && (
            <p style={{ color: "#fecaca", marginTop: 0 }}>
              {error}
            </p>
          )}

          <p>
            View managers imported from historic data. Managers can be assigned to cardholders
            in the Cardholders tab by editing a cardholder and selecting a manager.
          </p>

          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              disabled={isLoadingManagers}
              onClick={() => void loadManagers()}
              style={{ paddingInline: "0.8rem" }}
            >
              {isLoadingManagers ? "Refreshing..." : "Refresh"}
            </button>
          </div>

          <div style={{ maxHeight: "320px", overflow: "auto", borderRadius: "0.75rem", border: "1px solid rgba(148,163,184,0.35)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
              <thead style={{ background: "rgba(15,23,42,0.9)" }}>
                <tr>
                  <th style={{ textAlign: "left", padding: "0.4rem 0.6rem" }}>ID</th>
                  <th style={{ textAlign: "left", padding: "0.4rem 0.6rem" }}>Email</th>
                </tr>
              </thead>
              <tbody>
                {managers.length === 0 ? (
                  <tr>
                    <td colSpan={2} style={{ padding: "0.6rem", textAlign: "center", opacity: 0.7 }}>
                      {isLoadingManagers ? "Loading managers..." : "No managers found."}
                    </td>
                  </tr>
                ) : (
                  managers.map((m) => (
                    <tr key={m.id}>
                      <td style={{ padding: "0.4rem 0.6rem", fontWeight: "bold", color: "#a5b4fc" }}>{m.id}</td>
                      <td style={{ padding: "0.4rem 0.6rem" }}>{m.email || "(email unknown)"}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {activeTab === "finance-inbox" && (
        <>
          {error && activeTab === "finance-inbox" && (
            <p style={{ color: "#fecaca", marginTop: 0 }}>
              {error}
            </p>
          )}

          <p>
            Review imported CSV files and mark batches as ready for cardholders to classify.
          </p>

          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              disabled={isLoadingFinanceInbox}
              onClick={() => void loadFinanceInbox()}
              style={{ paddingInline: "0.8rem" }}
            >
              {isLoadingFinanceInbox ? "Refreshing..." : "Refresh"}
            </button>
          </div>

          {selectedImportJobId === null ? (
            <div style={{ maxHeight: "400px", overflow: "auto", borderRadius: "0.75rem", border: "1px solid rgba(148,163,184,0.35)" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                <thead style={{ background: "rgba(15,23,42,0.9)", position: "sticky", top: 0 }}>
                  <tr>
                    <th style={{ textAlign: "left", padding: "0.4rem 0.6rem" }}>Import Job ID</th>
                    <th style={{ textAlign: "left", padding: "0.4rem 0.6rem" }}>File Name</th>
                    <th style={{ textAlign: "left", padding: "0.4rem 0.6rem" }}>Created</th>
                    <th style={{ textAlign: "right", padding: "0.4rem 0.6rem" }}>Transactions</th>
                    <th style={{ textAlign: "left", padding: "0.4rem 0.6rem" }}>Status</th>
                    <th style={{ textAlign: "left", padding: "0.4rem 0.6rem" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {financeInbox.length === 0 ? (
                    <tr>
                      <td colSpan={6} style={{ padding: "0.6rem", textAlign: "center", opacity: 0.7 }}>
                        {isLoadingFinanceInbox ? "Loading inbox..." : "No imports found."}
                      </td>
                    </tr>
                  ) : (
                    financeInbox.map((item) => (
                      <tr key={item.import_job_id}>
                        <td style={{ padding: "0.4rem 0.6rem", fontWeight: "bold", color: "#a5b4fc" }}>{item.import_job_id}</td>
                        <td style={{ padding: "0.4rem 0.6rem" }}>{item.file_name}</td>
                        <td style={{ padding: "0.4rem 0.6rem", whiteSpace: "nowrap" }}>{new Date(item.created_at).toLocaleDateString()}</td>
                        <td style={{ padding: "0.4rem 0.6rem", textAlign: "right" }}>{item.transaction_count}</td>
                        <td style={{ padding: "0.4rem 0.6rem" }}>
                          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
                            <span style={{
                              padding: "0.2rem 0.5rem",
                              borderRadius: "0.25rem",
                              fontSize: "0.75rem",
                              background: item.status === "completed" ? "rgba(16, 185, 129, 0.2)" : item.status === "open" ? "rgba(99, 102, 241, 0.2)" : "rgba(148, 163, 184, 0.2)",
                              color: item.status === "completed" ? "#86efac" : item.status === "open" ? "#a5b4fc" : "#cbd5e1",
                            }}>
                              {item.status}
                            </span>
                            {item.status === "completed" && item.released_to_cardholders && (
                              <span style={{
                                padding: "0.2rem 0.5rem",
                                borderRadius: "0.25rem",
                                fontSize: "0.75rem",
                                background: "rgba(139, 92, 246, 0.2)",
                                color: "#c4b5fd",
                              }}>
                                Released
                              </span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: "0.4rem 0.6rem" }}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedImportJobId(item.import_job_id);
                              if (!item.finance_batch_id) {
                                void openFinanceBatch(item.import_job_id);
                              } else {
                                void loadBatchItems(item.import_job_id);
                              }
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
          ) : (
            <div>
              <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem", alignItems: "center" }}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedImportJobId(null);
                    setBatchItems([]);
                  }}
                  style={{ paddingInline: "0.8rem" }}
                >
                  ← Back to Inbox
                </button>
                {financeInbox.find(item => item.import_job_id === selectedImportJobId)?.finance_batch_id && (
                  <>
                    {financeInbox.find(item => item.import_job_id === selectedImportJobId)?.status === "open" && (
                      <button
                        type="button"
                        onClick={() => {
                          const item = financeInbox.find(item => item.import_job_id === selectedImportJobId);
                          if (item?.finance_batch_id) {
                            void completeFinanceBatch(item.finance_batch_id);
                          }
                        }}
                        style={{ paddingInline: "0.8rem", background: "#10b981", color: "#fff" }}
                      >
                        Mark as Complete
                      </button>
                    )}
                    {financeInbox.find(item => item.import_job_id === selectedImportJobId)?.status === "completed" && (
                      <button
                        type="button"
                        onClick={async () => {
                          const item = financeInbox.find(item => item.import_job_id === selectedImportJobId);
                          if (item?.finance_batch_id) {
                            setReleasingBatchId(item.finance_batch_id);
                            setShowReleaseDialog(true);
                            // Load cardholders if not already loaded
                            if (cardholders.length === 0) {
                              await loadCardholders();
                            }
                            // Load cardholders with transactions for this batch
                            await loadCardholdersWithTransactions(item.finance_batch_id);
                          }
                        }}
                        style={{ paddingInline: "0.8rem", background: "#6366f1", color: "#fff" }}
                      >
                        Release to Cardholders
                      </button>
                    )}
                  </>
                )}
              </div>

              <h3 style={{ fontSize: "1rem", marginTop: 0 }}>
                Batch Review - Import Job {selectedImportJobId}
              </h3>

              {isLoadingBatchItems ? (
                <p>Loading batch items...</p>
              ) : (
                <div style={{ maxHeight: "400px", overflow: "auto", borderRadius: "0.75rem", border: "1px solid rgba(148,163,184,0.35)" }}>
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
                      </tr>
                    </thead>
                    <tbody>
                      {batchItems.length === 0 ? (
                        <tr>
                          <td colSpan={9} style={{ padding: "0.6rem", textAlign: "center", opacity: 0.7 }}>
                            No transactions in this batch.
                          </td>
                        </tr>
                      ) : (
                        batchItems.map((item) => (
                          <tr key={item.transaction_id}>
                            <td style={{ padding: "0.4rem 0.6rem", whiteSpace: "nowrap" }}>{item.date}</td>
                            <td style={{ padding: "0.4rem 0.6rem", whiteSpace: "nowrap" }}>{item.bank_account}</td>
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
                                background: item.status === "unclassified" ? "rgba(148, 163, 184, 0.2)" : "rgba(16, 185, 129, 0.2)",
                                color: item.status === "unclassified" ? "#cbd5e1" : "#86efac",
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

      {/* Release to Cardholders Dialog */}
      {showReleaseDialog && releasingBatchId && (
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
              setShowReleaseDialog(false);
              setSelectedCardholdersForRelease(new Set());
              setReleasingBatchId(null);
            }
          }}
        >
          <div
            style={{
              background: "#1e293b",
              padding: "1.5rem",
              borderRadius: "0.75rem",
              minWidth: "500px",
              maxWidth: "90vw",
              maxHeight: "80vh",
              overflow: "auto",
              border: "1px solid rgba(148,163,184,0.3)",
            }}
            onClick={(e) => {
              e.stopPropagation();
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setShowReleaseDialog(false);
                  setSelectedCardholdersForRelease(new Set());
                  setReleasingBatchId(null);
                  setCardholdersWithTransactions(new Set());
                  setAlreadyReleasedCardholders(new Set());
                }
              }}
          >
            <h2 style={{ marginTop: 0, marginBottom: "1rem" }}>
              Release Batch to Cardholders
            </h2>
            <p style={{ fontSize: "0.85rem", opacity: 0.8, marginBottom: "1rem" }}>
              Select cardholders to create batches for. Only cardholders with transactions in this batch are shown.
            </p>
            
            {isLoadingCardholdersWithTransactions ? (
              <p style={{ opacity: 0.7, textAlign: "center", marginBottom: "1rem" }}>Loading cardholders with transactions...</p>
            ) : (
              <>
                <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
                  <button
                    type="button"
                    onClick={() => {
                      const eligibleIds = cardholders
                        .filter(ch => cardholdersWithTransactions.has(ch.id))
                        .map(ch => ch.id);
                      setSelectedCardholdersForRelease(new Set(eligibleIds));
                    }}
                    style={{ padding: "0.4rem 0.8rem", fontSize: "0.85rem", background: "#6366f1", color: "#fff", border: "none", borderRadius: "0.25rem", cursor: "pointer" }}
                  >
                    Select All ({cardholdersWithTransactions.size - alreadyReleasedCardholders.size})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCardholdersForRelease(new Set());
                    }}
                    style={{ padding: "0.4rem 0.8rem", fontSize: "0.85rem", background: "transparent", border: "1px solid rgba(148,163,184,0.5)", borderRadius: "0.25rem", color: "#e5e7eb", cursor: "pointer" }}
                  >
                    Clear All
                  </button>
                </div>
                {cardholdersWithTransactions.size === 0 && (
                  <p style={{ color: "#fecaca", marginBottom: "1rem", fontSize: "0.85rem" }}>
                    No cardholders have transactions in this batch. All cardholders need assigned accounts that match transactions in the import.
                  </p>
                )}
              </>
            )}
            
            {error && (
              <p style={{ color: "#fecaca", marginBottom: "1rem", fontSize: "0.9rem", whiteSpace: "pre-wrap" }}>
                {error}
              </p>
            )}

            <div style={{ marginBottom: "1rem", maxHeight: "300px", overflow: "auto", border: "1px solid rgba(148,163,184,0.3)", borderRadius: "0.5rem", padding: "0.5rem" }}>
              {cardholders.length === 0 ? (
                <p style={{ opacity: 0.7, textAlign: "center" }}>Loading cardholders...</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {cardholders
                    .filter(ch => cardholdersWithTransactions.has(ch.id))
                    .map((ch) => {
                      const alreadyReleased = alreadyReleasedCardholders.has(ch.id);
                      return (
                    <label
                      key={ch.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        padding: "0.5rem",
                        cursor: alreadyReleased ? "default" : "pointer",
                        borderRadius: "0.25rem",
                        background: selectedCardholdersForRelease.has(ch.id) ? "rgba(99, 102, 241, 0.2)" : alreadyReleased ? "rgba(139, 92, 246, 0.1)" : "transparent",
                        opacity: alreadyReleased ? 0.7 : 1,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={selectedCardholdersForRelease.has(ch.id)}
                        disabled={alreadyReleased}
                        onChange={(e) => {
                          if (alreadyReleased) return;
                          const newSet = new Set(selectedCardholdersForRelease);
                          if (e.target.checked) {
                            newSet.add(ch.id);
                          } else {
                            newSet.delete(ch.id);
                          }
                          setSelectedCardholdersForRelease(newSet);
                        }}
                      />
                      <span>
                        {ch.display_name} (ID: {ch.id})
                        {alreadyReleased && (
                          <span style={{ fontSize: "0.75rem", color: "#c4b5fd", marginLeft: "0.5rem", fontStyle: "italic" }}>
                            (Already released)
                          </span>
                        )}
                        {ch.manager && !alreadyReleased && (
                          <span style={{ fontSize: "0.75rem", opacity: 0.7, marginLeft: "0.5rem" }}>
                            - Manager: {ch.manager.email || `ID ${ch.manager.id}`}
                          </span>
                        )}
                      </span>
                    </label>
                  );
                    })}
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => {
                  setShowReleaseDialog(false);
                  setSelectedCardholdersForRelease(new Set());
                  setReleasingBatchId(null);
                  setCardholdersWithTransactions(new Set());
                  setAlreadyReleasedCardholders(new Set());
                  setError(null);
                }}
                disabled={isReleasing}
                style={{ padding: "0.5rem 1rem", background: "transparent", border: "1px solid rgba(148,163,184,0.5)", borderRadius: "0.25rem", color: "#e5e7eb", cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (selectedCardholdersForRelease.size === 0) {
                    setError("Please select at least one cardholder.");
                    return;
                  }
                  if (releasingBatchId) {
                    void releaseBatchToCardholders(releasingBatchId, Array.from(selectedCardholdersForRelease));
                  }
                }}
                disabled={isReleasing || selectedCardholdersForRelease.size === 0}
                style={{
                  padding: "0.5rem 1rem",
                  background: isReleasing || selectedCardholdersForRelease.size === 0 ? "rgba(99, 102, 241, 0.5)" : "#6366f1",
                  border: "none",
                  borderRadius: "0.25rem",
                  color: "#fff",
                  cursor: isReleasing || selectedCardholdersForRelease.size === 0 ? "not-allowed" : "pointer",
                }}
              >
                {isReleasing ? "Releasing..." : `Release to ${selectedCardholdersForRelease.size} Cardholder(s)`}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
    </>
  );
}



