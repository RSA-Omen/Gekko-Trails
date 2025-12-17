from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Query, Header
from sqlalchemy import select, or_

from app.db import get_session
from app.models import Transaction, Cardholder, Manager, CardholderManager, Account
from app.schemas import TransactionOut


router = APIRouter()


@router.get("", response_model=dict)
async def list_transactions(
    bank_account: Optional[str] = Query(default=None, description="Filter by Bank Account"),
    cardholder_id: Optional[int] = Query(default=None, description="Filter by Cardholder ID (for cardholder/manager views)"),
    manager_id: Optional[int] = Query(default=None, description="Filter by Manager ID (shows transactions for manager's cardholders)"),
    limit: int = Query(default=100, ge=1, le=1000),
    x_mock_role: Optional[str] = Header(default=None, alias="X-Mock-Role", description="Mock role for testing (admin/finance/cardholder/manager)"),
) -> dict:
    """
    Return ledger transactions in Format 1 view.
    
    Role-based filtering:
    - Admin/Finance: See all transactions (no filtering)
    - Cardholder: Must provide cardholder_id to see own transactions
    - Manager: Must provide manager_id to see transactions for assigned cardholders
    """
    with get_session() as session:
        stmt = select(
            Transaction.id,
            Transaction.bank_account,
            Transaction.date,
            Transaction.narrative,
            Transaction.debit_amount,
            Transaction.credit_amount,
            Transaction.balance,
            Transaction.raw_categories,
            Transaction.serial,
            Transaction.composite_key,
            Transaction.created_at,
        ).order_by(Transaction.date.desc(), Transaction.id.desc())

        # Role-based filtering
        if manager_id:
            # Manager view: Get all cardholders assigned to this manager
            cardholder_links = session.execute(
                select(CardholderManager.cardholder_id).where(
                    CardholderManager.manager_id == manager_id
                )
            ).scalars().all()
            
            if cardholder_links:
                # Get bank account numbers for these cardholders
                accounts = session.execute(
                    select(Account.bank_account_number).where(Account.cardholder_id.in_(cardholder_links))
                ).scalars().all()
                
                if accounts:
                    # Filter by bank_account (since transactions might not be linked to account_id yet)
                    # Match transactions where bank_account ends with any of the account numbers
                    conditions = []
                    for acc_num in accounts:
                        # Match if transaction bank_account ends with account number (last 4 digits)
                        if len(acc_num) >= 4:
                            last4 = acc_num[-4:]
                            conditions.append(Transaction.bank_account.like(f"%{last4}"))
                    
                    if conditions:
                        stmt = stmt.where(or_(*conditions))
                    else:
                        stmt = stmt.where(Transaction.id == -1)  # Impossible condition
                else:
                    # No accounts for these cardholders, return empty
                    stmt = stmt.where(Transaction.id == -1)  # Impossible condition
            else:
                # Manager has no cardholders, return empty
                stmt = stmt.where(Transaction.id == -1)  # Impossible condition
        elif cardholder_id:
            # Cardholder view: Get bank account numbers for this cardholder
            accounts = session.execute(
                select(Account.bank_account_number).where(Account.cardholder_id == cardholder_id)
            ).scalars().all()
            
            if accounts:
                # Filter by bank_account (since transactions might not be linked to account_id yet)
                # Match transactions where bank_account ends with any of the account numbers
                conditions = []
                for acc_num in accounts:
                    # Match if transaction bank_account ends with account number (last 4 digits)
                    if len(acc_num) >= 4:
                        last4 = acc_num[-4:]
                        conditions.append(Transaction.bank_account.like(f"%{last4}"))
                
                if conditions:
                    stmt = stmt.where(or_(*conditions))
                else:
                    stmt = stmt.where(Transaction.id == -1)  # Impossible condition
            else:
                # Cardholder has no accounts, return empty
                stmt = stmt.where(Transaction.id == -1)  # Impossible condition

        if bank_account:
            stmt = stmt.where(Transaction.bank_account == bank_account)

        stmt = stmt.limit(limit)
        rows = session.execute(stmt).all()

    items = [
        TransactionOut(
            id=row.id,
            bank_account=row.bank_account,
            date=row.date,
            narrative=row.narrative,
            debit_amount=float(row.debit_amount) if row.debit_amount is not None else None,
            credit_amount=float(row.credit_amount) if row.credit_amount is not None else None,
            balance=float(row.balance) if row.balance is not None else None,
            raw_categories=row.raw_categories,
            serial=row.serial,
            composite_key=row.composite_key,
            created_at=row.created_at,
        )
        for row in rows
    ]
    return {"items": items}



