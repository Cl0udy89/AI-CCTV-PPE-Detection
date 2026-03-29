"""Corrective actions routes."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from core.auth import require_role
from core.corrective_actions import (
    list_for_incident, create, update, delete, stats_open
)

router = APIRouter(tags=["corrective_actions"])


class CreateActionReq(BaseModel):
    description: str
    assigned_to: Optional[str] = None
    due_date: Optional[str] = None


class UpdateActionReq(BaseModel):
    description: Optional[str] = None
    assigned_to: Optional[str] = None
    due_date: Optional[str] = None
    resolved: Optional[int] = None


@router.get("/incidents/{incident_id}/actions", dependencies=[require_role("viewer")])
def get_actions(incident_id: int):
    return {"actions": list_for_incident(incident_id)}


@router.post("/incidents/{incident_id}/actions", dependencies=[require_role("operator")])
def add_action(incident_id: int, req: CreateActionReq):
    aid = create(incident_id, req.description, req.assigned_to, req.due_date)
    return {"id": aid}


@router.patch("/actions/{action_id}", dependencies=[require_role("operator")])
def edit_action(action_id: int, req: UpdateActionReq):
    update(action_id, **req.dict(exclude_none=True))
    return {"ok": True}


@router.delete("/actions/{action_id}", dependencies=[require_role("operator")])
def remove_action(action_id: int):
    delete(action_id)
    return {"ok": True}


@router.get("/actions/stats", dependencies=[require_role("viewer")])
def actions_stats():
    return {"open": stats_open()}
