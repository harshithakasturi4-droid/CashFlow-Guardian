# CashFlow Guardian

Mobile-first cashflow management for Indian shop owners with a React SPA frontend and FastAPI backend.

## Structure

- `frontend/` React 19 + TypeScript + TanStack Router + Tailwind CSS
- `backend/` FastAPI + SQLite + SQLAlchemy + JWT auth

## Quick start

### Backend

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Frontend

```powershell
cd frontend
npm install
npm run dev
```

The frontend expects the API at `http://127.0.0.1:8000`.

## Environment

Create a root `.env` file:

```env
JWT_SECRET=change-me
GROQ_API_KEY=your-groq-key
GEMINI_API_KEY=your-gemini-key
```
