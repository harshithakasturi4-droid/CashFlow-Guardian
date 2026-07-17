
from fastapi import Depends, Header, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db
from .models import Profile, User

try:
    from clerk_backend_api import AuthenticateRequestOptions, Clerk, authenticate_request
    print("Clerk SDK imported successfully")
except Exception as e:
    print("IMPORT ERROR:", e)
    AuthenticateRequestOptions = None
    Clerk = None
    authenticate_request = None

_clerk_client = Clerk(bearer_auth=settings.clerk_secret_key) if Clerk and settings.clerk_secret_key else None



def _value(source, key: str):
    if isinstance(source, dict):
        return source.get(key)
    return getattr(source, key, None)


def _email_from_clerk_user(clerk_user) -> str | None:
    primary_email_id = _value(clerk_user, "primary_email_address_id")
    email_addresses = _value(clerk_user, "email_addresses") or []
    for email_address in email_addresses:
        if primary_email_id and _value(email_address, "id") != primary_email_id:
            continue
        email = _value(email_address, "email_address")
        if email:
            return email
    for email_address in email_addresses:
        email = _value(email_address, "email_address")
        if email:
            return email
    return None


def _name_from_clerk_user(clerk_user, email: str) -> str:
    first_name = _value(clerk_user, "first_name") or ""
    last_name = _value(clerk_user, "last_name") or ""
    full_name = f"{first_name} {last_name}".strip()
    return full_name or _value(clerk_user, "username") or email


def _get_clerk_user_profile(clerk_user_id: str) -> dict | None:
    if not _clerk_client:
        return None

    try:
        clerk_user = _clerk_client.users.get(user_id=clerk_user_id)  # type: ignore[union-attr]
    except Exception:
        return None

    email = _email_from_clerk_user(clerk_user)
    if not email:
        return None
    return {"email": email, "name": _name_from_clerk_user(clerk_user, email)}


def _verify_clerk_request(request: Request) -> dict | None:
    print("SECRET:", bool(settings.clerk_secret_key))
    print("JWT KEY:", bool(settings.clerk_jwt_key))
    print("AUTH HEADER:", request.headers.get("authorization"))

    if not authenticate_request or not AuthenticateRequestOptions or not settings.clerk_secret_key:
        print("authenticate_request not configured")
        return None

    options = AuthenticateRequestOptions(
        secret_key=settings.clerk_secret_key,
        jwt_key=settings.clerk_jwt_key,
        authorized_parties=settings.clerk_authorized_parties,
        accepts_token=["session_token"],
    )

    try:
        request_state = authenticate_request(request, options)
        print("SIGNED IN:", request_state.is_signed_in)
        print("PAYLOAD:", request_state.payload)
    except Exception as e:
        print("CLERK ERROR:", repr(e))
        return None
    if not request_state.is_signed_in:
        return None

    payload = request_state.payload
    clerk_user_id = payload["sub"]

    profile = _get_clerk_user_profile(clerk_user_id)

    email = (
        profile.get("email")
        or payload.get("email")
        or f"{clerk_user_id}@clerk.local"
    )

    return {
        "user_id": clerk_user_id,
        "email": email,
        "name": profile.get("name"),
    }
    ...

def _get_or_create_clerk_user(db: Session, clerk_info: dict) -> User:
    email = clerk_info["email"]
    user = db.scalar(select(User).where(User.email == email)) or db.get(User, clerk_info["user_id"])
    if user:
        return user

    user = User(
    id=clerk_info["user_id"],
    email=email,
    name=clerk_info.get("name"),
        )
    db.add(user)
    db.add(
        Profile(
            id=user.id,
            display_name=clerk_info.get("name") or email,
            gst_default_rate=18.0,
        )
    )
    db.commit()
    return user


def get_current_user(
    request: Request,
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> User:
    clerk_info = _verify_clerk_request(request)
    print("CLERK INFO:", clerk_info)

    if not clerk_info:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        )

    print("Creating/Fetching user...")
    return _get_or_create_clerk_user(db, clerk_info)

    clerk_info = _verify_clerk_request(request)

    if not clerk_info:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token",
        )

    return _get_or_create_clerk_user(db, clerk_info)