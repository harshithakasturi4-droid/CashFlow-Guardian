from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from datetime import datetime

from .db import Base


def utcnow() -> datetime:
    return datetime.utcnow()


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    email: Mapped[str] = mapped_column(String, unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Profile(Base):
    __tablename__ = "profiles"

    id: Mapped[str] = mapped_column(String, ForeignKey("users.id"), primary_key=True)
    display_name: Mapped[str] = mapped_column(String)
    gstin: Mapped[str | None] = mapped_column(String(15), nullable=True)
    gst_default_rate: Mapped[float] = mapped_column(Float, default=18.0)
    name: Mapped[str | None] = mapped_column(String, nullable=True)
    phone_number: Mapped[str | None] = mapped_column(String, nullable=True)
    business_name: Mapped[str | None] = mapped_column(String, nullable=True)
    preferred_currency: Mapped[str] = mapped_column(String, default="INR")
    default_financial_year_start_month: Mapped[str] = mapped_column(String, default="April")
    email_alerts_bills: Mapped[bool] = mapped_column(Boolean, default=True)
    email_alerts_gst: Mapped[bool] = mapped_column(Boolean, default=True)
    email_alerts_reminders: Mapped[bool] = mapped_column(Boolean, default=True)


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(String, index=True)
    amount: Mapped[float] = mapped_column(Float)
    category: Mapped[str] = mapped_column(String)
    date: Mapped[str] = mapped_column(String)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    gst_amount: Mapped[float] = mapped_column(Float, default=0.0)
    gst_rate: Mapped[float] = mapped_column(Float, default=0.0)
    gstin_counterparty: Mapped[str | None] = mapped_column(String(15), nullable=True)
    source: Mapped[str] = mapped_column(String, default="cash")
    status: Mapped[str] = mapped_column(String, default="completed")
    taxable: Mapped[bool] = mapped_column(Boolean, default=False)
    type: Mapped[str] = mapped_column(String)
    vendor: Mapped[str | None] = mapped_column(String, nullable=True)
    bill_id: Mapped[str | None] = mapped_column(String, ForeignKey("bills.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Reminder(Base):
    __tablename__ = "reminders"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(String, index=True)
    title: Mapped[str] = mapped_column(String)
    category: Mapped[str] = mapped_column(String)
    due_at: Mapped[datetime] = mapped_column(DateTime)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    amount: Mapped[float | None] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String, default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Alert(Base):
    __tablename__ = "alerts"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(String, index=True)
    record_id: Mapped[str | None] = mapped_column(String, nullable=True)
    record_type: Mapped[str | None] = mapped_column(String, nullable=True)
    alert_type: Mapped[str] = mapped_column(String)
    severity: Mapped[str] = mapped_column(String, default="yellow")
    title: Mapped[str] = mapped_column(String)
    message: Mapped[str] = mapped_column(Text)
    suggested_action: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(String, default="open")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class LoanOut(Base):
    __tablename__ = "loans_out"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(String, index=True)
    amount: Mapped[float] = mapped_column(Float)
    borrower_name: Mapped[str] = mapped_column(String)
    lent_on: Mapped[str] = mapped_column(String)
    due_on: Mapped[str] = mapped_column(String)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String, default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class DailyUpdate(Base):
    __tablename__ = "daily_updates"
    __table_args__ = (UniqueConstraint("user_id", "date", name="uq_daily_user_date"),)

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(String, index=True)
    date: Mapped[str] = mapped_column(String)
    sales: Mapped[float] = mapped_column(Float, default=0.0)
    expenses: Mapped[float] = mapped_column(Float, default=0.0)
    cash_in_hand: Mapped[float] = mapped_column(Float, default=0.0)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Bill(Base):
    __tablename__ = "bills"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(String, index=True)
    vendor: Mapped[str | None] = mapped_column(String, nullable=True)
    bill_number: Mapped[str | None] = mapped_column(String, nullable=True)
    bill_date: Mapped[str | None] = mapped_column(String, nullable=True)
    total_amount: Mapped[float | None] = mapped_column(Float, nullable=True)
    gstin: Mapped[str | None] = mapped_column(String(15), nullable=True)
    gst_amount: Mapped[float | None] = mapped_column(Float, nullable=True)
    flagged: Mapped[bool] = mapped_column(Boolean, default=False)
    flag_reasons: Mapped[str] = mapped_column(Text, default="[]")
    ai_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    image_url: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(String, index=True)
    action: Mapped[str] = mapped_column(String)
    record_type: Mapped[str] = mapped_column(String)
    record_id: Mapped[str] = mapped_column(String)
    description: Mapped[str] = mapped_column(Text)
    actor: Mapped[str] = mapped_column(String)
    role: Mapped[str] = mapped_column(String, default="owner")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
