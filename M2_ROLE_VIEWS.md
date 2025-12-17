# M2 Role-Based Views Implementation

## Summary

Implemented role-based transaction views for **Cardholder** and **Manager** dashboards without requiring SSO. This allows us to test and develop M2 features while SSO (M6) is still pending.

## What Was Implemented

### 1. Mock Role System
- **Location**: `frontend/src/contexts/RoleContext.tsx`
- **Purpose**: Temporary role selector for testing without SSO
- **Features**:
  - Role dropdown (Admin, Finance, Cardholder, Manager)
  - Cardholder ID input for Cardholder/Manager roles
  - Persists selection in localStorage
  - Will be removed when SSO is implemented (M6)

### 2. Cardholder Dashboard
- **Location**: `frontend/src/pages/CardholderDashboard.tsx`
- **Features**:
  - Shows transactions only for accounts assigned to the selected cardholder
  - Filters by `bank_account` matching (last 4 digits)
  - Displays transaction table with Date, Bank Account, Narrative, Debit, Credit, Balance
  - Shows helpful messages if role/cardholder ID not set

### 3. Manager Dashboard
- **Location**: `frontend/src/pages/ManagerDashboard.tsx`
- **Features**:
  - Shows transactions for all cardholders assigned to the manager
  - Looks up manager ID from cardholder's manager relationship
  - Filters transactions by matching bank accounts of assigned cardholders
  - Same transaction table format as Cardholder view

### 4. Enhanced Transactions API
- **Location**: `backend/app/routers/transactions.py`
- **New Query Parameters**:
  - `cardholder_id`: Filter transactions for a specific cardholder
  - `manager_id`: Filter transactions for all cardholders assigned to a manager
- **Filtering Logic**:
  - Matches transactions by `bank_account` field (last 4 digits)
  - Works even if transactions aren't linked to accounts via `account_id` yet
  - Uses SQL `LIKE` pattern matching for flexibility

## How to Test

### Testing Cardholder View

1. **Start the application** (frontend and backend should be running)

2. **Select Cardholder Role**:
   - In the header, select "Cardholder" from the role dropdown
   - Enter a Cardholder ID (e.g., `2` for "Baker", `3` for "Barclay")
   - Navigate to `/cardholder` or click "Cardholder" in the nav

3. **View Transactions**:
   - Click "Refresh Transactions"
   - Should see only transactions from accounts assigned to that cardholder
   - Bank account numbers shown as last 4 digits

### Testing Manager View

1. **Select Manager Role**:
   - In the header, select "Manager" from the role dropdown
   - Enter a Cardholder ID that has a manager assigned
   - The system will look up the manager from the cardholder's manager relationship
   - Navigate to `/manager` or click "Manager" in the nav

2. **View Transactions**:
   - Click "Refresh Transactions"
   - Should see transactions from all cardholders assigned to that manager

### Sample Cardholder IDs for Testing

From the imported data:
- ID `2`: Baker (scottb@gekkos.com) - Account: 6547
- ID `3`: Barclay (simon.barclay@gekkos.com) - Account: 6341
- ID `4`: Bell (timb@gekkos.com) - Account: 4137
- ID `5`: Brown (mbrown@gekkos.com) - Account: 7173
- ID `6`: Conroy (matthewc@gekkos.com) - Account: 4265

## Technical Notes

### Bank Account Matching

Transactions are filtered by matching the last 4 digits of the `bank_account` field:
- Account has: `6547`
- Transaction has: `033605216547` or `6547`
- Match: `%6547` pattern matches both

This works because:
1. Some transactions have full bank account numbers (e.g., "033605216999")
2. Some transactions have short account numbers (e.g., "7601")
3. Accounts are stored with 4-digit identifiers (last 4 of full account)
4. The `LIKE '%XXXX'` pattern matches any transaction ending with those 4 digits

### Future Improvements

When SSO is implemented (M6):
1. Remove `RoleContext.tsx` and mock role selector
2. Extract role from SSO token claims
3. Extract user ID from SSO token
4. Look up cardholder by `user_id` (SSO link)
5. Look up manager by `user_id` (SSO link)
6. API endpoints will use real auth headers instead of query parameters

## Files Changed

### Frontend
- `frontend/src/contexts/RoleContext.tsx` (new)
- `frontend/src/main.tsx` (added RoleProvider)
- `frontend/src/App.tsx` (added RoleSelector component)
- `frontend/src/pages/CardholderDashboard.tsx` (implemented)
- `frontend/src/pages/ManagerDashboard.tsx` (implemented)
- `frontend/MOCK_AUTH_README.md` (documentation)

### Backend
- `backend/app/routers/transactions.py` (added role-based filtering)

## Known Limitations

### Transaction-Account Linking

Currently, transactions are filtered by matching `bank_account` field with account `bank_account_number`. However:

1. **Account numbers** in the `accounts` table are stored as 4-digit identifiers (e.g., "6547")
2. **Transaction bank_account** values may be full account numbers (e.g., "033605216999") or short numbers (e.g., "7601")
3. **Matching works** when transaction bank_account ends with the account's 4-digit number

**Workaround**: 
- Use the "Cards & Cardholders" view in Admin/Finance to assign accounts to cardholders
- Ensure account `bank_account_number` matches the last 4 digits of actual transaction `bank_account` values
- Or update account numbers to match actual transaction bank_account values

**Future Fix**: 
- Link transactions to accounts via `account_id` during import
- Or create a sync job that matches transactions to accounts based on bank_account patterns

## Status

✅ **M2 Role-Based Views: COMPLETE** (with known limitation above)

- [x] Mock role system for testing without SSO
- [x] Cardholder dashboard with filtered transactions
- [x] Manager dashboard with filtered transactions
- [x] API endpoints support role-based filtering
- [x] Documentation and testing guide
- [ ] Transaction-account linking (future improvement)

**Next Steps**: 
1. Test with cardholders that have matching transactions (e.g., account "7173" matches transaction "7173")
2. Continue with remaining M2 tasks (Format 2 views, classification UI, etc.)
3. Implement transaction-account linking during import or via sync job

