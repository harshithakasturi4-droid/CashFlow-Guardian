import re
import math
from datetime import datetime, timedelta
from sqlalchemy import select, desc, func
from sqlalchemy.orm import Session
from .models import Transaction, Reminder, LoanOut, DailyUpdate

def format_inr(value: float) -> str:
    """Formats a float value to INR representation, e.g. Rs 1,50,000."""
    try:
        val_int = int(round(value))
        # Simple Indian numbering format: 12,34,567
        s = str(val_int)
        if len(s) <= 3:
            return f"Rs {s}"
        last_three = s[-3:]
        remaining = s[:-3]
        groups = []
        while remaining:
            groups.append(remaining[-2:])
            remaining = remaining[:-2]
        groups.reverse()
        return f"Rs {','.join(groups)},{last_three}"
    except Exception:
        return f"Rs {value:,.0f}"

def parse_intent(query: str) -> str:
    """Classifies the natural language query into one of our predefined intents."""
    query = query.lower().strip()
    
    # Cash/Balance Intent
    if any(k in query for k in ["cash", "balance", "money", "funds", "in hand", "wallet", "have now"]):
        return "CASH"
    
    # Reminders/Pending tasks Intent
    if any(k in query for k in ["reminder", "due", "pending alert", "upcoming", "task", "notify"]):
        return "REMINDERS"
        
    # GST / Tax / Invoice Intent
    if any(k in query for k in ["gst", "tax", "gstin", "payable"]):
        return "GST"
        
    # Expense / Spend / Outgoings Intent
    if any(k in query for k in ["spend", "spent", "expense", "outgoing", "outflow", "purchases"]):
        return "EXPENSES"
        
    # Health / Business performance Intent
    if any(k in query for k in ["health", "score", "performance", "business tips", "warning", "advice", "doing", "summary"]):
        return "HEALTH"
        
    return "GENERAL"

def fetch_financial_context(db: Session, user_id: str) -> dict:
    """Fetches full financial data context from the database for the given user,
    replicating the key metrics shown on the frontend dashboard."""
    today = datetime.utcnow().date()
    week_start = today - timedelta(days=6)
    
    # 1. Transactions - All time
    all_txs = db.scalars(
        select(Transaction).where(Transaction.user_id == user_id)
    ).all()
    
    total_income = sum(t.amount for t in all_txs if t.type == "income")
    total_expense = sum(t.amount for t in all_txs if t.type == "expense")
    
    # 2. Monthly transactions
    month_key = today.strftime("%Y-%m")
    month_txs = [t for t in all_txs if t.date.startswith(month_key)]
    this_month_income = sum(t.amount for t in month_txs if t.type == "income")
    this_month_expense = sum(t.amount for t in month_txs if t.type == "expense")
    
    # 3. Daily update
    daily = db.scalar(
        select(DailyUpdate)
        .where(DailyUpdate.user_id == user_id)
        .order_by(desc(DailyUpdate.date))
        .limit(1)
    )
    
    # 4. Cash Available (match dashboard calculation)
    cash = daily.cash_in_hand if daily else max(total_income - total_expense, 0.0)
    
    # 5. Due Reminders
    due_reminders = db.scalars(
        select(Reminder).where(
            Reminder.user_id == user_id,
            Reminder.status == "active",
            Reminder.due_at <= datetime.utcnow()
        )
    ).all()
    
    # 6. Overdue Loans
    loans = db.scalars(
        select(LoanOut).where(
            LoanOut.user_id == user_id, 
            LoanOut.status != "returned"
        )
    ).all()
    overdue_loans = []
    for l in loans:
        try:
            due_date = datetime.strptime(l.due_on, "%Y-%m-%d")
            if due_date <= datetime.utcnow():
                overdue_loans.append(l)
        except ValueError:
            pass
            
    # 7. Cash forecast (using last 90 days of records)
    recent_txs = []
    for t in all_txs:
        try:
            tx_date = datetime.strptime(t.date, "%Y-%m-%d")
            if (datetime.utcnow() - tx_date).days <= 90:
                recent_txs.append(t)
        except ValueError:
            pass
            
    monthly_income_avg = sum(t.amount for t in recent_txs if t.type == "income") / 3.0
    monthly_expense_avg = sum(t.amount for t in recent_txs if t.type == "expense") / 3.0
    next_month_cash = round(cash + monthly_income_avg - monthly_expense_avg)
    shortage = next_month_cash < 0
    
    # 8. Health Score logic (matching frontend dashboard.tsx)
    expense_control = max(0, 35 - round((total_expense / total_income) * 25)) if total_income > 0 else 18
    average_weekly_expense = total_expense / max(1, math.ceil(len(all_txs) / 7)) if all_txs else 0
    cash_stability = 12 if shortage else (35 if cash > average_weekly_expense * 2 else 22)
    payment_risk = max(0, 30 - len(due_reminders) * 5 - len(overdue_loans) * 8)
    health_score = min(100, max(0, expense_control + cash_stability + payment_risk))
    
    # 9. Warnings / Alerts
    warnings = []
    if shortage:
        warnings.append("Expected cash shortage next month.")
    if this_month_expense > this_month_income and this_month_expense > 0:
        warnings.append("Your expenses are higher than your income this month.")
    if due_reminders:
        warnings.append(f"{len(due_reminders)} reminders are due now.")
    if overdue_loans:
        warnings.append(f"{len(overdue_loans)} customer loan payments are overdue.")
        
    # 10. GST taxable transactions sum
    taxable_txs = [t for t in all_txs if t.taxable]
    gst_collected = sum(t.gst_amount for t in taxable_txs if t.type == "income")
    gst_paid = sum(t.gst_amount for t in taxable_txs if t.type == "expense")
    net_payable = gst_collected - gst_paid
    
    # 11. Business tip
    tips = []
    by_category = {}
    for t in [x for x in all_txs if x.type == "expense"]:
        by_category[t.category] = by_category.get(t.category, 0) + t.amount
    if by_category:
        top_category = max(by_category, key=by_category.get)
        tips.append(f"Spending on {top_category} is high ({format_inr(by_category[top_category])}).")
    tips.append("Try to maintain at least 2 weeks of emergency cash.")
    tips.append("Regularly check if recurring subscription costs can be reduced.")
    
    return {
        "cash": cash,
        "total_income": total_income,
        "total_expense": total_expense,
        "this_month_income": this_month_income,
        "this_month_expense": this_month_expense,
        "due_reminders": due_reminders,
        "overdue_loans": overdue_loans,
        "health_score": health_score,
        "warnings": warnings,
        "tips": tips,
        "gst_collected": gst_collected,
        "gst_paid": gst_paid,
        "gst_net": net_payable,
        "last_daily_update_date": daily.date if daily else None
    }

