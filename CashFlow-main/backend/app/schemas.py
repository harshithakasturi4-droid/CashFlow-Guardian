from datetime import datetime
from pydantic import BaseModel, EmailStr, Field


class SignupRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    name: str = Field(min_length=2)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class AuthResponse(BaseModel):
    token: str
    user: dict


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


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    password: str = Field(min_length=8)
