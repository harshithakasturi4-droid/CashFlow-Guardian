from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


ENV_PATH = Path(__file__).resolve().parents[2] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(ENV_PATH), extra="ignore")

    app_name: str = "CashFlow Guardian API"
    jwt_secret: str = "change-me"
    jwt_algorithm: str = "HS256"
    jwt_expiry_hours: int = 72
    groq_api_key: str | None = None
    gemini_api_key: str | None = None
    database_url: str = "sqlite:///./cashflow.db"
    cors_origins: list[str] = [
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://127.0.0.1:5175",
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
    ]
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_user: str | None = None
    smtp_password: str | None = None
    smtp_from: str = "no-reply@cashflowguardian.com"
    app_base_url: str = "http://localhost:5173"


settings = Settings()
