# Mock Authentication System

## Overview

This is a **temporary** role-based authentication system for testing and development. It will be replaced with Azure AD SSO in M6 (Final Milestone).

## How It Works

1. **Role Selector**: A dropdown in the header allows you to select a role (Admin, Finance, Cardholder, Manager)
2. **Cardholder ID Input**: For Cardholder and Manager roles, you can enter a Cardholder ID to simulate being that user
3. **LocalStorage**: The selected role and cardholder ID are stored in browser localStorage for persistence across page refreshes

## Usage

### Admin/Finance
- Select "Admin" or "Finance" role
- No additional input needed
- Can see all transactions and manage everything

### Cardholder
- Select "Cardholder" role
- Enter a Cardholder ID (e.g., `1`, `2`, etc.)
- Will see only transactions from accounts assigned to that cardholder

### Manager
- Select "Manager" role
- Enter a Cardholder ID (this is used to look up the manager - in production, manager identity comes from SSO)
- Will see transactions from all cardholders assigned to that manager

## Testing Role-Based Views

1. **Cardholder View**:
   - Set role to "Cardholder"
   - Enter a cardholder ID (check the Cardholders table in Admin/Finance to find valid IDs)
   - Navigate to `/cardholder` to see their transactions

2. **Manager View**:
   - Set role to "Manager"
   - Enter a cardholder ID that has a manager assigned
   - Navigate to `/manager` to see transactions for all their cardholders

## Replacing with SSO

When implementing Azure AD SSO:
1. Remove `RoleContext.tsx` and `RoleProvider` from `main.tsx`
2. Remove the `RoleSelector` component from `App.tsx`
3. Implement proper authentication middleware that extracts role from SSO tokens
4. Update API endpoints to use real authentication headers instead of `X-Mock-Role`

