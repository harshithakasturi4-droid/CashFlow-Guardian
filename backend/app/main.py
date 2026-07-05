import json
import re
from datetime import datetime, timedelta
from typing import Any
from uuid import uuid4

import httpx
from fastapi import Depends, FastAPI, File, HTTPException, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import Select, and_, asc, desc, func, select
from sqlalchemy.exc import IntegrityError, StatementError
from sqlalchemy.orm import Session

from .auth import create_token, get_current_user, hash_password, verify_password
from .config import settings
from .db import Base, engine, get_db
from .models import Alert, AuditEvent, Bill, DailyUpdate, LoanOut, Profile, Reminder, Transaction, User
from .schemas import BillAnalyzeRequest, DataWriteRequest, LoginRequest, QueryRequest, SignupRequest, VoiceChatRequest
from .voice_helper import parse_intent, fetch_financial_context, handle_local_voice_response, format_inr


Base.metadata.create_all(bind=engine)

app = FastAPI(title=settings.app_name)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

TABLES = {
    "profiles": Profile,
    "alerts": Alert,
    "transactions": Transaction,
    "reminders": Reminder,
    "loans_out": LoanOut,
    "daily_updates": DailyUpdate,
    "bills": Bill,
    "audit_events": AuditEvent,
}

GSTIN_REGEX = re.compile(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[A-Z0-9]{1}Z[A-Z0-9]{1}$")


def serialize(instance: Any) -> dict:
    data = {}
    for column in instance.__table__.columns:
        value = getattr(instance, column.name)
        if isinstance(value, datetime):
            data[column.name] = value.isoformat()
        else:
            data[column.name] = value
    return data


def user_scoped_column(model, current_user: User):
    if hasattr(model, "user_id"):
        return model.user_id == current_user.id
    if model is Profile:
        return model.id == current_user.id
    raise HTTPException(status_code=400, detail="Table is not user-scoped")


def apply_filters(stmt: Select, model, filters: dict | None):
    if not filters:
        return stmt

    clauses = []
    for field_name, filter_value in filters.items():
        if not hasattr(model, field_name):
            raise HTTPException(status_code=400, detail=f"Invalid field: {field_name}")
        column = getattr(model, field_name)
        if "eq" in filter_value:
            clauses.append(column == filter_value["eq"])
        if "gte" in filter_value:
            clauses.append(column >= filter_value["gte"])
        if "lte" in filter_value:
            clauses.append(column <= filter_value["lte"])
    if clauses:
        stmt = stmt.where(and_(*clauses))
    return stmt


def create_audit(db: Session, user_id: str, action: str, record_type: str, record_id: str, description: str, actor: str):
    db.add(
        AuditEvent(
            id=str(uuid4()),
            user_id=user_id,
            action=action,
            record_type=record_type,
            record_id=record_id,
            description=description,
            actor=actor,
            role="owner",
        )
    )


def parse_datetime_value(value: Any, field_name: str) -> datetime:
    if isinstance(value, datetime):
        return value
    if not value:
        raise HTTPException(status_code=400, detail=f"{field_name} is required")
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=f"{field_name} must be a valid date and time") from exc
    raise HTTPException(status_code=400, detail=f"{field_name} must be a valid date and time")


def normalize_row_for_model(model, row: dict) -> dict:
    if model is Reminder and "due_at" in row:
        row["due_at"] = parse_datetime_value(row["due_at"], "due_at")
    return row


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/signup")
def signup(payload: SignupRequest, db: Session = Depends(get_db)):
    if db.scalar(select(User).where(User.email == payload.email)):
        raise HTTPException(status_code=409, detail="Email already exists")

    user = User(
        id=str(uuid4()),
        email=payload.email,
        hashed_password=hash_password(payload.password),
    )
    profile = Profile(id=user.id, display_name=payload.name, gst_default_rate=18.0)
    db.add(user)
    db.add(profile)
    create_audit(db, user.id, "signup", "users", user.id, "Created account", payload.name)
    db.commit()
    token = create_token(user.id, user.email)
    return {"token": token, "user": {"id": user.id, "email": user.email, "name": profile.display_name}}


@app.post("/api/auth/login")
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == payload.email))
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    profile = db.get(Profile, user.id)
    create_audit(db, user.id, "login", "users", user.id, "User logged in", profile.display_name if profile else user.email)
    db.commit()
    token = create_token(user.id, user.email)
    return {"token": token, "user": {"id": user.id, "email": user.email, "name": profile.display_name if profile else user.email}}