def handle_local_voice_response(intent: str, context: dict) -> str:
    """Constructs a clear, concise natural language response in English for the intent."""
    if intent == "CASH":
        cash_str = format_inr(context["cash"])
        if context["last_daily_update_date"]:
            return f"You currently have {cash_str} in hand. This matches your daily cash update from {context['last_daily_update_date']}."
        return f"You currently have {cash_str} in hand, calculated from your transactions."
        
    elif intent == "REMINDERS":
        count = len(context["due_reminders"])
        if count == 0:
            return "All clear! You have no due reminders at the moment."
        titles = [r.title for r in context["due_reminders"]]
        return f"You have {count} due reminder{'s' if count > 1 else ''} needing attention: {', '.join(titles)}."
        
    elif intent == "EXPENSES":
        spent = format_inr(context["this_month_expense"])
        income = format_inr(context["this_month_income"])
        return f"You have spent {spent} this month. For comparison, your sales income for this month is {income}."
        
    elif intent == "GST":
        collected = format_inr(context["gst_collected"])
        paid = format_inr(context["gst_paid"])
        net = format_inr(context["gst_net"])
        if context["gst_net"] > 0:
            return f"GST Status: You collected {collected} and paid {paid}. Your net payable GST is {net}."
        return f"GST Status: You collected {collected} and paid {paid}. You have a net GST input tax credit of {format_inr(abs(context['gst_net']))}."
        
    elif intent == "HEALTH":
        score = context["health_score"]
        status = "steady" if score >= 70 else ("fair" if score >= 45 else "needs attention")
        response = f"Your business financial health score is {score} out of 100, which is {status}."
        if context["warnings"]:
            response += f" Warnings: {'; '.join(context['warnings'])}"
        if context["tips"]:
            response += f" Tip: {context['tips'][0]}"
        return response
        
    return "I am CashFlow Guardian. I can help you with your cash available, due reminders, monthly expenses, and GST status."
