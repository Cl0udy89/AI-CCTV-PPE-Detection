"""Authentication routes: login / logout / me / change-password."""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from core.auth import verify_password, create_token, get_current_user
from core.user_manager import get_by_username, get_by_id, update_user, audit

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


class ChangePasswordReq(BaseModel):
    current_password: str
    new_password: str


class UpdateProfileReq(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None


@router.post("/login")
def login(req: LoginRequest):
    user = get_by_username(req.username)
    if not user or not user.get('active'):
        raise HTTPException(status_code=401, detail="Nieprawidlowa nazwa uzytkownika lub haslo")
    if not verify_password(req.password, user['password_hash']):
        raise HTTPException(status_code=401, detail="Nieprawidlowa nazwa uzytkownika lub haslo")
    token = create_token(user['id'], user['username'], user['role'])
    audit(user['id'], user['username'], 'login', '')
    return {
        "token": token,
        "user": {
            "id": user['id'],
            "username": user['username'],
            "full_name": user['full_name'],
            "role": user['role'],
            "language": user.get('language', 'pl'),
            "theme": user.get('theme', 'auto'),
        }
    }


@router.get("/me")
def me(current_user: dict = Depends(get_current_user)):
    user = get_by_id(int(current_user['sub']))
    if not user:
        raise HTTPException(status_code=404, detail="Uzytkownik nie znaleziony")
    return {
        "id": user['id'],
        "username": user['username'],
        "full_name": user['full_name'],
        "email": user['email'],
        "role": user['role'],
        "active": user['active'],
    }


@router.patch("/profile")
def update_profile(req: UpdateProfileReq, current_user: dict = Depends(get_current_user)):
    update_user(int(current_user['sub']), **req.dict(exclude_none=True))
    audit(int(current_user['sub']), current_user['username'], 'update_profile', '')
    return {"ok": True}


@router.post("/change-password")
def change_password(req: ChangePasswordReq, current_user: dict = Depends(get_current_user)):
    user = get_by_id(int(current_user['sub']))
    if not user:
        raise HTTPException(404, "Uzytkownik nie znaleziony")
    if not verify_password(req.current_password, user['password_hash']):
        raise HTTPException(400, "Aktualne haslo jest nieprawidlowe")
    if len(req.new_password) < 4:
        raise HTTPException(400, "Haslo musi miec co najmniej 4 znaki")
    update_user(user['id'], password=req.new_password)
    audit(user['id'], user['username'], 'change_password', '')
    return {"ok": True}