@app.post("/api/auth/logout")
def logout(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    profile = db.get(Profile, current_user.id)
    create_audit(
        db,
        current_user.id,
        "logout",
        "users",
        current_user.id,
        "User logged out",
        profile.display_name if profile else current_user.email,
    )
    db.commit()
    return {"ok": True}


@app.post("/api/query/{table_name}")
def query_table(
    table_name: str,
    payload: QueryRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    model = TABLES.get(table_name)
    if not model:
        raise HTTPException(status_code=404, detail="Unknown table")

    stmt = select(model).where(user_scoped_column(model, current_user))
    stmt = apply_filters(stmt, model, payload.filters)

    if payload.sort:
        for sort_rule in payload.sort:
            field_name = sort_rule.get("field")
            direction = sort_rule.get("direction", "asc")
            if not hasattr(model, field_name):
                continue
            column = getattr(model, field_name)
            stmt = stmt.order_by(desc(column) if direction == "desc" else asc(column))

    stmt = stmt.limit(min(payload.limit, 200)).offset(payload.offset)
    rows = db.scalars(stmt).all()
    data = [serialize(row) for row in rows]

    if payload.select:
        data = [{key: row.get(key) for key in payload.select if key in row} for row in data]

    return {"data": data}


@app.post("/api/data/{table_name}")
@app.put("/api/data/{table_name}")
def create_or_upsert_table_row(
    table_name: str,
    payload: DataWriteRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    model = TABLES.get(table_name)
    if not model:
        raise HTTPException(status_code=404, detail="Unknown table")

    rows = payload.values if isinstance(payload.values, list) else [payload.values]
    results = []

    for row in rows:
        row = dict(row)
        row = normalize_row_for_model(model, row)
        row.setdefault("id", str(uuid4()))
        if hasattr(model, "user_id"):
            row["user_id"] = current_user.id
        if model is Profile:
            row["id"] = current_user.id

        existing = db.get(model, row["id"])
        if existing:
            if hasattr(existing, "user_id") and existing.user_id != current_user.id:
                raise HTTPException(status_code=403, detail="Forbidden")
            if model is Profile and existing.id != current_user.id:
                raise HTTPException(status_code=403, detail="Forbidden")
            for key, value in row.items():
                if hasattr(existing, key):
                    setattr(existing, key, value)
            results.append(existing)
        else:
            instance = model(**row)
            db.add(instance)
            results.append(instance)

    try:
        create_audit(
            db,
            current_user.id,
            "upsert",
            table_name,
            results[0].id if results else "bulk",
            f"Upserted {len(results)} record(s) in {table_name}",
            current_user.email,
        )
        db.commit()
    except (IntegrityError, StatementError, ValueError) as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail="Could not save record. Please check the form values.") from exc

    return {"data": [serialize(item) for item in results]}


@app.patch("/api/data/{table_name}")
def update_rows(
    table_name: str,
    payload: DataWriteRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    model = TABLES.get(table_name)
    if not model:
        raise HTTPException(status_code=404, detail="Unknown table")

    stmt = select(model).where(user_scoped_column(model, current_user))
    stmt = apply_filters(stmt, model, payload.filters)
    rows = db.scalars(stmt).all()
    values = normalize_row_for_model(model, dict(payload.values))
    for row in rows:
        for key, value in values.items():
            if hasattr(row, key):
                setattr(row, key, value)
    create_audit(db, current_user.id, "patch", table_name, "bulk", f"Updated {len(rows)} record(s)", current_user.email)
    db.commit()
    return {"data": [serialize(item) for item in rows]}


@app.delete("/api/data/{table_name}")
def delete_rows(
    table_name: str,
    payload: DataWriteRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    model = TABLES.get(table_name)
    if not model:
        raise HTTPException(status_code=404, detail="Unknown table")

    stmt = select(model).where(user_scoped_column(model, current_user))
    stmt = apply_filters(stmt, model, payload.filters)
    rows = db.scalars(stmt).all()
    count = len(rows)
    for row in rows:
        db.delete(row)
    create_audit(db, current_user.id, "delete", table_name, "bulk", f"Deleted {count} record(s)", current_user.email)
    db.commit()
    return {"deleted": count}


@app.get("/api/dashboard")
def dashboard(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    today = datetime.utcnow().date()
    week_start = today - timedelta(days=6)

    txs = db.scalars(
        select(Transaction).where(
            Transaction.user_id == current_user.id,
            Transaction.date >= week_start.isoformat(),
            Transaction.date <= today.isoformat(),
        )
    ).all()
    loans = db.scalars(select(LoanOut).where(LoanOut.user_id == current_user.id, LoanOut.status != "returned")).all()
    daily = db.scalar(
        select(DailyUpdate).where(DailyUpdate.user_id == current_user.id).order_by(desc(DailyUpdate.date)).limit(1)
    )

    sales = sum(tx.amount for tx in txs if tx.type == "income")
    expenses = sum(tx.amount for tx in txs if tx.type == "expense")
    cash_in_hand = daily.cash_in_hand if daily else max(sales - expenses, 0)

    due_reminders = db.scalars(
        select(Reminder).where(
            Reminder.user_id == current_user.id,
            Reminder.status == "active",
            Reminder.due_at <= datetime.utcnow(),
        )
    ).all()

    return {
        "cash_in_hand": cash_in_hand,
        "weekly_sales": sales,
        "weekly_expenses": expenses,
        "active_loans": len(loans),
        "expense_alert": expenses > sales,
        "due_reminders": [serialize(item) for item in due_reminders],
    }


@app.get("/api/gst-summary")
def gst_summary(
    start: str,
    end: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    txs = db.scalars(
        select(Transaction).where(
            Transaction.user_id == current_user.id,
            Transaction.date >= start,
            Transaction.date <= end,
            Transaction.taxable == True,  # noqa: E712
        )
    ).all()
    collected = sum(tx.gst_amount for tx in txs if tx.type == "income")
    paid = sum(tx.gst_amount for tx in txs if tx.type == "expense")
    return {"collected": collected, "paid": paid, "net_payable": collected - paid}


@app.post("/api/bills/analyze")
async def analyze_bill(
    payload: BillAnalyzeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not settings.gemini_api_key:
        raise HTTPException(status_code=400, detail="GEMINI_API_KEY is not configured")

    prompt = """
Return only strict JSON with keys:
vendor, bill_number, bill_date, total_amount, gstin, gst_amount, line_items_total.
Extract from this base64 invoice image.
""".strip()

    url = (
        "https://generativelanguage.googleapis.com/v1beta/models/"
        "gemini-2.5-flash:generateContent"
    )
    body = {
        "contents": [
            {
                "parts": [
                    {"text": prompt},
                    {"inline_data": {"mime_type": "image/png", "data": payload.image_base64.split(",", 1)[-1]}},
                ]
            }
        ]
    }

    async with httpx.AsyncClient(timeout=45) as client:
        response = await client.post(url, params={"key": settings.gemini_api_key}, json=body)
        response.raise_for_status()
        text = response.json()["candidates"][0]["content"]["parts"][0]["text"]

    extracted = json.loads(text.strip("` \n").replace("json", "", 1).strip())
    reasons = []
    total_amount = float(extracted.get("total_amount") or 0)
    line_items_total = float(extracted.get("line_items_total") or 0)
    gstin = (extracted.get("gstin") or "").strip().upper()

    if total_amount and line_items_total and abs(total_amount - line_items_total) / total_amount > 0.05:
        reasons.append("Total amount does not match line items total")
    if total_amount >= 5000 and not gstin:
        reasons.append("GSTIN missing for bill above Rs 5,000")
    if gstin and not GSTIN_REGEX.match(gstin):
        reasons.append("GSTIN format appears invalid")

    bill = Bill(
        id=str(uuid4()),
        user_id=current_user.id,
        vendor=extracted.get("vendor"),
        bill_number=extracted.get("bill_number"),
        bill_date=extracted.get("bill_date"),
        total_amount=total_amount,
        gstin=gstin or None,
        gst_amount=float(extracted.get("gst_amount") or 0),
        flagged=bool(reasons),
        flag_reasons=json.dumps(reasons),
        ai_notes="Gemini OCR extraction",
        image_url=payload.image_base64,
    )
    db.add(bill)
    create_audit(db, current_user.id, "analyze", "bills", bill.id, "Uploaded receipt and extracted bill details", current_user.email)
    if reasons:
        create_audit(
            db,
            current_user.id,
            "flagged",
            "bills",
            bill.id,
            "Bill needs review: " + "; ".join(reasons),
            "system",
        )
    db.commit()

    return {"extracted": extracted, "flagged": bool(reasons), "reasons": reasons}


@app.post("/api/voice/stt")
async def voice_stt(
    audio: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
):
    if not settings.groq_api_key:
        raise HTTPException(status_code=400, detail="GROQ_API_KEY is not configured")

    files = {"file": (audio.filename, await audio.read(), audio.content_type or "audio/webm")}
    data = {
        "model": "whisper-large-v3-turbo",
        "language": "en",
        "response_format": "json",
        "temperature": "0",
    }
    headers = {"Authorization": f"Bearer {settings.groq_api_key}"}

    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.post(
            "https://api.groq.com/openai/v1/audio/transcriptions",
            headers=headers,
            data=data,
            files=files,
        )
        response.raise_for_status()
    return response.json()


@app.post("/api/voice/chat")
async def voice_chat(
    payload: VoiceChatRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Retrieve the latest user query from the message history
    user_query = ""
    for msg in reversed(payload.history):
        if msg.get("role") == "user":
            user_query = msg.get("content", "")
            break

    if not user_query:
        return {"reply": "Hello! How can I help you with your CashFlow today?"}

    # Query live database financial metrics
    context = fetch_financial_context(db, current_user.id)
    intent = parse_intent(user_query)

    # If a Groq API Key is configured, run smart augmented prompt parsing
    if settings.groq_api_key:
        system_content = (
            "You are CashFlow Guardian, a friendly, concise voice assistant for a small Indian shop owner. "
            "Reply in simple sentences under 3 lines. Answer in English.\n\n"
            f"Here is the LIVE business data for the user from the database:\n"
            f"- Cash available in hand: {format_inr(context['cash'])}\n"
            f"- Due Reminders count: {len(context['due_reminders'])}\n"
            f"- Due Reminders details: {', '.join([r.title for r in context['due_reminders']]) if context['due_reminders'] else 'None'}\n"
            f"- Spend/Expenses this month: {format_inr(context['this_month_expense'])}\n"
            f"- Revenue/Sales this month: {format_inr(context['this_month_income'])}\n"
            f"- GST status: Collected {format_inr(context['gst_collected'])}, Paid {format_inr(context['gst_paid'])}, Net Payable {format_inr(context['gst_net'])}\n"
            f"- Financial Health Score: {context['health_score']}/100\n"
            f"- Warnings/Alerts: {'; '.join(context['warnings']) if context['warnings'] else 'None'}\n"
            f"- Business Tips: {context['tips'][0] if context['tips'] else 'None'}\n\n"
            "Use this live database information to answer the user's question accurately. Do not invent or guess any numbers. "
            "Keep the reply conversational, friendly, and very brief (under 3 lines) so it is suitable for speech reading."
        )

        messages = [{"role": "system", "content": system_content}]
        for item in payload.history[:-1]:
            role = "assistant" if item.get("role") == "assistant" else "user"
            messages.append({"role": role, "content": item.get("content", "")})
        messages.append({"role": "user", "content": user_query})

        body = {
            "model": "llama-3.1-8b-instant",
            "messages": messages,
            "temperature": 0.2,
        }
        headers = {"Authorization": f"Bearer {settings.groq_api_key}"}

        try:
            async with httpx.AsyncClient(timeout=45) as client:
                response = await client.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    headers=headers,
                    json=body,
                )
                response.raise_for_status()
            text = response.json()["choices"][0]["message"]["content"]
            return {"reply": text}
        except Exception as e:
            # Fallback to local rule-based response on API error
            print(f"Groq API call failed: {e}. Falling back to rule-based response.")
            return {"reply": handle_local_voice_response(intent, context)}
    else:
        # Fully local pattern-matching voice assistant
        return {"reply": handle_local_voice_response(intent, context)}


@app.post("/api/voice/tts")
async def voice_tts(payload: dict, current_user: User = Depends(get_current_user)):
    if not settings.groq_api_key:
        raise HTTPException(status_code=400, detail="GROQ_API_KEY is not configured")

    headers = {"Authorization": f"Bearer {settings.groq_api_key}"}
    body = {
        "model": "canopylabs/orpheus-v1-english",
        "input": payload.get("text", ""),
        "voice": "hannah",
        "response_format": "wav",
    }

    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.post(
            "https://api.groq.com/openai/v1/audio/speech",
            headers=headers,
            json=body,
        )
        response.raise_for_status()
    return Response(content=response.content, media_type="audio/wav")
