from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200))
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    external_id: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    roles: Mapped[list["UserRole"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    cardholder: Mapped["Cardholder | None"] = relationship(back_populates="user", uselist=False)
    manager: Mapped["Manager | None"] = relationship(back_populates="user", uselist=False)


class Role(Base):
    __tablename__ = "roles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(50), unique=True, index=True)

    users: Mapped[list["UserRole"]] = relationship(back_populates="role", cascade="all, delete-orphan")


class UserRole(Base):
    __tablename__ = "user_roles"
    __table_args__ = (UniqueConstraint("user_id", "role_id", name="uq_user_role"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    role_id: Mapped[int] = mapped_column(ForeignKey("roles.id", ondelete="CASCADE"))

    user: Mapped["User"] = relationship(back_populates="roles")
    role: Mapped["Role"] = relationship(back_populates="users")


class Cardholder(Base):
    __tablename__ = "cardholders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    # Optional link to SSO user account (for future Azure AD integration)
    # When SSO is revoked, this becomes NULL but cardholder record persists for history
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    
    # Core cardholder fields (always required, independent of SSO)
    name: Mapped[str] = mapped_column(String(100))
    surname: Mapped[str] = mapped_column(String(100))
    email: Mapped[str] = mapped_column(String(200), index=True)
    
    # Legacy display_name column (kept for backwards compatibility during migration)
    # Can be removed in future once all code uses name+surname
    display_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    
    # Computed property that uses name+surname if display_name is not set
    def get_display_name(self) -> str:
        if self.display_name:
            return self.display_name
        return f"{self.name} {self.surname}".strip()

    user: Mapped["User | None"] = relationship(back_populates="cardholder")
    accounts: Mapped[list["Account"]] = relationship(back_populates="cardholder")
    transactions: Mapped[list["Transaction"]] = relationship(back_populates="cardholder")
    managers: Mapped[list["CardholderManager"]] = relationship(
        back_populates="cardholder", cascade="all, delete-orphan"
    )


class Manager(Base):
    __tablename__ = "managers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))

    user: Mapped["User | None"] = relationship(back_populates="manager")
    cardholders: Mapped[list["CardholderManager"]] = relationship(
        back_populates="manager", cascade="all, delete-orphan"
    )


class CardholderManager(Base):
    __tablename__ = "cardholder_managers"
    __table_args__ = (UniqueConstraint("cardholder_id", "manager_id", name="uq_cardholder_manager"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    cardholder_id: Mapped[int] = mapped_column(ForeignKey("cardholders.id", ondelete="CASCADE"))
    manager_id: Mapped[int] = mapped_column(ForeignKey("managers.id", ondelete="CASCADE"))

    cardholder: Mapped["Cardholder"] = relationship(back_populates="managers")
    manager: Mapped["Manager"] = relationship(back_populates="cardholders")


class Account(Base):
    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    bank_account_number: Mapped[str] = mapped_column(String(100), index=True)
    cardholder_id: Mapped[int | None] = mapped_column(ForeignKey("cardholders.id", ondelete="SET NULL"), nullable=True)
    label: Mapped[str | None] = mapped_column(String(200), nullable=True)

    cardholder: Mapped["Cardholder"] = relationship(back_populates="accounts")
    transactions: Mapped[list["Transaction"]] = relationship(back_populates="account")


class ImportJob(Base):
    __tablename__ = "import_jobs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    file_name: Mapped[str] = mapped_column(String(500))
    source_format: Mapped[str] = mapped_column(String(50))  # FORMAT1_CSV, FORMAT3_XLSX
    status: Mapped[str] = mapped_column(String(50), default="pending")
    total_rows: Mapped[int | None] = mapped_column(Integer, nullable=True)
    error_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    initiated_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    transactions: Mapped[list["Transaction"]] = relationship(back_populates="import_job")


class Transaction(Base):
    __tablename__ = "transactions"
    __table_args__ = (
        # Composite key string to uniquely identify a transaction across imports.
        UniqueConstraint("composite_key", name="uq_transaction_composite_key"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    import_job_id: Mapped[int | None] = mapped_column(ForeignKey("import_jobs.id", ondelete="SET NULL"))
    account_id: Mapped[int | None] = mapped_column(ForeignKey("accounts.id", ondelete="SET NULL"))
    cardholder_id: Mapped[int | None] = mapped_column(ForeignKey("cardholders.id", ondelete="SET NULL"))

    # Bank account identifier from Format 1 (e.g. last 4 digits or similar)
    bank_account: Mapped[str] = mapped_column(String(100))
    date: Mapped[date] = mapped_column(Date)
    narrative: Mapped[str] = mapped_column(String(1000))
    debit_amount: Mapped[Numeric | None] = mapped_column(Numeric(18, 2), nullable=True)
    credit_amount: Mapped[Numeric | None] = mapped_column(Numeric(18, 2), nullable=True)
    balance: Mapped[Numeric | None] = mapped_column(Numeric(18, 2), nullable=True)
    raw_categories: Mapped[str | None] = mapped_column(String(500), nullable=True)
    serial: Mapped[str | None] = mapped_column(String(200), nullable=True)

    # Application-managed composite key:
    # e.g. "{bank_account}|{YYYY-MM-DD}|{narrative}|{index}" where index is 0 for the
    # first occurrence and increments for duplicates discovered within the same file.
    composite_key: Mapped[str] = mapped_column(String(1024), unique=True, index=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )

    import_job: Mapped["ImportJob | None"] = relationship(back_populates="transactions")
    account: Mapped["Account | None"] = relationship(back_populates="transactions")
    cardholder: Mapped["Cardholder | None"] = relationship(back_populates="transactions")
    classification: Mapped["Classification | None"] = relationship(
        back_populates="transaction", uselist=False, cascade="all, delete-orphan"
    )
    finance_extension: Mapped["FinanceExtension | None"] = relationship(
        back_populates="transaction", uselist=False, cascade="all, delete-orphan"
    )
    ml_predictions: Mapped[list["MLPrediction"]] = relationship(
        back_populates="transaction", cascade="all, delete-orphan"
    )


class Classification(Base):
    __tablename__ = "classifications"

    transaction_id: Mapped[int] = mapped_column(
        ForeignKey("transactions.id", ondelete="CASCADE"), primary_key=True
    )
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    project: Mapped[str | None] = mapped_column(String(200), nullable=True)
    cost_category: Mapped[str | None] = mapped_column(String(200), nullable=True)
    gl_account: Mapped[str | None] = mapped_column(String(100), nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="unclassified")
    last_updated_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    last_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    source: Mapped[str | None] = mapped_column(String(50), nullable=True)  # ml, user, manager

    transaction: Mapped["Transaction"] = relationship(back_populates="classification")


class FinanceExtension(Base):
    __tablename__ = "finance_extensions"

    transaction_id: Mapped[int] = mapped_column(
        ForeignKey("transactions.id", ondelete="CASCADE"), primary_key=True
    )
    account: Mapped[str | None] = mapped_column(String(100), nullable=True)
    reference: Mapped[str | None] = mapped_column(String(200), nullable=True)
    tax: Mapped[Numeric | None] = mapped_column(Numeric(18, 2), nullable=True)
    amount: Mapped[Numeric | None] = mapped_column(Numeric(18, 2), nullable=True)
    tax_code: Mapped[str | None] = mapped_column(String(50), nullable=True)
    cbs: Mapped[str | None] = mapped_column(String(50), nullable=True)
    export_batch_id: Mapped[int | None] = mapped_column(ForeignKey("export_batches.id", ondelete="SET NULL"))
    ready_for_pronto: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    exported_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    transaction: Mapped["Transaction"] = relationship(back_populates="finance_extension")
    export_batch: Mapped["ExportBatch | None"] = relationship(back_populates="finance_rows")


class ExportBatch(Base):
    __tablename__ = "export_batches"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    format: Mapped[str] = mapped_column(String(50), default="PRONTO_UPLOAD")
    file_name: Mapped[str | None] = mapped_column(String(500), nullable=True)
    record_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))

    finance_rows: Mapped[list["FinanceExtension"]] = relationship(back_populates="export_batch")


class MLPrediction(Base):
    __tablename__ = "ml_predictions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    transaction_id: Mapped[int] = mapped_column(ForeignKey("transactions.id", ondelete="CASCADE"))
    field_name: Mapped[str] = mapped_column(String(100))
    predicted_value: Mapped[str] = mapped_column(String(500))
    confidence: Mapped[Float] = mapped_column(Float)
    model_version: Mapped[str | None] = mapped_column(String(100), nullable=True)
    predicted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    transaction: Mapped["Transaction"] = relationship(back_populates="ml_predictions")


class UsageMetric(Base):
    __tablename__ = "usage_metrics"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    period_start: Mapped[date] = mapped_column(Date, index=True)
    metric_name: Mapped[str] = mapped_column(String(100))
    metric_value: Mapped[float] = mapped_column(Float)


