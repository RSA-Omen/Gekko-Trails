## Gekko Tracks – Project Management Plan

### 1. Context

This document tracks the project management structure for the Gekko Tracks reboot.

- **Project**: Gekko Tracks
- **Purpose**: Successor/extension of `D-2510-004-credit-card-coding`, hosted and managed under `@Gekko-Tracks`.
- **Related artifacts**:
  - Research outline (roles, CSV formats, ML targets, success metrics).
  - Project charter (scope, milestones, non-goals, risks).

Lifecycle status (orchestrator view):

- [x] Research  
- [x] Planning  
- [x] Project Management  
- [x] Architecture  
- [ ] Implementation  

---

### 2. High-level milestones

- **M1 – Foundations & Data Understanding**
- **M2 – CSV Import & Ledger (Format 1)**
- **M3 – Classification Workflows (Format 2)**
- **M4 – Finance / Pronto View (Format 3)**
- **M5 – Admin Center (Usage & Dependencies)**
- **M6 – Azure AD SSO Integration (End of iteration)**

---

### 3. M1 – Foundations & Data Understanding

#### Epic 1.1 – Historic data analysis & mapping

**Task 1.1.1 – Inventory historic files**

- Subtasks:
  - List all workbooks in `Historic Credit Card Employees Upload files/`.
  - Confirm months, naming, and cardholders per workbook.
  - Verify all tabs match **Format 3** headers.

**Task 1.1.2 – Document data dictionary**

- Subtasks:
  - For Format 1: define semantics for each column (source, meaning, constraints).
  - For Format 2: define `Description`, `Project`, `Cost Category`, `GL Account`.
  - For Format 3: define `Account`, `Reference`, `Tax`, `Amount`, `Tax Code`, `CBS`.
  - Record how each **Format 3** field maps (or not) to Pronto fields.

**Task 1.1.3 – Label quality assessment for ML**

- Subtasks:
  - Sample multiple cardholders and months.
  - Check consistency of categories / GL accounts / tax fields.
  - Document quality issues and normalization rules needed.

#### Epic 1.2 – Target domain model (PM-level)

**Task 1.2.1 – Define core entities**

- Subtasks:
  - List entities: `User`, `Role`, `Cardholder`, `Manager`, `Account`, `Transaction`, `Classification`, `ImportJob`, `MLPrediction`.
  - Clarify one-to-one and one-to-many relationships.
  - Define how **Format 1 / 2 / 3** map onto `Transaction` + related entities.

**Task 1.2.2 – Role & overlap matrix**

- Subtasks:
  - Create a matrix of roles vs capabilities:
    - Admin, Finance, Cardholder, Manager, and overlaps (Admin+Cardholder, Manager+Cardholder, Manager+Finance, Finance+Cardholder).
  - Mark which formats each role can see (1 / 2 / 3).
  - Capture access rules (e.g., Format 3 is Admin/Finance only).

#### Epic 1.3 – Technical scaffolding plan (pre-implementation)

**Task 1.3.1 – Decide repo structure for `@Gekko-Tracks`**

- Subtasks:
  - Decide on top-level layout (e.g., `backend/`, `frontend/`, `ml/`, `docs/`).
  - Decide where to store the charter and docs (e.g., `docs/PROJECT_CHARTER.md`).
  - Plan folder for data exploration scripts (e.g., `data_exploration/`).

**Task 1.3.2 – Environment & deployment targets (on-prem)**

- Subtasks:
  - Choose base runtimes (Python version, Node version).
  - Define deployment method (systemd, Docker, etc.), reusing lessons from `D-2510-004-credit-card-coding`.
  - Document non-functional baseline (logging, backups, monitoring).

---

### 4. M2 – CSV Import & Ledger (Format 1)

**Current status:**  
- Initial CSV import pipeline for Format 1 is implemented (manual upload via Admin/Finance UI, backend `/api/imports/format1` with composite-key dedup, `ImportJob` tracking, and storage in the `transactions` table).  
- Basic ledger view (Format 1) is implemented for Admin/Finance via `/api/transactions` and the Admin/Finance dashboard table.

#### Epic 2.1 – CSV import pipeline (Format 1)

**Task 2.1.1 – Specify import configuration**

- Subtasks:
  - Define how imports are initiated (manual upload UI vs CLI vs scheduled).
  - Define file naming conventions and cardholder mapping rules.
  - Define behavior for duplicate imports and idempotency.

**Task 2.1.2 – Validation & error handling design**

- Subtasks:
  - Enumerate validation rules (date parsing, numeric fields, missing columns, etc.).
  - Define error levels (fatal vs recoverable vs warnings).
  - Define error reporting approach (per-row log vs summary, UI feedback).

**Task 2.1.3 – Import job lifecycle**

- Subtasks:
  - Define `ImportJob` states (pending, running, completed, failed).
  - Specify audit fields (who imported, when, which file).
  - Define retention and cleanup strategy for raw uploads/logs.

#### Epic 2.2 – Ledger model & basic views

**Task 2.2.1 – Ledger schema design (planning depth)**

- Subtasks:
  - Outline fields needed from Format 1 for `Transaction`.
  - Decide how to store raw vs normalized values.
  - Plan indices/keys for typical queries (per cardholder, date range, etc.).

**Task 2.2.2 – Role-specific ledger access rules**

- Subtasks:
  - Define exactly what Admin/Finance can see.
  - Define restrictions for Cardholders (own transactions only).
  - Define restrictions for Managers (transactions for assigned cardholders only).

**Task 2.2.3 – Initial UI requirements for ledger**

