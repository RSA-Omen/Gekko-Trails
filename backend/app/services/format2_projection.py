from __future__ import annotations

from typing import TYPE_CHECKING

from app.schemas import Format2Item

if TYPE_CHECKING:
    from app.models import Transaction, Classification


def project_to_format2(transaction: "Transaction", classification: "Classification | None" = None) -> Format2Item:
    """
    Project a Transaction (and optional Classification) into Format 2 view.
    
    This combines Format 1 transaction data with Format 2 classification fields.
    """
    # Determine amount (prefer debit, fallback to credit)
    amount = None
    if transaction.debit_amount is not None:
        amount = float(transaction.debit_amount)
    elif transaction.credit_amount is not None:
        amount = float(transaction.credit_amount)
    
    # Extract classification fields if present
    description = None
    project = None
    cost_category = None
    gl_account = None
    status = "unclassified"
    source = None
    batch_id = None
    
    if classification:
        description = classification.description
        project = classification.project
        cost_category = classification.cost_category
        gl_account = classification.gl_account
        status = classification.status or "unclassified"
        source = classification.source
        batch_id = classification.batch_id
    
    return Format2Item(
        transaction_id=transaction.id,
        date=transaction.date,
        bank_account=transaction.bank_account or "",
        narrative=transaction.narrative or "",
        amount=amount,
        debit_amount=float(transaction.debit_amount) if transaction.debit_amount is not None else None,
        credit_amount=float(transaction.credit_amount) if transaction.credit_amount is not None else None,
        balance=float(transaction.balance) if transaction.balance is not None else None,
        description=description,
        project=project,
        cost_category=cost_category,
        gl_account=gl_account,
        status=status,
        source=source,
        batch_id=batch_id,
    )
