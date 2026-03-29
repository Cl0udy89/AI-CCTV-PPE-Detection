"""JWT + password utilities."""
import os
import bcrypt
from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

SECRET_KEY = os.getenv("PPE_SECRET_KEY", "ppe-detection-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 12

_bearer = HTTPBearer(auto_error=False)

ROLE_RANK = {"viewer": 0, "operator": 1, "supervisor": 2, "admin": 3}


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def create_token(user_id: int, username: str, role: str) -> str:
    payload = {
        "sub": str(user_id),
        "username": username,
        "role": role,
        "exp": datetime.utcnow() + timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def _decode(token: str) -> dict:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=401, detail="Token nieprawidłowy lub wygasły")


# ---- FastAPI dependencies ------------------------------------------------

def get_current_user(creds: Optional[HTTPAuthorizationCredentials] = Depends(_bearer)):
    """Returns decoded user dict; raises 401 if missing/invalid."""
    if not creds:
        raise HTTPException(status_code=401, detail="Brak tokenu autoryzacji")
    return _decode(creds.credentials)


def require_role(min_role: str):
    """Returns a Depends that enforces minimum role level."""
    def _dep(user: dict = Depends(get_current_user)):
        if ROLE_RANK.get(user.get("role", ""), -1) < ROLE_RANK.get(min_role, 99):
            raise HTTPException(status_code=403, detail="Brak uprawnień")
        return user
    return Depends(_dep)
