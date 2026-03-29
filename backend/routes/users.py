"""User management and audit log (admin only)."""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from core.auth import require_role, get_current_user
from core.user_manager import (
    list_users, get_by_id, create_user, update_user, delete_user,
    list_audit, audit, update_preferences
)

router = APIRouter(prefix="/users", tags=["users"])

ROLES = ['admin', 'supervisor', 'operator', 'viewer']


class CreateUserReq(BaseModel):
    username: str
    full_name: str = ""
    email: str = ""
    role: str = "operator"
    password: str


class UpdateUserReq(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None
    active: Optional[int] = None
    password: Optional[str] = None


class PreferencesReq(BaseModel):
    language: Optional[str] = None
    theme: Optional[str] = None


@router.get("", dependencies=[require_role("admin")])
def get_users():
    return {"users": list_users()}


# NOTE: static sub-paths must be declared BEFORE /{user_id} to avoid route conflicts
@router.get("/audit-log", dependencies=[require_role("admin")])
def get_audit_log(limit: int = 200):
    return {"log": list_audit(limit)}


@router.patch("/me/preferences")
def update_my_preferences(req: PreferencesReq, current_user: dict = Depends(get_current_user)):
    user_id = int(current_user["sub"])
    user = get_by_id(user_id)
    if not user:
        raise HTTPException(404, detail="Uzytkownik nie znaleziony")
    lang = req.language if req.language in ("pl", "en") else user.get("language", "pl")
    theme = req.theme if req.theme in ("auto", "light", "dark") else user.get("theme", "auto")
    update_preferences(user_id, lang, theme)
    return {"ok": True, "language": lang, "theme": theme}


@router.post("", dependencies=[require_role("admin")])
def add_user(req: CreateUserReq):
    if req.role not in ROLES:
        raise HTTPException(400, detail=f"Nieprawidlowa rola. Dostepne: {ROLES}")
    uid = create_user(req.username, req.full_name, req.email, req.role, req.password)
    audit(0, 'admin', 'create_user', f"user={req.username} role={req.role}")
    return {"id": uid}


@router.patch("/{user_id}", dependencies=[require_role("admin")])
def edit_user(user_id: int, req: UpdateUserReq):
    user = get_by_id(user_id)
    if not user:
        raise HTTPException(404, detail="Uzytkownik nie znaleziony")
    kwargs = req.dict(exclude_none=True)
    if 'role' in kwargs and kwargs['role'] not in ROLES:
        raise HTTPException(400, detail="Nieprawidlowa rola")
    update_user(user_id, **kwargs)
    audit(0, 'admin', 'update_user', f"user_id={user_id} fields={list(kwargs.keys())}")
    return {"ok": True}


@router.delete("/{user_id}", dependencies=[require_role("admin")])
def remove_user(user_id: int):
    user = get_by_id(user_id)
    if not user:
        raise HTTPException(404, detail="Uzytkownik nie znaleziony")
    delete_user(user_id)
    audit(0, 'admin', 'delete_user', f"user_id={user_id} username={user['username']}")
    return {"ok": True}
