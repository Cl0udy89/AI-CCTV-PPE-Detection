"""
/incidents routes — CRUD for incidents + serving clips/snapshots.
Each incident has both raw and AI-annotated versions.
"""
import csv
import io
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel

from core.auth import require_role
from core.incident_manager import incident_manager

router = APIRouter(prefix="/incidents", tags=["incidents"])


class StatusUpdate(BaseModel):
    status: str


class NotesUpdate(BaseModel):
    notes: str


class BulkRequest(BaseModel):
    ids: list[int]
    action: str          # "status_new" | "status_reviewing" | "status_closed" | "delete"


@router.get("", dependencies=[require_role("viewer")])
def list_incidents(
    status:    str | None = None,
    limit:     int = 50,
    offset:    int = 0,
    date_from: str | None = Query(None),
    date_to:   str | None = Query(None),
    q:         str | None = Query(None),
):
    return {"incidents": incident_manager.list_incidents(
        status, limit, offset, date_from, date_to, q
    )}


@router.get("/export", dependencies=[require_role("viewer")])
def export_csv(
    status:    str | None = None,
    date_from: str | None = Query(None),
    date_to:   str | None = Query(None),
    q:         str | None = Query(None),
):
    incidents = incident_manager.list_incidents(
        status=status, limit=10000, date_from=date_from, date_to=date_to, search=q
    )
    out = io.StringIO()
    fields = ["id", "created_at", "violation_types", "track_id", "status", "zone_name", "notes"]
    w = csv.DictWriter(out, fieldnames=fields)
    w.writeheader()
    for inc in incidents:
        inc["violation_types"] = ", ".join(inc.get("violation_types", []))
        w.writerow({k: inc.get(k, "") for k in fields})
    return Response(
        content=out.getvalue().encode("utf-8-sig"),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=incidents.csv"},
    )


@router.post("/bulk", dependencies=[require_role("operator")])
def bulk_action(req: BulkRequest):
    if not req.ids:
        return {"affected": 0}
    if req.action == "delete":
        n = incident_manager.bulk_delete(req.ids)
        return {"affected": n}
    status_map = {
        "status_new":       "new",
        "status_reviewing": "reviewing",
        "status_closed":    "closed",
    }
    if req.action in status_map:
        n = incident_manager.bulk_update_status(req.ids, status_map[req.action])
        return {"affected": n}
    raise HTTPException(400, f"Unknown action: {req.action}")


@router.get("/{inc_id}", dependencies=[require_role("viewer")])
def get_incident(inc_id: int):
    inc = incident_manager.get_incident(inc_id)
    if not inc:
        raise HTTPException(404, "Incident not found")
    return inc


@router.patch("/{inc_id}", dependencies=[require_role("operator")])
def update_status(inc_id: int, body: StatusUpdate):
    ok = incident_manager.update_status(inc_id, body.status)
    if not ok:
        raise HTTPException(400, f"Invalid status or incident not found: {body.status}")
    return {"status": "ok"}


@router.patch("/{inc_id}/notes", dependencies=[require_role("operator")])
def update_notes(inc_id: int, body: NotesUpdate):
    ok = incident_manager.update_notes(inc_id, body.notes)
    if not ok:
        raise HTTPException(404, "Incident not found")
    return {"status": "ok"}


@router.delete("/{inc_id}", dependencies=[require_role("operator")])
def delete_incident(inc_id: int):
    ok = incident_manager.delete_incident(inc_id)
    if not ok:
        raise HTTPException(404, "Incident not found")
    return {"status": "deleted"}


def _serve_file(inc_id: int, path_key: str, media_type: str):
    inc = incident_manager.get_incident(inc_id)
    if not inc:
        raise HTTPException(404, "Incident not found")
    path = inc.get(path_key)
    if not path or not Path(path).exists():
        raise HTTPException(404, f"{path_key} not yet available")
    return FileResponse(path, media_type=media_type)


@router.get("/{inc_id}/clip", dependencies=[require_role("viewer")])
def get_clip(inc_id: int):
    return _serve_file(inc_id, "clip_path", "video/mp4")


@router.get("/{inc_id}/clip_annotated", dependencies=[require_role("viewer")])
def get_clip_annotated(inc_id: int):
    return _serve_file(inc_id, "clip_annotated_path", "video/mp4")


@router.get("/{inc_id}/snapshot", dependencies=[require_role("viewer")])
def get_snapshot(inc_id: int):
    return _serve_file(inc_id, "snapshot_path", "image/jpeg")


@router.get("/{inc_id}/snapshot_annotated", dependencies=[require_role("viewer")])
def get_snapshot_annotated(inc_id: int):
    return _serve_file(inc_id, "snapshot_annotated_path", "image/jpeg")
