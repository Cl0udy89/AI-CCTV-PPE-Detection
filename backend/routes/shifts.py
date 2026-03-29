"""Shift management routes."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from core.auth import require_role
from core.shift_manager import (
    list_shifts, create_shift, update_shift, delete_shift, stats_by_shift
)

router = APIRouter(prefix="/shifts", tags=["shifts"])


class CreateShiftReq(BaseModel):
    name: str
    start_hour: int
    end_hour: int
    color: str = '#3b82f6'


class UpdateShiftReq(BaseModel):
    name: Optional[str] = None
    start_hour: Optional[int] = None
    end_hour: Optional[int] = None
    active: Optional[int] = None
    color: Optional[str] = None


@router.get("", dependencies=[require_role("viewer")])
def get_shifts():
    return {"shifts": list_shifts()}


@router.get("/stats", dependencies=[require_role("viewer")])
def get_shift_stats(days: int = 30):
    return {"stats": stats_by_shift(days)}


@router.post("", dependencies=[require_role("admin")])
def add_shift(req: CreateShiftReq):
    sid = create_shift(req.name, req.start_hour, req.end_hour, req.color)
    return {"id": sid}


@router.patch("/{shift_id}", dependencies=[require_role("admin")])
def edit_shift(shift_id: int, req: UpdateShiftReq):
    update_shift(shift_id, **req.dict(exclude_none=True))
    return {"ok": True}


@router.delete("/{shift_id}", dependencies=[require_role("admin")])
def remove_shift(shift_id: int):
    delete_shift(shift_id)
    return {"ok": True}
