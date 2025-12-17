from __future__ import annotations

from typing import List

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, select

from app.db import get_session
from app.models import Account, Cardholder, Transaction
from app.schemas import AccountOut, AssignCardholderRequest, CardholderOut


router = APIRouter()


@router.post("/sync-from-transactions", response_model=dict)
async def sync_accounts_from_transactions() -> dict:
    """
    Ensure there is an Account row for each distinct Transaction.bank_account.

    This is a quick utility for bootstrapping accounts from existing ledger data.
    """
    created = 0
    with get_session() as session:
        # Find distinct bank accounts in transactions.
        distinct_accounts = session.execute(
            select(func.distinct(Transaction.bank_account))
        ).scalars()
        existing_accounts = {
            acc.bank_account_number for acc in session.execute(select(Account)).scalars()
        }

        for bank_account in distinct_accounts:
            if bank_account in existing_accounts:
                continue
            acc = Account(bank_account_number=bank_account, label=bank_account)
            session.add(acc)
            created += 1

    return {"created": created}


@router.post("/link-transactions", response_model=dict)
async def link_transactions_to_accounts() -> dict:
    """
    Link existing transactions to accounts by matching bank_account numbers.
    
    Matches transactions to accounts by:
    1. Exact match on bank_account_number
    2. Last 4 digits match (if account number is 4+ digits)
    """
    linked = 0
    with get_session() as session:
        # Build account map
        account_map: dict[str, int | None] = {}
        all_accounts = list(session.execute(select(Account)).scalars())
        for acc in all_accounts:
            # Store exact match
            account_map[acc.bank_account_number] = acc.id
            # Also store last 4 digits if account number is longer
            if len(acc.bank_account_number) >= 4:
                last4 = acc.bank_account_number[-4:]
                if last4 not in account_map:
                    account_map[last4] = acc.id

        # Update transactions without account_id
        transactions = session.execute(
            select(Transaction).where(Transaction.account_id.is_(None))
        ).scalars().all()

        for tx in transactions:
            bank_acc = tx.bank_account
            # Try exact match first
            account_id = account_map.get(bank_acc)
            # If no exact match, try last 4 digits
            if account_id is None and len(bank_acc) >= 4:
                account_id = account_map.get(bank_acc[-4:])
            
            if account_id:
                tx.account_id = account_id
                linked += 1

    return {"linked": linked, "message": f"Linked {linked} transactions to accounts"}


@router.get("", response_model=List[AccountOut])
async def list_accounts() -> List[AccountOut]:
    """
    List all accounts with their assigned cardholders (if any).
    """
    with get_session() as session:
        accounts = list(session.execute(select(Account)).scalars())
        # Extract data while session is open to avoid detached instance errors.
        items = []
        for acc in accounts:
            cardholder_data = None
            if acc.cardholder_id:
                # Eager-load cardholder if assigned.
                cardholder = session.get(Cardholder, acc.cardholder_id)
                if cardholder:
                    cardholder_data = {"id": cardholder.id, "display_name": cardholder.get_display_name()}
            items.append(
                AccountOut(
                    id=acc.id,
                    bank_account_number=acc.bank_account_number,
                    label=acc.label,
                    cardholder=CardholderOut(**cardholder_data) if cardholder_data else None,
                )
            )
    return items


@router.post("/{account_id}/assign-cardholder", response_model=AccountOut)
async def assign_cardholder(
    account_id: int,
    payload: AssignCardholderRequest,
) -> AccountOut:
    """
    Assign (or create) a Cardholder for a given Account by display name.
    """
    name = payload.display_name.strip()
    if not name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="display_name must not be empty.",
        )

    with get_session() as session:
        account = session.get(Account, account_id)
        if not account:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Account not found.")

        # Try to find an existing cardholder by case-insensitive match on display_name.
        # For backwards compatibility, parse "Name Surname" or just use as name if no space
        parts = name.split(maxsplit=1)
        if len(parts) == 2:
            cardholder_name, cardholder_surname = parts
        else:
            cardholder_name = name
            cardholder_surname = ""
        
        # Try to find by matching display_name (computed property)
        existing = None
        for ch in session.execute(select(Cardholder)).scalars():
            if ch.get_display_name().lower() == name.lower():
                existing = ch
                break

        if existing:
            cardholder = existing
        else:
            # Create new cardholder with parsed name/surname and placeholder email
            # Email will need to be updated via cardholder management UI
            cardholder = Cardholder(
                name=cardholder_name,
                surname=cardholder_surname,
                email=f"{cardholder_name.lower()}.{cardholder_surname.lower()}@gekko.local" if cardholder_surname else f"{cardholder_name.lower()}@gekko.local"
            )
            session.add(cardholder)
            session.flush()

        account.cardholder_id = cardholder.id
        session.flush()

        # Extract data while session is open.
        return AccountOut(
            id=account.id,
            bank_account_number=account.bank_account_number,
            label=account.label,
            cardholder=CardholderOut(id=cardholder.id, display_name=cardholder.get_display_name()),
        )




