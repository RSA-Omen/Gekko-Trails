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


class CardholderOut(BaseModel):
    id: int
    name: str
    surname: str
    email: str
    user_id: Optional[int] = None  # SSO link (nullable - becomes NULL if SSO revoked)
    display_name: str  # Computed: "name surname"

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
    cardholder: Optional[CardholderOut] = None

    class Config:
        from_attributes = True


class AssignCardholderRequest(BaseModel):
    display_name: str


