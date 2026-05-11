from datetime import timedelta
from typing import Any
from fastapi import APIRouter, Depends, HTTPException, status, Response
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.api import deps
from app.core import security
from app.core.config import settings
from app.modules.users.models import User

router = APIRouter()


@router.post("/login")
def login_access_token(
    response: Response,
    db: Session = Depends(deps.get_db),
    form_data: OAuth2PasswordRequestForm = Depends()
) -> Any:
    """Login endpoint — accepts OAuth2 form data (username = email, password)."""

    # 1. Look up user
    user = db.query(User).filter(User.email == form_data.username).first()

    if not user or not security.verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password"
        )

    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")

    # 2. Update last login (best-effort, no crash if it fails)
    try:
        user.last_login_at = func.now()
        db.commit()
    except Exception:
        db.rollback()

    # 3. Create tokens
    access_token_expires = timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = security.create_access_token(user.id, expires_delta=access_token_expires)
    refresh_token = security.create_refresh_token(user.id)

    # 4. Set refresh token cookie
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        max_age=30 * 24 * 60 * 60,
        samesite="lax",
        secure=False,
    )

    # 5. Return clean token + user payload
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "email": user.email,
            "full_name": user.full_name,
            "role": user.role.name if user.role else "User",
            "permissions": [p.slug for p in user.role.permissions] if user.role else [],
            "is_superuser": user.is_superuser,
        }
    }


@router.get("/me")
def read_user_me(current_user: User = Depends(deps.get_current_user)) -> Any:
    return {
        "id": current_user.id,
        "email": current_user.email,
        "full_name": current_user.full_name,
        "role": current_user.role.name if current_user.role else "User",
        "permissions": [p.slug for p in current_user.role.permissions] if current_user.role else [],
        "is_superuser": current_user.is_superuser,
    }


@router.post("/logout")
def logout(response: Response) -> Any:
    response.delete_cookie("refresh_token")
    return {"message": "Logged out successfully"}


@router.post("/refresh")
def refresh_token(response: Response, db: Session = Depends(deps.get_db)) -> Any:
    """Token refresh — reads refresh_token from HttpOnly cookie."""
    from fastapi import Request
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Refresh token not found — please log in again"
    )
