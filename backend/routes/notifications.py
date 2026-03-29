"""Notification configuration routes."""
from fastapi import APIRouter
from pydantic import BaseModel
from typing import List, Optional
from core.auth import require_role
from core.notifications_manager import load, save, send_email, send_slack, send_teams

router = APIRouter(prefix="/notifications", tags=["notifications"])


class NotifConfig(BaseModel):
    email_enabled: Optional[bool] = None
    smtp_host: Optional[str] = None
    smtp_port: Optional[int] = None
    smtp_user: Optional[str] = None
    smtp_password: Optional[str] = None
    smtp_from: Optional[str] = None
    email_recipients: Optional[List[str]] = None
    slack_enabled: Optional[bool] = None
    slack_webhook_url: Optional[str] = None
    teams_enabled: Optional[bool] = None
    teams_webhook_url: Optional[str] = None
    notify_on_new_incident: Optional[bool] = None
    daily_digest_enabled: Optional[bool] = None
    daily_digest_hour: Optional[int] = None


@router.get("", dependencies=[require_role("admin")])
def get_config():
    cfg = load()
    # Mask password in response
    safe = dict(cfg)
    if safe.get('smtp_password'):
        safe['smtp_password'] = '***'
    return {"config": safe}


@router.patch("", dependencies=[require_role("admin")])
def update_config(req: NotifConfig):
    cfg = load()
    updates = req.dict(exclude_none=True)
    cfg.update(updates)
    save(cfg)
    return {"ok": True}


@router.post("/test-email", dependencies=[require_role("admin")])
def test_email():
    cfg = load()
    result = send_email(
        subject="[PPE System] Test powiadomienia email",
        body="<p>Test powiadomienia email z systemu AI CCTV PPE Detection.</p>",
        cfg=cfg
    )
    return {"result": result}


@router.post("/test-slack", dependencies=[require_role("admin")])
def test_slack():
    cfg = load()
    result = send_slack(":white_check_mark: Test powiadomienia Slack z AI CCTV PPE Detection", cfg)
    return {"result": result}


@router.post("/test-teams", dependencies=[require_role("admin")])
def test_teams():
    cfg = load()
    result = send_teams("✅ Test powiadomienia MS Teams z AI CCTV PPE Detection", cfg)
    return {"result": result}
