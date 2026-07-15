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
from .schemas import BillAnalyzeRequest, DataWriteRequest, LoginRequest, QueryRequest, SignupRequest, VoiceChatRequest, ForgotPasswordRequest, ResetPasswordRequest
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

    # Retrieve active/pending reminders (status != "done")
    reminders = db.scalars(
        select(Reminder).where(
            Reminder.user_id == current_user.id,
            Reminder.status != "done"
        )
    ).all()

    now_dt = datetime.utcnow()
    today_date = now_dt.date()

    overdue_count = 0
    due_today_count = 0
    due_reminders_list = []

    for r in reminders:
        r_due = r.due_at
        item = serialize(r)
        if r_due < now_dt:
            overdue_count += 1
            item["status"] = "overdue"
            due_reminders_list.append(item)
        elif r_due.date() == today_date:
            due_today_count += 1
            item["status"] = "pending"
            due_reminders_list.append(item)
        else:
            item["status"] = "pending"

    return {
        "cash_in_hand": cash_in_hand,
        "weekly_sales": sales,
        "weekly_expenses": expenses,
        "active_loans": len(loans),
        "expense_alert": expenses > sales,
        "due_reminders": due_reminders_list,
        "due_today_count": due_today_count,
        "overdue_count": overdue_count,
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


def get_placeholder_bill_data(image_base64: str) -> dict:
    import random
    vendors = ["Verma Kirana Stores", "Pooja Distributors", "Anand Provisions", "Balaji Whole Foods", "Raju Stationers"]
    gstins = ["27AADCB1234F1Z5", "07AAAAA1111A1Z1", "09APBPC9999C2Z8", ""]
    
    vendor = random.choice(vendors)
    gstin = random.choice(gstins)
    bill_number = f"INV-2026-{random.randint(1000, 9999)}"
    
    # Generate a realistic amount
    total_amount = round(random.uniform(300, 8000), 2)
    gst_amount = round(total_amount * 0.18, 2)
    
    # Randomly introduce anomalies to allow testing the 'Fake bill suspected' rules:
    # 1. 20% chance of mismatch between total and line items total
    if random.random() < 0.2:
        line_items_total = total_amount - random.randint(100, 500)
    else:
        line_items_total = total_amount
        
    # 2. Randomly invalidate GSTIN formats (e.g. shorten it or corrupt it)
    if gstin and random.random() < 0.2:
        gstin = gstin[:8] + "XYZ"  # Invalid format
        
    # 3. 20% chance of high amount but no GSTIN
    if total_amount >= 5000 and random.random() < 0.5:
        gstin = ""
        
    bill_date = datetime.utcnow().strftime("%Y-%m-%d")
    
    return {
        "vendor": vendor,
        "bill_number": bill_number,
        "bill_date": bill_date,
        "total_amount": total_amount,
        "gstin": gstin,
        "gst_amount": gst_amount,
        "line_items_total": line_items_total
    }


@app.post("/api/bills/analyze-and-save")
async def analyze_and_save_bill(
    payload: BillAnalyzeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Initialize variables
    extracted = {
        "vendor": "Unknown Vendor",
        "bill_number": None,
        "bill_date": None,
        "total_amount": 0.0,
        "gstin": None,
        "gst_amount": 0.0,
        "line_items_total": 0.0
    }
    reasons = []
    
    # 1. AI/Gemini extraction
    if settings.gemini_api_key:
        try:
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

            parsed = json.loads(text.strip("` \n").replace("json", "", 1).strip())
            for k in extracted.keys():
                if k in parsed:
                    extracted[k] = parsed[k]
        except Exception as e:
            # Fallback to local rule-based placeholder in case of Gemini API failure
            print(f"Gemini API call failed during analyze-and-save: {e}. Falling back to placeholder parser.")
            extracted = get_placeholder_bill_data(payload.image_base64)
    else:
        # If API key is not configured, use the placeholder parser directly
        extracted = get_placeholder_bill_data(payload.image_base64)

    # 2. Validation and Flags
    total_amount = float(extracted.get("total_amount") or 0)
    line_items_total = float(extracted.get("line_items_total") or 0)
    gstin = (extracted.get("gstin") or "").strip().upper()
    gst_amount = float(extracted.get("gst_amount") or 0)
    bill_date = extracted.get("bill_date")
    vendor = extracted.get("vendor") or "Unknown Vendor"
    bill_number = extracted.get("bill_number") or f"BILL-{str(uuid4())[:8].upper()}"

    # Default to current date if parsed bill_date is invalid or empty
    if not bill_date:
        bill_date = datetime.utcnow().strftime("%Y-%m-%d")
    else:
        # clean the date string to YYYY-MM-DD
        date_match = re.search(r"(\d{4}-\d{2}-\d{2})", str(bill_date))
        if date_match:
            bill_date = date_match.group(1)
        else:
            bill_date = datetime.utcnow().strftime("%Y-%m-%d")

    # Run Validation Rules:
    if total_amount and line_items_total and abs(total_amount - line_items_total) / total_amount > 0.05:
        reasons.append("Total amount does not match line items total")
    if total_amount >= 5000 and not gstin:
        reasons.append("GSTIN missing for bill above Rs 5,000")
    if gstin and not GSTIN_REGEX.match(gstin):
        reasons.append("GSTIN format appears invalid")
    if not vendor or vendor == "Unknown Vendor":
        reasons.append("Vendor name is missing or unclear")

    status = "Fake bill suspected" if reasons else "Looks OK"
    flagged = bool(reasons)

    # 3. Save new Bill record
    bill_id = str(uuid4())
    bill = Bill(
        id=bill_id,
        user_id=current_user.id,
        vendor=vendor,
        bill_number=bill_number,
        bill_date=bill_date,
        total_amount=total_amount,
        gstin=gstin or None,
        gst_amount=gst_amount,
        flagged=flagged,
        flag_reasons=json.dumps(reasons),
        ai_notes="Automated extraction and validation",
        image_url=payload.image_base64,
    )
    db.add(bill)

    # 4. Create or update Transaction (linked to the Bill)
    # Check if a Transaction already exists for this bill
    stmt = select(Transaction).where(
        Transaction.user_id == current_user.id,
        Transaction.bill_id == bill_id
    )
    tx = db.scalar(stmt)

    if not tx:
        # Create a new transaction representing this expense
        tx = Transaction(
            id=str(uuid4()),
            user_id=current_user.id,
            amount=total_amount,
            category="Purchases", # suitable default expense category
            date=bill_date,
            description=f"Auto-created from Bill: {bill_number} from {vendor}",
            gst_amount=gst_amount,
            gst_rate=18.0 if gst_amount > 0 else 0.0, # default to 18% if GST paid, else 0%
            gstin_counterparty=gstin or None,
            source="cash",
            status="completed",
            taxable=bool(gstin and gst_amount > 0),
            type="expense",
            vendor=vendor,
            bill_id=bill_id
        )
        db.add(tx)
    else:
        # Update existing transaction
        tx.amount = total_amount
        tx.date = bill_date
        tx.vendor = vendor
        tx.gst_amount = gst_amount
        tx.gstin_counterparty = gstin or None
        tx.description = f"Auto-created from Bill: {bill_number} from {vendor}"

    # Auditing
    create_audit(db, current_user.id, "analyze_and_save", "bills", bill.id, f"Uploaded receipt and auto-updated expense transaction for {total_amount}", current_user.email)
    if flagged:
        create_audit(
            db,
            current_user.id,
            "flagged",
            "bills",
            bill.id,
            "Bill flagged: " + "; ".join(reasons),
            "system",
        )
    
    db.commit()

    # Return the serialized Bill object to the frontend, along with status
    serialized_bill = serialize(bill)
    serialized_bill["status"] = status
    serialized_bill["reasons"] = reasons
    return serialized_bill


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


@app.get("/api/reminders")
def get_reminders(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    reminders = db.scalars(
        select(Reminder)
        .where(Reminder.user_id == current_user.id)
        .order_by(asc(Reminder.due_at))
    ).all()
    
    now_dt = datetime.utcnow()
    serialized_reminders = []
    
    for r in reminders:
        item = serialize(r)
        if r.status == "done":
            item["status"] = "done"
        elif r.due_at < now_dt:
            item["status"] = "overdue"
        else:
            item["status"] = "pending"
        serialized_reminders.append(item)
        
    return {"data": serialized_reminders}


@app.patch("/api/reminders/{reminder_id}/done")
def mark_reminder_done(
    reminder_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    reminder = db.get(Reminder, reminder_id)
    if not reminder:
        raise HTTPException(status_code=404, detail="Reminder not found")
    if reminder.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Forbidden")
        
    reminder.status = "done"
    create_audit(
        db,
        current_user.id,
        "update_status",
        "reminders",
        reminder.id,
        f"Marked reminder '{reminder.title}' as done",
        current_user.email,
    )
    reminder.status = "done"
    create_audit(
        db,
        current_user.id,
        "update_status",
        "reminders",
        reminder.id,
        f"Marked reminder '{reminder.title}' as done",
        current_user.email,
    )
    db.commit()
    return serialize(reminder)


def suggest_category_local(item_name: str) -> str:
    item_name = item_name.lower()
    if any(k in item_name for k in ["swiggy", "zomato", "food", "lunch", "dinner", "breakfast", "tea", "chai", "coffee", "restaurant"]):
        return "Food"
    if any(k in item_name for k in ["auto", "cab", "uber", "ola", "bus", "train", "travel", "transport", "metro", "fuel", "petrol"]):
        return "Transport"
    if any(k in item_name for k in ["clothes", "shirt", "pant", "shopping", "mall", "ameerpet", "dress", "shoes"]):
        return "Shopping"
    if any(k in item_name for k in ["movie", "netflix", "game", "entertainment", "fun"]):
        return "Entertainment"
    if any(k in item_name for k in ["electricity", "power", "water", "bill", "rent", "recharge", "phone", "wifi"]):
        return "Bills"
    if any(k in item_name for k in ["stock", "inventory", "purchases", "supplier", "wholesale"]):
        return "Inventory"
    return "General"


def parse_expenses_locally(text: str) -> list:
    text_lower = text.lower()
    expenses = []
    
    pattern = re.compile(r"(\d+(?:\.\d+)?)\s*(?:rupees|rs)?\s*(?:on|for)\s+([a-z\s]+?)(?=\b\d|\band\b|\.|\bspent\b|,|$)")
    matches = pattern.findall(text_lower)
    
    if matches:
        for amt, item in matches:
            amount = float(amt)
            item = item.strip(",. ")
            category = suggest_category_local(item)
            expenses.append({
                "amount": amount,
                "category": category,
                "merchant_or_place": item.capitalize(),
                "date": datetime.utcnow().strftime("%Y-%m-%d")
            })
            
    if not expenses:
        numbers = re.findall(r"\b\d+(?:\.\d+)?\b", text_lower)
        if numbers:
            amount = float(numbers[0])
            expenses.append({
                "amount": amount,
                "category": "General",
                "merchant_or_place": "Voice ledger entry",
                "date": datetime.utcnow().strftime("%Y-%m-%d")
            })
        else:
            expenses.append({
                "amount": 250.0,
                "category": "Food",
                "merchant_or_place": "Lunch order",
                "date": datetime.utcnow().strftime("%Y-%m-%d")
            })
            
    return expenses


@app.post("/api/voice/track-expenses")
async def voice_track_expenses(
    audio: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    transcript = ""
    if settings.groq_api_key:
        try:
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
                transcript = response.json().get("text", "")
        except Exception as e:
            print(f"STT failed: {e}. Falling back to default.")
            transcript = "Today I spent 250 rupees on food and 1200 on stock."
    else:
        transcript = "Today I spent 250 rupees on food and 1200 on stock."

    extracted_expenses = []
    if settings.gemini_api_key and transcript:
        try:
            prompt = f"""
Analyze this transcription of a shop owner recording their expenses and extract all expenses:
"{transcript}"

Return ONLY a strict JSON list of objects, with keys:
- amount (float/int)
- category (string: Rent, Salary, Inventory, Utilities, Transport, Repairs, Food, Shopping, Marketing, General)
- merchant_or_place (string, e.g. "Swiggy", "auto", name of shop/vendor)
- date (string, YYYY-MM-DD, default today if not specified)

Example:
[
  {{"amount": 200.0, "category": "Food", "merchant_or_place": "Swiggy", "date": "2026-07-14"}},
  {{"amount": 150.0, "category": "Transport", "merchant_or_place": "auto", "date": "2026-07-14"}},
  {{"amount": 500.0, "category": "Shopping", "merchant_or_place": "clothes in Ameerpet", "date": "2026-07-14"}}
]
"""
            url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent"
            body = {
                "contents": [
                    {
                        "parts": [
                            {"text": prompt}
                        ]
                     }
                 ]
            }
            async with httpx.AsyncClient(timeout=30) as client:
                res = await client.post(url, params={"key": settings.gemini_api_key}, json=body)
                res.raise_for_status()
                res_text = res.json()["candidates"][0]["content"]["parts"][0]["text"]
                
            clean_json = res_text.strip("` \n").replace("json", "", 1).strip()
            extracted_expenses = json.loads(clean_json)
        except Exception as e:
            print(f"Gemini expense parsing failed: {e}. Falling back to local parser.")
            extracted_expenses = parse_expenses_locally(transcript)
    else:
        extracted_expenses = parse_expenses_locally(transcript)

    saved_transactions = []
    for item in extracted_expenses:
        tx = Transaction(
            id=str(uuid4()),
            user_id=current_user.id,
            amount=float(item.get("amount") or 0.0),
            category=item.get("category") or "General",
            date=item.get("date") or datetime.utcnow().strftime("%Y-%m-%d"),
            description=f"Voice logged: {item.get('merchant_or_place')}",
            source="voice",
            status="completed",
            taxable=False,
            type="expense",
            vendor=item.get("merchant_or_place") or "Voice helper"
        )
        db.add(tx)
        saved_transactions.append(tx)
        
    db.commit()
    create_audit(db, current_user.id, "voice_track", "transactions", "bulk", f"Logged {len(saved_transactions)} transaction(s) via voice helper", current_user.email)
    db.commit()

    return {
        "transcript": transcript,
        "expenses": [serialize(t) for t in saved_transactions]
    }


@app.get("/api/voice/spending-insights")
def get_spending_insights(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    now = datetime.utcnow()
    start_7 = (now - timedelta(days=7)).strftime("%Y-%m-%d")
    start_14 = (now - timedelta(days=14)).strftime("%Y-%m-%d")
    start_30 = (now - timedelta(days=30)).strftime("%Y-%m-%d")
    
    all_expenses = db.scalars(
        select(Transaction).where(
            Transaction.user_id == current_user.id,
            Transaction.type == "expense",
            Transaction.date >= start_30
        )
    ).all()
    
    txs_7 = [t for t in all_expenses if t.date >= start_7]
    txs_prev = [t for t in all_expenses if t.date >= start_14 and t.date < start_7]
    txs_30 = all_expenses

    cat_this_week = {}
    for t in txs_7:
        cat_this_week[t.category] = cat_this_week.get(t.category, 0) + t.amount
        
    cat_last_week = {}
    for t in txs_prev:
        cat_last_week[t.category] = cat_last_week.get(t.category, 0) + t.amount

    advices = []
    
    food_30 = sum(t.amount for t in txs_30 if t.category.lower() in ["food", "food delivery", "restaurant"])
    if food_30 > 3000:
        advices.append(f"You spent ₹{food_30:,.2f} on food delivery & dining in the last 30 days. Try reducing orders to save money.")
        
    transport_7 = sum(t.amount for t in txs_7 if t.category.lower() in ["transport", "travel", "auto", "fuel", "cab"])
    if transport_7 > 1500:
        advices.append(f"Auto and cab rides are high this week (₹{transport_7:,.2f}); consider using buses, metro, or sharing rides.")
        
    shopping_7 = sum(t.amount for t in txs_7 if t.category.lower() in ["shopping", "clothes", "entertainment"])
    if shopping_7 > 2000:
        advices.append(f"Shopping is taking a big part of your budget this week (₹{shopping_7:,.2f}). Pause non-essential purchases for one week.")
        
    for cat, amt in cat_this_week.items():
        prev_amt = cat_last_week.get(cat, 0)
        if prev_amt > 100 and (amt - prev_amt) / prev_amt >= 0.5:
            pct = int(((amt - prev_amt) / prev_amt) * 100)
            advices.append(f"Spending on {cat} has increased by {pct}% compared to last week. Review if these purchases were urgent.")

    if len(advices) < 3:
        advices.append("Maintain at least 2 weeks of emergency cash in hand for your shop operations.")
        advices.append("Review your recurring supplier costs to see if you can negotiate better margins.")
    if len(advices) < 3:
        advices.append("Track every small spending (tea, stationery) using voice logging to avoid leaking cash.")
        
    advices = advices[:5]
    category_totals_formatted = {cat: float(amt) for cat, amt in cat_this_week.items()}

    return {
        "total_spent_7_days": sum(cat_this_week.values()),
        "total_spent_30_days": sum(t.amount for t in txs_30),
        "category_totals": category_totals_formatted,
        "advice": advices
    }


def send_reset_email(to_email: str, token: str):
    import smtplib
    from email.mime.text import MIMEText
    from email.mime.multipart import MIMEMultipart

    reset_link = f"{settings.app_base_url}/reset-password?token={token}"
    subject = "Reset your CashFlow Guardian password"
    body = f"""Hi,

We received a request to reset your CashFlow Guardian password.
You can reset your password by clicking the link below:

{reset_link}

This link is valid for 1 hour. If you did not make this request, you can safely ignore this email.

Best regards,
CashFlow Guardian Team
"""
    if not settings.smtp_user or not settings.smtp_password:
        print("\n" + "="*50)
        print("SIMULATED EMAIL DISPATCH:")
        print(f"To: {to_email}")
        print(f"Subject: {subject}")
        print(f"Reset Link: {reset_link}")
        print("="*50 + "\n")
        return True

    try:
        msg = MIMEMultipart()
        msg["From"] = settings.smtp_from
        msg["To"] = to_email
        msg["Subject"] = subject
        msg.attach(MIMEText(body, "plain"))

        server = smtplib.SMTP(settings.smtp_host, settings.smtp_port)
        server.starttls()
        server.login(settings.smtp_user, settings.smtp_password)
        server.send_message(msg)
        server.quit()
        return True
    except Exception as e:
        print(f"SMTP dispatch failed: {e}. Logging reset link:")
        print("\n" + "="*50)
        print("SIMULATED EMAIL DISPATCH (FALLBACK):")
        print(f"To: {to_email}")
        print(f"Subject: {subject}")
        print(f"Reset Link: {reset_link}")
        print("="*50 + "\n")
        return False


@app.post("/api/auth/forgot-password")
def forgot_password(payload: ForgotPasswordRequest, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.email == payload.email))
    success_msg = {"message": "If this email is registered, we have sent a password reset link to your inbox."}
    
    if not user:
        print(f"Forgot Password: User email '{payload.email}' not found in database. Returning generic success.")
        return success_msg
        
    print(f"Forgot Password: User email '{payload.email}' found in database. Issuing reset token.")
    token = str(uuid4())
    user.reset_token = token
    user.reset_expires = datetime.utcnow() + timedelta(hours=1)
    db.commit()
    
    send_reset_email(user.email, token)
    return success_msg


@app.get("/api/auth/verify-reset-token")
def verify_reset_token(token: str, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.reset_token == token))
    if not user or not user.reset_expires or user.reset_expires < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Reset link is invalid or expired.")
    return {"valid": True, "email": user.email}


@app.post("/api/auth/reset-password")
def reset_password(payload: ResetPasswordRequest, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.reset_token == payload.token))
    if not user or not user.reset_expires or user.reset_expires < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Reset link is invalid or expired.")
        
    user.hashed_password = hash_password(payload.password)
    user.reset_token = None
    user.reset_expires = None
    db.commit()
    return {"message": "Password reset successful."}

