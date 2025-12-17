# Milestone 3 – Test Guide (Classification Workflows, Format 2)

This guide provides comprehensive end-to-end testing instructions for all Milestone 3 features: classification batches, inbox/task workflows, ML prediction integration, and approval/rejection flows.

---

## 1. Prerequisites & Environment Setup

### 1.1 Backend Setup

```bash
cd /home/lauchlandupreez/Operations/Gekko-Tracks/backend
source .venv/bin/activate
export CCC_DB_URL='sqlite:///./ccc.db'
uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
```

**Verify:** Open `http://localhost:8001/docs` - OpenAPI docs should load without errors.

### 1.2 Frontend Setup

```bash
cd /home/lauchlandupreez/Operations/Gekko-Tracks/frontend
npm install        # if not already done
npm run dev        # Vite on 5173
```

**Verify:** Open `http://localhost:5173` - Login page should appear.

### 1.3 Database Migration

Ensure M3 schema migration has been run:

```bash
cd /home/lauchlandupreez/Operations/Gekko-Tracks/backend
source .venv/bin/activate
python3 migrate_m3_schema.py
```

**Expected output:**
```
Starting M3 schema migration...
  Creating classification_batches table...
  Adding batch_id column to classifications...
  Adding rejection_reason column to classifications...
Migration complete!
```

---

## 2. Sanity Check: Existing M2 Functionality Still Works

Before testing M3, verify that existing M2 features still function correctly.

### 2.1 Admin/Finance – Ledger View

**Steps:**
1. In role selector: Set **role = finance** (or admin), **ID = any**.
2. Navigate to **Admin / Finance**.
3. Click **Imports & Ledger** tab.
4. Verify:
   - CSV upload still works.
   - Ledger table populates with transactions.
   - Bank account filter still functions.

**Expected:** No errors, ledger displays transactions as before.

### 2.2 Cardholder – Inbox View (M3)

**Note:** In M3, the Cardholder view is **batch-based** (not a direct transaction list). Cardholders see an inbox of batches that Finance has created for them to classify. If the inbox appears empty, it means no batches have been created yet for this cardholder.

**Steps:**
1. In role selector: Set **role = cardholder**, **ID = 5** (Brown, card 7173).
2. Navigate to **Cardholder** page.
3. Verify:
   - Page loads without errors.
   - Shows an **Inbox** view with KPIs (Tasks, In Review, Completed).
   - Inbox table displays batches (or shows "No batches found" if none exist yet).
   - **Expected:** If no batches exist, you'll see "No batches found. Finance will create batches for you to classify."
   - To see transactions, Finance must first create a cardholder batch (see section 5.2).

**Expected:** No 500 errors or import failures.

### 2.3 Manager – Transaction View

**Steps:**
1. In role selector: Set **role = manager**, **ID = 4**.
2. Navigate to **Manager** page.
3. Click **Transactions** tab.
4. Verify:
   - Transactions load for manager's cardholders.
   - Card filter dropdown works (shows cardholder surnames + last 4 digits).

**Expected:** Transactions display correctly, card filter functional.

---

## 3. Database Verification (Optional but Helpful)

Verify that database tables exist and have data:

```bash
cd /home/lauchlandupreez/Operations/Gekko-Tracks/backend
source .venv/bin/activate
python3 - << 'PY'
import os, sqlite3
DB_PATH = os.path.abspath('ccc.db')
conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

print("Sample batches:")
for row in cur.execute("SELECT id, owner_type, owner_id, status, import_job_id FROM classification_batches LIMIT 10"):
    print(row)

print("\nSample classifications:")
for row in cur.execute("SELECT transaction_id, status, batch_id FROM classifications LIMIT 10"):
    print(row)

print("\nTransactions count:")
for row in cur.execute("SELECT COUNT(*) FROM transactions"):
    print(f"Total transactions: {row[0]}")

conn.close()
PY
```