- Subtasks:
  - Define essential columns and filters for Admin/Finance ledger view.
  - Define minimal ledger view for Cardholders (read-only at this stage).
  - Define how import status is surfaced in the UI.

---

### 5. M3 – Classification Workflows (Format 2)

#### Epic 3.1 – Format 1 → Format 2 transformation

**Task 3.1.1 – Mapping rules definition**

- Subtasks:
  - Define how Format 1 rows become Format 2 rows (mapping + enrichment).
  - Define default values when predictions or manual classifications are missing.
  - Decide how corrections are stored (separate `Classification` entity vs updating transaction fields).

**Task 3.1.2 – Status model**

- Subtasks:
  - Define classification statuses: unclassified, predicted, user-confirmed, manager-approved.
  - Define transitions and who can perform each transition.
  - Define what “ready for Pronto” means in terms of status.

#### Epic 3.2 – ML model integration plan

**Task 3.2.1 – Feature definition & label targets**

- Subtasks:
  - Decide which fields are predicted in Format 2 (Description, Project, Cost Category, GL Account).
  - Define feature set (Narrative text, merchant, amounts, cardholder, historical behavior, etc.).
  - Decide per-field model vs multi-output model.

**Task 3.2.2 – Training data preparation process**

- Subtasks:
  - Define process to extract labeled data from historic **Format 3** Excel into a training set.
  - Specify cleaning/normalization steps (e.g., category normalization).
  - Decide how often retraining happens (manual vs scheduled).

**Task 3.2.3 – Prediction flow**

- Subtasks:
  - Decide when predictions are generated (on import vs on demand).
  - Define API or function boundaries between app and ML module.
  - Define confidence thresholds and UI behavior (e.g., highlight low-confidence predictions).

#### Epic 3.3 – Cardholder and Manager UX (Format 2)

**Task 3.3.1 – Cardholder journey definition**

- Subtasks:
  - Describe step-by-step flow:
    - Login → unclassified inbox → review predictions → adjust → submit.
  - Define filters/search (date range, status).
  - Decide interactions for multi-role users (e.g., Admin+Cardholder).

**Task 3.3.2 – Manager approval journey**

- Subtasks:
  - Describe how managers see pending approvals.
  - Define approval actions (approve, request change, override).
  - Define notification strategy (email, in-app, reports).

**Task 3.3.3 – UX acceptance criteria**

- Subtasks:
  - Define “clean and beautiful” standards (layout, performance).
  - List critical UX acceptance tests (click counts, clarity of states).

---

### 6. M4 – Finance / Pronto View (Format 3)

#### Epic 4.1 – Format 3 definition & access

**Task 4.1.1 – Finance-only view design**

- Subtasks:
  - Describe the Format 3 screen (columns, filters, totals).
  - Specify export format(s) for Pronto (CSV/Excel, layout).
  - Define how to mark batches as exported or reconciled.

**Task 4.1.2 – Extended prediction fields**

- Subtasks:
  - Identify which extra fields in Format 3 should be ML-predicted (Tax, Tax Code, maybe Account).
  - Define rules where ML is not trusted (e.g., always manual for tax).
  - Decide whether predictions for Format 3 fields happen with Format 2.

#### Epic 4.2 – Pronto integration workflow (process-level)

**Task 4.2.1 – Upload workflow spec**

- Subtasks:
  - Document manual finance process for using Format 3 exports in Pronto.
  - Specify validations needed to match Pronto constraints.
  - Define error-handling if Pronto rejects records.

**Task 4.2.2 – Audit & traceability**

- Subtasks:
  - Define what needs to be logged for every uploaded batch (who, when, which records).
  - Decide retention for audit logs.

---

### 7. M5 – Admin Center (Usage & Dependencies)

#### Epic 5.1 – Usage metrics

**Task 5.1.1 – Metrics definition**

- Subtasks:
  - Decide core usage KPIs:
    - Number of imports, number of transactions per status, ML coverage, approval latency, etc.
  - Map which metrics must be exposed via **usage API**.

**Task 5.1.2 – Metrics collection plan**

- Subtasks:
  - Decide where metrics are stored (DB vs time-series).
  - Define aggregation cadence (daily/weekly).

#### Epic 5.2 – Dependencies & health

**Task 5.2.1 – Health model**

- Subtasks:
  - Define what `/health` reports (DB connectivity, ML service status, etc.).
  - Decide on health levels (ok / degraded / failing).

**Task 5.2.2 – Admin center UI design**

- Subtasks:
  - List widgets/cards for usage and health (import success, ML accuracy, last training, etc.).
  - Confirm access (Admin/Finance only).

---

### 8. M6 – Azure AD SSO Integration (End of iteration)

#### Epic 6.1 – Identity integration

**Task 6.1.1 – Auth strategy**

- Subtasks:
  - Define migration from temporary auth to Azure AD SSO.
  - Define mappings from Azure AD groups/claims to internal roles.

**Task 6.1.2 – Login & session flow**

- Subtasks:
  - Specify login/logout UX.
  - Define how multi-role users are handled at login (role selection vs unified view).

#### Epic 6.2 – Security & go-live checks

**Task 6.2.1 – Security review**

- Subtasks:
  - Define minimum security checks (HTTPS, cookie policies, basic hardening).
  - Define access review to ensure Format 3 is Finance/Admin-only.

**Task 6.2.2 – Final sign-off readiness**

- Subtasks:
  - Draft a UAT checklist (inspired by `D-2510-004-credit-card-coding` UAT docs).
  - Define who signs off (Barry, Finance lead, etc.).

---