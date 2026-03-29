"""Workers registry routes."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
from core.auth import require_role
from core.workers_manager import (
    list_workers, get_worker, create_worker, update_worker, delete_worker,
    link_track, unlink_track, get_worker_incidents, get_compliance_score
)

router = APIRouter(prefix="/workers", tags=["workers"])


class CreateWorkerReq(BaseModel):
    name: str
    badge_id: Optional[str] = None
    department: Optional[str] = None


class UpdateWorkerReq(BaseModel):
    name: Optional[str] = None
    badge_id: Optional[str] = None
    department: Optional[str] = None
    active: Optional[int] = None


class LinkTrackReq(BaseModel):
    track_id: int


@router.get("", dependencies=[require_role("operator")])
def get_workers():
    workers = list_workers()
    for w in workers:
        w['compliance_score'] = get_compliance_score(w['id'])
    return {"workers": workers}


@router.post("", dependencies=[require_role("supervisor")])
def add_worker(req: CreateWorkerReq):
    wid = create_worker(req.name, req.badge_id, req.department)
    return {"id": wid}


@router.patch("/{worker_id}", dependencies=[require_role("supervisor")])
def edit_worker(worker_id: int, req: UpdateWorkerReq):
    if not get_worker(worker_id):
        raise HTTPException(404, detail="Pracownik nie znaleziony")
    update_worker(worker_id, **req.dict(exclude_none=True))
    return {"ok": True}


@router.delete("/{worker_id}", dependencies=[require_role("supervisor")])
def remove_worker(worker_id: int):
    if not get_worker(worker_id):
        raise HTTPException(404, detail="Pracownik nie znaleziony")
    delete_worker(worker_id)
    return {"ok": True}


@router.post("/{worker_id}/link", dependencies=[require_role("operator")])
def link_worker_track(worker_id: int, req: LinkTrackReq):
    if not get_worker(worker_id):
        raise HTTPException(404, detail="Pracownik nie znaleziony")
    link_track(worker_id, req.track_id)
    return {"ok": True}


@router.delete("/{worker_id}/unlink/{track_id}", dependencies=[require_role("operator")])
def unlink_worker_track(worker_id: int, track_id: int):
    unlink_track(track_id)
    return {"ok": True}


@router.get("/{worker_id}/incidents", dependencies=[require_role("operator")])
def worker_incidents(worker_id: int):
    if not get_worker(worker_id):
        raise HTTPException(404, detail="Pracownik nie znaleziony")
    incidents = get_worker_incidents(worker_id)
    score = get_compliance_score(worker_id)
    return {"incidents": incidents, "compliance_score": score}