**Expected:** Tables exist, some data present (may be empty initially - that's fine).

---

## 4. Finance Inbox – Import Review & Batch Creation

### 4.1 Finance Inbox List

**Steps:**
1. In role selector: Set **role = finance**, **ID = any**.
2. Navigate to **Admin / Finance**.
3. Click **Finance Inbox** tab.
4. Verify table displays:
   - **Import Job ID** (numeric)
   - **File Name** (string)
   - **Created** (date)
   - **Transactions** (count)
   - **Status** (pending/open/completed)
   - **Actions** (Review button)

5. Click **Refresh** button.
6. Verify list reloads without errors.

**Expected:** Table shows import jobs with transaction counts. Status may be `pending` initially.

### 4.2 Open a Finance Batch

**Steps:**
1. In Finance Inbox table, click **Review** on any import row.
2. Verify:
   - UI transitions to **Batch Review – Import Job {id}** view.
   - If no Finance batch existed, backend creates one automatically (check by refreshing inbox - status should become `open`).

3. Verify batch contents table shows:
   - Columns: `Date`, `Bank Account`, `Narrative`, `Amount`, `Description`, `Project`, `Cost Category`, `GL Account`, `Status`.
   - Rows match transaction count from inbox.
   - Initially, most Format 2 fields (`Description`, `Project`, etc.) are empty.
   - `Status` column shows `unclassified` for most rows.

4. Click **← Back to Inbox**.
5. Verify you return to inbox list.

**Expected:** Batch review screen displays Format 2 items. Back navigation works.

### 4.3 Complete Finance Batch

**Steps:**
1. In Finance Inbox, click **Review** on an import that has a Finance batch (status = `open`).
2. Verify **Mark as Complete** button is visible.
3. Click **Mark as Complete**.
4. Return to Finance Inbox (refresh if needed).
5. Verify:
   - Status for that Import Job ID is now **`completed`**.

**Status Guard Test:**
6. In Swagger (`http://localhost:8001/docs`), call:
   - `POST /api/finance/batches/{batch_id}/complete` again (same batch_id).
7. Verify:
   - Returns **400 Bad Request**.
   - Error message: "Batch must be in 'open' status to complete. Current status: completed".

**Expected:** Batch completes successfully. Status guard prevents duplicate completion.

---

## 5. Cardholder Inbox – Batch Creation & Classification

**Test Data Note:** Use a cardholder that has transactions in a completed Finance batch. From earlier database inspection, good candidates:
- **Cardholder ID = 5** (Brown, card 7173) - has 26 transactions
- **Cardholder ID = 4** (Bell, card 4137) - has 54 transactions
- **Cardholder ID = 21** (Rouhan, card 6087) - has 30 transactions

Use **Cardholder ID = 5** for these tests.

### 5.1 Cardholder Inbox Basics

**Steps:**
1. In role selector: Set **role = cardholder**, **ID = 5**.
2. Navigate to **Cardholder** page.
3. Verify inbox view displays:
   - **KPIs at top:**
     - **Tasks** (count of unclassified transactions)
     - **In Review** (count of batches in review)
     - **Completed** (count of submitted batches)
   - **Inbox table:**
     - Columns: `Batch`, `Transactions`, `Status`, `Created`, `Actions`.
   - Initially may show "No batches found" - that's expected until Finance creates batches.

4. Click **Refresh Inbox**.
5. Verify list reloads without errors.

**Expected:** Inbox UI loads, shows KPIs and table structure.

### 5.2 Create Cardholder Batch from Finance Batch (via API)

**Note:** Currently, cardholder batches are created via backend API. Finance UI for "fanning out" batches to cardholders will be added later. For now, test via Swagger.

**Steps:**
1. Open Swagger: `http://localhost:8001/docs`.
2. Find endpoint: `POST /api/cardholders/{cardholder_id}/batches/from-finance`.
3. Get a Finance batch ID:
   - Call `GET /api/finance/inbox`.
   - Note the `finance_batch_id` for a completed Finance batch (or use the batch ID from the `classification_batches` table if you know it).

4. Call `POST /api/cardholders/5/batches/from-finance` with body:
   ```json
   {
     "parent_batch_id": <finance_batch_id>,
     "title": "Brown – Nov 2025",
     "label": "Nov 2025 Visa"
   }
   ```

5. Verify response:
   - Returns `ClassificationBatchOut` with:
     - `owner_type = "cardholder"`
     - `owner_id = 5`
     - `status = "open"`
     - `transaction_count > 0`

6. Refresh Cardholder Inbox UI.
7. Verify:
   - New batch appears in inbox table.
   - `Status = open`.
   - `Transactions` count matches `transaction_count` from API response.

**Expected:** Cardholder batch created successfully, appears in inbox.

### 5.3 Cardholder Classification UI

**Steps:**
1. In Cardholder Inbox, find the batch with `Status = open`.
2. Click **Classify** button.
3. Verify **Classify Transactions** screen displays:
   - **KPIs:**
     - **Unclassified:** count
     - **Predicted:** count
     - **Confirmed:** count
   - **Action buttons:**
     - **← Back to Inbox**
     - **Auto-Predict All**
     - **Submit for Approval** (should be disabled if unclassified count > 0)
   - **Table with columns:**
     - `Date`, `Narrative`, `Amount`, `Description`, `Project`, `Cost Category`, `GL Account`, `Status`, `Actions`

**Expected:** Classification screen loads with all transactions from the batch.

### 5.4 Test Inline Editing

**Steps:**
1. In classification table, click on a cell in the **Description** column (for a row with `Status = unclassified`).
2. Verify:
   - Cell becomes an editable input field.
   - You can type text.
3. Type a description (e.g., "Office supplies purchase").
4. Press **Enter** or click outside the cell (blur event).
5. Verify:
   - Field saves the value.
   - `Status` column for that row changes to **`user_confirmed`**.
   - KPI **Confirmed** count increases.

6. Repeat for:
   - **Project** field (e.g., "PROJECT_A")
   - **Cost Category** field (e.g., "Office Supplies")
   - **GL Account** field (e.g., "6200")

7. Verify each edit:
   - Saves correctly.
   - Updates status to `user_confirmed`.

**Expected:** Inline editing works for all Format 2 fields. Status updates automatically.

### 5.5 Test Per-Transaction Prediction

**Steps:**
1. Find a row with `Status = unclassified`.
2. Click **Predict** button in the `Actions` column.
3. Verify:
   - Fields populate with ML stub predictions:
     - `Description` (from narrative)
     - `Project` (if extractable)
     - `Cost Category` (keyword-based, e.g., "Meals & Entertainment" for "coffee")
     - `GL Account` (e.g., "6000" for meals)
   - `Status` changes to **`predicted`**.
   - KPI **Predicted** count increases.

4. Click into one of the predicted fields and edit it.
5. Verify:
   - `Status` changes to **`user_confirmed`** after edit.

**Expected:** Per-transaction prediction works. User can accept or override predictions.

### 5.6 Test Auto-Predict All

**Steps:**
1. Ensure there are some rows with `Status = unclassified`.
2. Click **Auto-Predict All** button.
3. Verify:
   - All `unclassified` rows become `predicted`.
   - KPIs update:
     - **Unclassified** decreases to 0 (or near 0).
     - **Predicted** increases.
4. Verify predictions are reasonable:
   - Check a few rows - narratives with "coffee" should map to "Meals & Entertainment".
   - Narratives with "fuel" should map to "Travel & Fuel".

**Expected:** Batch prediction runs successfully. All unclassified items get predictions.

### 5.7 Guard: Cannot Submit with Unclassified Items

**Steps:**
1. Ensure at least one row has `Status = unclassified`.
2. Verify **Submit for Approval** button is **disabled**.
3. If button is enabled, click it anyway.
4. Verify:
   - Backend returns **400 Bad Request**.
   - Error message: "Cannot submit batch: no transactions have been classified (user_confirmed)."

**Expected:** Submit button disabled or returns error when unclassified items exist.

### 5.8 Submit Batch for Approval

**Steps:**
1. Ensure at least one row has `Status = user_confirmed` (edit at least one row manually).
2. Ensure no rows have `Status = unclassified` (use Auto-Predict All if needed, then confirm at least one).
3. Verify **Submit for Approval** button is **enabled**.
4. Click **Submit for Approval**.
5. Verify:
   - UI returns to Inbox view.
   - Batch `Status` in inbox is now **`completed`**.
   - `Submitted` date is populated.
   - Batch no longer shows "Classify" button (status is completed).

**Status Guard Test:**
6. Try to submit the same batch again via API:
   - `POST /api/cardholders/5/batches/{batch_id}/submit`
7. Verify:
   - Returns **400 Bad Request**.
   - Error: "Batch must be in 'open' status to submit. Current status: completed".

**Expected:** Batch submits successfully. Status guard prevents duplicate submission.

---

## 6. Manager Inbox – Approval & Rejection

**Test Data Note:** Use the Manager ID that manages the cardholder you used in section 5. Check Admin/Finance → Cardholders tab to find the manager for Cardholder ID 5.

For example, if **Manager ID = 4** manages Cardholder 5, use **Manager ID = 4**.

### 6.1 Manager Inbox Basics

**Steps:**
1. In role selector: Set **role = manager**, **ID = 4** (or the manager ID from your data).
2. Navigate to **Manager** page.
3. Click **Approval Inbox** tab (or view switcher).
4. Verify inbox displays:
   - **Table with columns:**
     - `Cardholder`, `Batch`, `Transactions`, `Submitted`, `Actions`
   - **Rows:**
     - Should show batches submitted by cardholders under this manager.
     - If none appear, ensure you've submitted a batch for a cardholder managed by this manager.

5. Click **Refresh Inbox**.
6. Verify list reloads without errors.

**Expected:** Inbox shows submitted batches from cardholders.

### 6.2 Review a Batch

**Steps:**
1. In Manager Inbox, click **Review** on a batch row.
2. Verify **Batch Review** screen displays:
   - **Action buttons:**
     - **← Back to Inbox**
     - **Approve Batch** (green button)
     - **Rejection reason** input field
     - **Reject** button (red button)
   - **Table with Format 2 items:**
     - Columns: `Date`, `Narrative`, `Amount`, `Description`, `Project`, `Cost Category`, `GL Account`, `Status`
     - Rows match the transactions the cardholder classified

3. Verify data matches cardholder's work:
   - Check a few rows - descriptions/projects should match what the cardholder entered.

**Expected:** Review screen shows all batch items with cardholder's classifications.

### 6.3 Approve Flow

**Steps:**
1. In Batch Review screen, verify **Approve Batch** button is visible.
2. Click **Approve Batch**.
3. Verify:
   - Backend returns success (200).
   - UI either:
     - Returns to Inbox automatically, OR
     - Shows success message
   - In Inbox:
     - That batch no longer appears in "awaiting approval" list (status is now `approved`).

**Database Verification (Optional):**
4. Check database:
   ```sql
   SELECT status FROM classifications WHERE batch_id = <batch_id>;
   ```
5. Verify:
   - All classifications have `status = 'manager_approved'`.

**Status Guard Test:**
6. Try to approve the same batch again via API:
   - `POST /api/managers/4/batches/{batch_id}/approve`
7. Verify:
   - Returns **400 Bad Request**.
   - Error: "Batch must be in 'completed' status to approve. Current status: approved".

**Expected:** Batch approves successfully. All classifications marked as `manager_approved`. Status guard prevents duplicate approval.

### 6.4 Rejection Flow (with Required Reason)

**Note:** You'll need another submitted batch for this test. Either:
- Create and submit another batch for a different cardholder, OR
- Re-test the approval flow on a different batch.

**Steps:**
1. In Manager Inbox, click **Review** on a submitted batch.
2. **Test rejection without reason:**
   - Leave **Rejection reason** field empty.
   - Click **Reject** button.
3. Verify:
   - **Reject** button is disabled (if reason is empty), OR
   - Backend returns **400 Bad Request** with: "Rejection reason is required."

4. **Test rejection with reason:**
   - Enter rejection reason: "GL account incorrect for several items. Please review and correct."
   - Click **Reject** button.
5. Verify:
   - Backend returns success (200).
   - Batch status becomes **`rejected`**.
   - In Inbox:
     - Batch no longer appears in "awaiting approval" list.

**Database Verification (Optional):**
6. Check database:
   ```sql
   SELECT rejection_reason FROM classification_batches WHERE id = <batch_id>;
   SELECT status, rejection_reason FROM classifications WHERE batch_id = <batch_id>;
   ```
7. Verify:
   - `classification_batches.rejection_reason` contains your note.
   - All `classifications.status = 'rejected'`.
   - All `classifications.rejection_reason` contains your note.

**Status Guard Test:**
8. Try to reject a batch that's not in `completed` status:
   - `POST /api/managers/4/batches/{batch_id}/reject` with `{ "reason": "test" }`
   - Use a batch that's already `approved` or `rejected`.
9. Verify:
   - Returns **400 Bad Request**.
   - Error: "Batch must be in 'completed' status to reject. Current status: {current_status}".

**Expected:** Rejection requires reason. Reason is stored in batch and all classifications. Status guard prevents invalid rejections.

---

## 7. Status Guard Regression Tests

Test that all status transition guards work correctly via API.

### 7.1 Finance Complete - Wrong Status

**Steps:**
1. In Swagger, find a Finance batch with `status = 'completed'`.
2. Call `POST /api/finance/batches/{batch_id}/complete`.
3. Verify:
   - Returns **400 Bad Request**.
   - Error message: "Batch must be in 'open' status to complete. Current status: completed".

**Expected:** Guard prevents completing an already-completed batch.

### 7.2 Cardholder Submit - Wrong Status

**Steps:**
1. In Swagger, find a cardholder batch with `status = 'completed'` (already submitted).
2. Call `POST /api/cardholders/{cardholder_id}/batches/{batch_id}/submit`.
3. Verify:
   - Returns **400 Bad Request**.
   - Error: "Batch must be in 'open' status to submit. Current status: completed".

**Alternative Test:**
4. Create a new cardholder batch (status = 'open').
5. Ensure all classifications are `unclassified` (no `user_confirmed`).
6. Call submit endpoint.
7. Verify:
   - Returns **400 Bad Request**.
   - Error: "Cannot submit batch: no transactions have been classified (user_confirmed)."

**Expected:** Guards prevent submitting batches in wrong status or with no confirmed classifications.

### 7.3 Manager Approve/Reject - Wrong Status

**Steps:**
1. In Swagger, find a cardholder batch with `status = 'open'` (not yet submitted).
2. Call `POST /api/managers/{manager_id}/batches/{batch_id}/approve`.
3. Verify:
   - Returns **400 Bad Request**.
   - Error: "Batch must be in 'completed' status to approve. Current status: open".

4. Call `POST /api/managers/{manager_id}/batches/{batch_id}/reject` with `{ "reason": "test" }`.
5. Verify:
   - Returns **400 Bad Request**.
   - Error: "Batch must be in 'completed' status to reject. Current status: open".

**Expected:** Guards prevent approving/rejecting batches that aren't submitted.

### 7.4 Reject Without Reason

**Steps:**
1. In Swagger, find a cardholder batch with `status = 'completed'`.
2. Call `POST /api/managers/{manager_id}/batches/{batch_id}/reject` with body:
   ```json
   { "reason": "" }
   ```
3. Verify:
   - Returns **400 Bad Request**.
   - Error: "Rejection reason is required."

**Expected:** Rejection requires a non-empty reason.

---

## 8. ML Stub Verification

### 8.1 Direct Prediction API

**Steps:**
1. In Swagger, find a transaction ID (from `GET /api/transactions`).
2. Call `POST /api/classifications/{transaction_id}/predict`.
3. Verify response includes:
   - `description`: Populated (usually from narrative).
   - `project`: May be null or extracted from narrative.
   - `cost_category`: Keyword-based (e.g., "Meals & Entertainment" for narratives containing "coffee", "cafe", "restaurant").
   - `gl_account`: Mapped from cost_category (e.g., "6000" for meals).
   - `status = "predicted"`.

**Expected:** ML stub returns reasonable predictions based on narrative keywords.

### 8.2 Batch Auto-Predict

**Steps:**
1. In Cardholder classification UI, ensure some rows are `unclassified`.
2. Click **Auto-Predict All**.
3. Verify:
   - All unclassified rows get predictions.
   - Predictions are consistent:
     - Narratives with "coffee" → "Meals & Entertainment" → GL "6000"
     - Narratives with "fuel" → "Travel & Fuel" → GL "6100"
     - Narratives with "office" → "Office Supplies" → GL "6200"

**Expected:** Batch prediction applies ML stub to all unclassified items.

### 8.3 Prediction Override

**Steps:**
1. Predict a transaction (via UI or API).
2. Verify it has `status = "predicted"`.
3. Edit one of the predicted fields (e.g., change `cost_category`).
4. Verify:
   - `status` changes to **`user_confirmed`**.
   - Your edit is saved.

**Expected:** Users can override predictions, which marks items as user_confirmed.

---

## 9. Regression: Existing APIs Still Work

Verify that M3 changes didn't break existing M2 functionality.

### 9.1 Transactions API

**Steps:**
1. Test `GET /api/transactions` with:
   - No filters (Admin/Finance view).
   - `cardholder_id=5` (Cardholder view).
   - `manager_id=4` (Manager view).
2. Verify:
   - All return transaction lists without errors.
   - Filtering still works correctly.

**Expected:** Transaction endpoints function as before.

### 9.2 Accounts API

**Steps:**
1. Test `GET /api/accounts`.
2. Test `POST /api/accounts/{id}/assign-cardholder` with a valid cardholder ID.
3. Verify:
   - Accounts list loads.
   - Assignment works.

**Expected:** Account management still functional.

### 9.3 Cardholders API

**Steps:**
1. Test `GET /api/cardholders`.
2. Test `GET /api/cardholders/5`.
3. Verify:
   - Lists load correctly.
   - Individual cardholder details include manager information.

**Expected:** Cardholder endpoints work as before.

### 9.4 Admin/Finance Dashboard Tabs

**Steps:**
1. As Finance role, navigate to Admin/Finance.
2. Test all tabs:
   - **Imports & Ledger**
   - **Cards & Accounts**
   - **Cardholders**
   - **Managers**
   - **Finance Inbox** (new)
3. Verify:
   - All tabs load without errors.
   - Existing functionality (CRUD, filters) still works.

**Expected:** All dashboard tabs functional, new Finance Inbox integrated.

---

## 10. End-to-End Workflow Test

Test the complete flow from Finance → Cardholder → Manager.

### 10.1 Finance Phase

**Steps:**
1. As Finance, go to **Finance Inbox**.
2. Find an import job (or upload a new CSV if needed).
3. Click **Review** to open/create Finance batch.
4. Review the batch items (read-only Format 2 view).
5. Click **Mark as Complete**.
6. Verify batch status is `completed`.

**Expected:** Finance can review and complete batches.

### 10.2 Cardholder Phase

**Steps:**
1. As Finance (or via API), create a cardholder batch from the completed Finance batch:
   - `POST /api/cardholders/5/batches/from-finance` with `parent_batch_id`.
2. As Cardholder (ID = 5), go to **Cardholder** page.
3. Verify batch appears in inbox with `Status = open`.
4. Click **Classify**.
5. Use **Auto-Predict All** to populate predictions.
6. Edit at least one row to confirm it (change a field, status becomes `user_confirmed`).
7. Click **Submit for Approval**.
8. Verify batch status becomes `completed` in inbox.

**Expected:** Cardholder can classify and submit batches.

### 10.3 Manager Phase

**Steps:**
1. As Manager (ID = 4, or the manager for Cardholder 5), go to **Manager** page.
2. Click **Approval Inbox** tab.
3. Verify submitted batch appears in inbox.
4. Click **Review**.
5. Review the classifications (read-only Format 2 view).
6. Click **Approve Batch**.
7. Verify:
   - Batch status becomes `approved`.
   - Batch no longer appears in "awaiting approval" inbox.

**Alternative: Rejection Flow:**
8. If you have another submitted batch, test rejection:
   - Enter rejection reason: "Please verify GL accounts for transactions 1-5."
   - Click **Reject**.
9. Verify:
   - Batch status becomes `rejected`.
   - Reason is stored.

**Expected:** Manager can approve or reject batches with required reasons.

---

## 11. Edge Cases & Error Handling

### 11.1 Empty Batches

**Steps:**
1. Create a Finance batch with no transactions linked.
2. Verify:
   - Batch review shows "No transactions in this batch."
   - UI handles empty state gracefully.

**Expected:** Empty batches don't cause errors.

### 11.2 Invalid Batch IDs

**Steps:**
1. In Swagger, call endpoints with non-existent batch IDs:
   - `GET /api/cardholders/5/batches/99999/items`
   - `POST /api/managers/4/batches/99999/approve`
2. Verify:
   - Returns **404 Not Found**.
   - Error: "Batch not found."

**Expected:** Invalid IDs return appropriate 404 errors.

### 11.3 Unauthorized Access

**Steps:**
1. As Cardholder ID = 5, try to access another cardholder's batch:
   - `GET /api/cardholders/6/batches/{batch_id}/items` (if batch_id belongs to cardholder 5).
2. Verify:
   - Returns **403 Forbidden**.
   - Error: "Batch does not belong to this cardholder."

**Expected:** Access control prevents unauthorized batch access.

### 11.4 Manager Access Control

**Steps:**
1. As Manager ID = 4, try to approve a batch from a cardholder NOT under this manager.
2. Verify:
   - Returns **403 Forbidden**.
   - Error: "Batch does not belong to a cardholder under this manager."

**Expected:** Managers can only approve batches from their cardholders.

---

## 12. Performance & UI Responsiveness

### 12.1 Large Batch Handling

**Steps:**
1. Create a batch with many transactions (50+).
2. Test:
   - Loading batch items (should complete within 2-3 seconds).
   - Auto-Predict All (should complete within 5-10 seconds).
   - Inline editing (should be responsive, no lag).

**Expected:** UI remains responsive with larger batches.

### 12.2 Concurrent Operations

**Steps:**
1. Open Cardholder classification UI.
2. Edit multiple fields in quick succession.
3. Verify:
   - All edits save correctly.
   - No race conditions or lost updates.

**Expected:** Concurrent edits handled gracefully.

---

## 13. Data Integrity Checks

### 13.1 Batch-Classification Linking

**Steps:**
1. After creating and submitting a cardholder batch, check database:
   ```sql
   SELECT COUNT(*) FROM classifications WHERE batch_id = <batch_id>;
   ```
2. Verify:
   - Count matches `transaction_count` from batch.
   - All classifications have correct `batch_id`.

**Expected:** All batch items properly linked via `batch_id`.

### 13.2 Status Consistency

**Steps:**
1. After manager approval, check database:
   ```sql
   SELECT status FROM classifications WHERE batch_id = <batch_id>;
   ```
2. Verify:
   - All classifications have `status = 'manager_approved'`.
   - No mixed statuses within the same batch.

**Expected:** Batch and classification statuses stay consistent.

---

## 14. Summary Checklist

Use this checklist to track your testing progress:

- [ ] **Prerequisites:** Backend and frontend running, migration executed
- [ ] **M2 Regression:** Ledger, Cardholder, Manager transaction views still work
- [ ] **Finance Inbox:** List loads, batch review works, complete batch succeeds
- [ ] **Cardholder Inbox:** Inbox displays, batch creation works (via API)
- [ ] **Cardholder Classification:** Inline editing, per-row prediction, auto-predict all work
- [ ] **Cardholder Submit:** Submit succeeds, guard prevents invalid submissions
- [ ] **Manager Inbox:** Inbox displays submitted batches
- [ ] **Manager Approval:** Approve flow works, status updates correctly
- [ ] **Manager Rejection:** Reject with reason works, reason stored, guard prevents empty reason
- [ ] **Status Guards:** All transition guards tested and working
- [ ] **ML Stub:** Predictions reasonable, batch prediction works
- [ ] **API Regression:** Existing endpoints still functional
- [ ] **End-to-End:** Complete Finance → Cardholder → Manager flow works
- [ ] **Error Handling:** 404s, 403s, 400s return appropriate messages
- [ ] **Data Integrity:** Batch-classification links correct, statuses consistent

---

## 15. Known Limitations & Future Work

### Current Limitations

1. **Finance → Cardholder Batch Creation:** Currently requires API call. UI for Finance to "fan out" batches to cardholders will be added in a future iteration.

2. **Rejected Batch Handling:** Rejected batches are marked as `rejected` but don't automatically create a new batch for cardholder to rework. This can be added later.

3. **ML Stub:** Current predictions are keyword-based. Real ML model training/inference will come in a later milestone.

4. **Notification System:** No real-time notifications yet. Cardholders must manually refresh inbox to see new batches.

### Future Enhancements

- Finance UI to create cardholder batches from completed Finance batches
- Rejected batch rework flow (create new batch from rejected batch)
- Real-time notifications for new batches
- Batch search and filtering
- Export approved batches to Format 3 / Pronto

---

## 16. Troubleshooting

### Common Issues

**Issue:** Finance Inbox shows "No imports found"
- **Solution:** Ensure you've imported at least one CSV via Admin/Finance → Imports & Ledger.

**Issue:** Cardholder Inbox shows "No batches found"
- **Solution:** Create a cardholder batch from a completed Finance batch via API (see section 5.2).
- **Check:** Ensure the cardholder has accounts assigned (Admin/Finance → Cards & Accounts tab).

**Issue:** Cardholder batch shows "No transactions in this batch" or empty transaction list
- **Solution:** This means the batch was created but no transactions matched the cardholder's accounts. Check:
  1. Cardholder has accounts assigned (Admin/Finance → Cards & Accounts).
  2. Those accounts have transactions in the parent Finance batch.
  3. Account numbers match (last 4 digits) between Account table and Transaction table.

**Issue:** Manager Inbox shows "No batches awaiting approval"
- **Solution:** Ensure a cardholder batch has been submitted (status = completed) for a cardholder under this manager.

**Issue:** "Batch must be in 'open' status" errors
- **Solution:** Check batch status in database. You may need to reset status manually or create a new batch.

**Issue:** Predictions not appearing
- **Solution:** Check backend logs for ML stub errors. Verify transaction narratives contain recognizable keywords.

**Issue:** Inline editing not saving
- **Solution:** Check browser console for errors. Verify backend `/api/classifications/{id}` endpoint is reachable.

---

## 17. Test Data Reference

### Sample Cardholder IDs (from earlier inspection)

- **ID = 2** (Baker, card 6547) - 0 transactions (may not be useful)
- **ID = 3** (Barclay, card 6341) - 11 transactions
- **ID = 4** (Bell, card 4137) - 54 transactions
- **ID = 5** (Brown, card 7173) - 26 transactions ✓ **Recommended for testing**
- **ID = 21** (Rouhan, card 6087) - 30 transactions

### Sample Manager IDs

- **ID = 4** (markd@gekkos.com) - Manages multiple cardholders ✓ **Recommended for testing**

### Test Workflow Recommendation

1. Use **Cardholder ID = 5** (Brown) for classification testing.
2. Use **Manager ID = 4** (if it manages Brown) for approval testing.
3. Create Finance batches from existing import jobs.
4. Create cardholder batches via API from completed Finance batches.
5. Test full workflow: Finance complete → Cardholder classify/submit → Manager approve/reject.

---

**End of Test Guide**

For questions or issues during testing, refer to:
- Backend logs: Check terminal running `uvicorn`
- Frontend console: Check browser DevTools console
- Database: Inspect `ccc.db` directly if needed
- API docs: `http://localhost:8001/docs` for endpoint details
