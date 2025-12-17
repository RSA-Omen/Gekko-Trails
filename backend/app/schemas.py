from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel


class TransactionOut(BaseModel):
    id: int
    bank_account: str
    date: date
    narrative: str
    debit_amount: Optional[float] = None
    credit_amount: Optional[float] = None
    balance: Optional[float] = None
    raw_categories: Optional[str] = None
    serial: Optional[str] = None
    composite_key: str
    created_at: datetime

    class Config:
        from_attributes = True


class ManagerOut(BaseModel):
    id: int
    user_id: Optional[int] = None
    email: Optional[str] = None  # Manager email (from mapping until SSO is implemented)

    class Config:
        from_attributes = True


class CardholderOut(BaseModel):
    id: int
    name: str
    surname: str
    email: str
    user_id: Optional[int] = None  # SSO link (nullable - becomes NULL if SSO revoked)
    display_name: str  # Computed: "name surname"
    manager: Optional[ManagerOut] = None  # Manager assigned to this cardholder

    class Config:
        from_attributes = True


class CardholderCreate(BaseModel):
    name: str
    surname: str
    email: str
    manager_id: Optional[int] = None  # Optional manager assignment on creation


class CardholderUpdate(BaseModel):
    name: Optional[str] = None
    surname: Optional[str] = None
    email: Optional[str] = None
    manager_id: Optional[int] = None  # Set to None to remove manager


class AccountOut(BaseModel):
    id: int
    bank_account_number: str
    label: Optional[str] = None
    # Lightweight summary: e.g. {"id": 13, "display_name": "Hughes"}
    cardholder: Optional[dict] = None

    class Config:
        from_attributes = True


class AssignCardholderRequest(BaseModel):
    display_name: Optional[str] = None  # Legacy: create/find by name
    cardholder_id: Optional[int] = None  # New: assign by ID


class ManagerAccountOut(BaseModel):
    account_id: int
    bank_account_number: str
    cardholder_id: int
    cardholder_display_name: str


# Format 2 projection schemas
class Format2Item(BaseModel):
    """Format 2 view: Transaction + Classification fields combined."""
    transaction_id: int
    date: date
    bank_account: str
    narrative: str
    amount: Optional[float] = None  # Combined debit/credit
    debit_amount: Optional[float] = None
    credit_amount: Optional[float] = None
    balance: Optional[float] = None
    description: Optional[str] = None
    project: Optional[str] = None
    cost_category: Optional[str] = None
    gl_account: Optional[str] = None
    status: str  # unclassified, predicted, user_confirmed, manager_approved, rejected
    source: Optional[str] = None
    batch_id: Optional[int] = None

    class Config:
        from_attributes = True


# Classification batch schemas
class ClassificationBatchOut(BaseModel):
    id: int
    owner_type: str
    owner_id: Optional[int] = None
    parent_batch_id: Optional[int] = None
    import_job_id: Optional[int] = None
    status: str
    title: Optional[str] = None
    label: Optional[str] = None
    note: Optional[str] = None
    rejection_reason: Optional[str] = None
    created_at: datetime
    completed_at: Optional[datetime] = None
    submitted_at: Optional[datetime] = None
    approved_at: Optional[datetime] = None
    transaction_count: Optional[int] = None  # Computed field

    class Config:
        from_attributes = True


class ClassificationBatchCreate(BaseModel):
    owner_type: str
    owner_id: Optional[int] = None
    parent_batch_id: Optional[int] = None
    import_job_id: Optional[int] = None
    title: Optional[str] = None
    label: Optional[str] = None
    transaction_ids: Optional[list[int]] = None  # Transactions to include in batch


class ClassificationBatchUpdate(BaseModel):
    status: Optional[str] = None
    title: Optional[str] = None
    label: Optional[str] = None
    note: Optional[str] = None
    rejection_reason: Optional[str] = None
    transaction_ids: Optional[list[int]] = None  # For partial submission - only submit these transactions


class ClassificationUpdate(BaseModel):
    description: Optional[str] = None
    project: Optional[str] = None
    cost_category: Optional[str] = None
    gl_account: Optional[str] = None
    status: Optional[str] = None


class BatchRejectRequest(BaseModel):
    reason: str  # Required rejection note




