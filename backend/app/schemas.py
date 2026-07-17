from datetime import datetime
from pydantic import BaseModel, EmailStr, Field




class QueryRequest(BaseModel):
    select: list[str] | None = None
    filters: dict[str, dict] | None = None
    sort: list[dict] | None = None
    limit: int = 50
    offset: int = 0


class DataWriteRequest(BaseModel):
    values: dict | list[dict]
    filters: dict[str, dict] | None = None


class BillAnalyzeRequest(BaseModel):
    image_base64: str


class VoiceChatRequest(BaseModel):
    history: list[dict]


class ReminderToast(BaseModel):
    id: str
    title: str
    due_at: datetime


class BillAnalyzeAndSaveRequest(BaseModel):
    image_base_64: str


class ProfileUpdateRequest(BaseModel):
    name: str | None = None
    display_name: str | None = None
    email: EmailStr | None = None
    phone_number: str | None = None
    business_name: str | None = None
    gst_number: str | None = None
    preferred_currency: str = "INR"
    default_financial_year_start_month: str = "April"
    email_alerts_bills: bool = True
    email_alerts_gst: bool = True
    email_alerts_reminders: bool = True
