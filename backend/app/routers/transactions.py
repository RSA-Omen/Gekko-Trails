from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Query
from sqlalchemy import select

from app.db import get_session
from app.models import Transaction
from app.schemas import TransactionOut


router = APIRouter()


@router.get("", response_model=dict)
async def list_transactions(
    bank_account: Optional[str] = Query(default=None, description="Filter by Bank Account"),
    limit: int = Query(default=100, ge=1, le=1000),
) -> dict:
    """
    Return ledger transactions in Format 1 view.

    For now this is a simple admin/finance style listing with an optional
    bank_account filter and a hard limit.
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



