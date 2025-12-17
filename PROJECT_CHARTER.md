## Gekko Tracks – Project Charter

### 1. Background & Context

Gekko Tracks is the next-generation implementation of the Credit Card Coding (CCC) domain for Gekko Systems. It extends and formalises the existing solution currently live as `D-2510-004-credit-card-coding`, but is managed and evolved under the `Gekko-Tracks` project and CCC domain database.

This iteration focuses on credit card transaction classification and finance export workflows. Receipts management is explicitly out of scope for this iteration and will be handled in a future phase.

### 2. Goals & Outcomes

- Deliver a clean, modern web application for CCC, integrated into the wider Gekko ecosystem.
- Provide a full transaction ledger from bank CSV exports with rich filtering and role-based views.
- Enable cardholders to classify transactions and managers to review/approve them.
- Provide a finance-only view suitable for Pronto uploads.
- Integrate an ML-based classification engine that predicts transaction categories from day one and improves over time.
- Expose health and usage APIs so the existing Admin Center can consume CCC status and metrics.

### 3. Scope (This Iteration)

In scope:

- **Domain**: Credit Card Coding (CCC) as its own per-domain database/schema.
- **Data formats**:
  - **Format 1 – Raw Bank CSV**
    - Columns: `Bank Account, Date, Narrative, Debit Amount, Credit Amount, Balance, Categories, Serial`.
    - Used for imports and as the base ledger.
  - **Format 2 – Classified Business View**
    - Columns: `Date, Narrative, Debit Amount, Credit Amount, Description, Project, Cost Category, GL Account`.
    - Represents classified transactions; ML and users populate the extra fields.
  - **Format 3 – Finance / Pronto View**
    - Columns: all of Format 2 plus `Account, Reference, Tax, Amount, Tax Code, CBS (optional)`.
    - Used by finance and admin for Pronto uploads and downstream finance processes.
- **Roles & views**:
  - Admin & Finance:
    - Full access to all formats (1/2/3).
    - Manage users, cardholders, managers, configuration, and exports.
  - Cardholder:
    - View and classify their own transactions (primarily Format 2).
  - Manager:
    - View and approve classifications for their cardholders (Format 2) and see reports.
  - Overlaps supported: Admin+Cardholder, Manager+Cardholder, Manager+Finance, Finance+Cardholder.
- **Historic data**:
  - Historic CCC data resides in the `Historic Credit Card Employees Upload files/` directory under `Gekko-Tracks` as Excel workbooks:
    - Credit Card Employees Upload – August 2025 – Pronto.xlsx
    - Credit Card Employees Upload – September 2025 – Pronto.xlsx
    - Credit Card Employees Upload – Oct 2025 – Pronto.xlsx
    - Credit Card Employees Upload – Nov 2025 – Pronto.xlsx
  - Each workbook contains multiple tabs, one per cardholder, with headers matching Format 3.
- **APIs & integration**:
  - REST API for imports, ledger, classifications, finance view, and usage/health.
  - Admin Center will consume CCC health and usage via backend APIs (no new Admin Center frontend screens).

Out of scope for this iteration:

- Receipts management (uploading, storage, matching).
- Complex external integrations beyond:
  - Azure AD SSO (final milestone).
  - Bank CSV/Excel inputs in the specified formats.
- Multi-tenant architecture (assume single organization: Gekko Systems).

### 4. Users, Roles, and Permissions

- **Admin**
  - Manage: users, roles, cardholders, manager assignments, configuration (categories, rules).
  - See: all transactions and all formats (1/2/3) and all dashboards.
- **Finance**
  - Functionally identical to Admin in terms of capabilities.
  - Primary focus on Format 3 (Pronto view) and financial exports.
- **Cardholder**
  - View: own transactions across relevant formats.
  - Act: classify transactions (Format 2 fields).
- **Manager**
  - View: transactions for their assigned cardholders (primarily Format 2).
  - Act: review and approve classifications; see monthly reports.
- **Multi-role support**
  - Users may have multiple roles (e.g. Admin+Cardholder, Manager+Finance, etc.). Permissions are the union of roles.

### 5. Milestones & Timeline (High Level)

- **M1 – Foundations & Data Understanding**
  - Understand historic data and mapping from Format 3 Excel files into the CCC domain model.
  - Define the core entities and relationships for the CCC ERD.
- **M2 – CSV Import & Ledger (Format 1)**
  - Implement import pipeline for Format 1 CSVs with validation and error reporting.
  - Persist a transaction ledger with role-aware access to raw data.
- **M3 – Classification Workflows (Format 2)**
  - Implement Format 1 → Format 2 transformation and status model.
  - Build cardholder and manager flows around classification and approval.
  - Integrate ML predictions for Format 2 fields (Description, Project, Cost Category, GL Account).
- **M4 – Finance / Pronto View (Format 3)**
  - Implement finance-only Format 3 view and export workflows for Pronto.
  - Optionally extend ML predictions to Format 3 fields where appropriate.
- **M5 – Admin Center (Usage & Dependencies)**
  - Provide usage and health metrics for CCC via dedicated backend APIs.
  - Allow existing Admin Center frontend to display CCC status and metrics.
- **M6 – Azure AD SSO Integration (End of Iteration)**
  - Integrate Azure AD SSO as the final milestone of this iteration.
  - Replace any temporary auth mechanism with SSO, supporting multi-role users.

### 6. Success Metrics

- Clean, robust import of Format 1 CSV files with clear error handling.
- Practical, role-appropriate interfaces for Admin/Finance, Cardholders, and Managers.
- ML classification accuracy:
  - ~50% correct predictions around the first usable release milestone.
  - Target ≥80% correct predictions as data volume and training improve.
- Finance users can generate Format 3 exports suitable for Pronto without manual rework.
- Admin Center can consume clear health and usage metrics for CCC without tight coupling to CCC internals.

### 7. Risks & Assumptions

- **Assumptions**
  - Azure AD and on-prem infrastructure are available and managed by Gekko Systems.
  - Bank CSV and Excel formats remain stable for the duration of this iteration.
  - Historic data in the Excel workbooks is sufficiently consistent to train useful ML models.
- **Risks**
  - Inconsistent historic labels or tax fields could limit ML accuracy and require more normalization.
  - On-prem constraints (compute, network, storage) may affect deployment and scaling choices.
  - Tight timelines around milestones could push non-functional improvements (logging, observability) later if not actively managed.

### 8. Orchestrator Lifecycle Position

From the perspective of the project orchestrator:

- Research: **completed**
- Planning (charter & scope): **completed** (this document)
- Project Management (detailed milestones/tasks): **tracked in `Project_management_plan.md`**
- Architecture: in progress
- Implementation: not yet started


