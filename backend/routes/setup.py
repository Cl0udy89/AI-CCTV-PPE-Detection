"""First-run setup wizard endpoints (no auth required)."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from core.app_config import load_config, save_config, is_setup_done
from core.auth import hash_password
from core.user_manager import update_user, get_by_username

router = APIRouter(prefix="/setup", tags=["setup"])


class SetupInit(BaseModel):
    company_name: str
    timezone: str = "Europe/Warsaw"
    default_language: str = "pl"
    admin_password: str


@router.get("/status")
def setup_status():
    cfg = load_config()
    return {
        "setup_done": cfg.get("setup_done", False),
        "company_name": cfg.get("company_name", "SafeVision"),
    }


@router.post("/init")
def setup_init(body: SetupInit):
    if is_setup_done():
        raise HTTPException(400, "Setup already completed")
    if len(body.admin_password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")

    # Update admin password
    admin = get_by_username("admin")
    if admin:
        update_user(admin["id"], password=body.admin_password)

    cfg = load_config()
    cfg["company_name"] = body.company_name.strip()
    cfg["timezone"] = body.timezone
    cfg["default_language"] = body.default_language
    cfg["setup_done"] = True
    save_config(cfg)

    return {"ok": True}
