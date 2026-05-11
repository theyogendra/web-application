from typing import List, Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import ALGORITHM
from app.database.session import get_db
from app.modules.users.models import User, Permission, Role
from app.schemas.token import TokenPayload
from app.services.audit import log_action

reusable_oauth2 = OAuth2PasswordBearer(
    tokenUrl=f"{settings.API_V1_STR}/auth/login"
)

def get_current_user(
    db: Session = Depends(get_db),
    token: str = Depends(reusable_oauth2)
) -> User:
    try:
        payload = jwt.decode(
            token, settings.SECRET_KEY, algorithms=[ALGORITHM]
        )
        # sub is always a string in JWT - convert to int for DB lookup
        sub = payload.get("sub")
        token_type = payload.get("type")
        if sub is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token: missing subject",
            )
        if token_type != "access":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token type",
            )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
        )
    
    user = db.query(User).filter(User.id == int(sub)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if not user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    return user


class PermissionChecker:
    def __init__(self, required_permissions: List[str]):
        self.required_permissions = required_permissions

    def __call__(self, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
        if user.is_superuser:
            return True

        user_permissions = set()
        if user.role:
            for perm in user.role.permissions:
                user_permissions.add(perm.slug)

        for permission in self.required_permissions:
            if permission not in user_permissions:
                log_action(db, user.id, "PERMISSION_DENIED", "System", None, None, {"permission": permission})
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Missing permission: {permission}"
                )
        return True


def require_permission(permission: str):
    return Depends(PermissionChecker([permission]))


def require_role(role_slug: str):
    def role_checker(user: User = Depends(get_current_user)):
        if user.is_superuser:
            return True
        if not user.role or user.role.slug != role_slug:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Required role: {role_slug}"
            )
        return True
    return Depends(role_checker)
