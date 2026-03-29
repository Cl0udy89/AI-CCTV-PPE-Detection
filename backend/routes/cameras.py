"""Camera registry — CRUD for named camera sources."""
import json
import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from core.auth import require_role

CAMERAS_FILE = Path(__file__).parent.parent / "data" / "cameras.json"

router = APIRouter(prefix="/cameras", tags=["cameras"])


def _load() -> list:
    if CAMERAS_FILE.exists():
        try:
            return json.loads(CAMERAS_FILE.read_text(encoding="utf-8"))
        except Exception:
            pass
    return []


def _save(cameras: list):
    CAMERAS_FILE.parent.mkdir(parents=True, exist_ok=True)
    CAMERAS_FILE.write_text(json.dumps(cameras, indent=2, ensure_ascii=False), encoding="utf-8")


class CameraCreate(BaseModel):
    label: str
    source_url: str = ""
    description: str = ""


class CameraUpdate(BaseModel):
    label: Optional[str] = None
    source_url: Optional[str] = None
    description: Optional[str] = None


@router.get("", dependencies=[require_role("viewer")])
def list_cameras():
    return _load()


@router.post("", dependencies=[require_role("admin")])
def create_camera(body: CameraCreate):
    cameras = _load()
    cam = {
        "id": str(uuid.uuid4())[:8],
        "label": body.label.strip(),
        "source_url": body.source_url,
        "description": body.description,
    }
    cameras.append(cam)
    _save(cameras)
    return cam


@router.patch("/{camera_id}", dependencies=[require_role("admin")])
def update_camera(camera_id: str, body: CameraUpdate):
    cameras = _load()
    for cam in cameras:
        if cam["id"] == camera_id:
            if body.label is not None:
                cam["label"] = body.label.strip()
            if body.source_url is not None:
                cam["source_url"] = body.source_url
            if body.description is not None:
                cam["description"] = body.description
            _save(cameras)
            return cam
    raise HTTPException(404, "Camera not found")


@router.delete("/{camera_id}", dependencies=[require_role("admin")])
def delete_camera(camera_id: str):
    cameras = _load()
    new_cameras = [c for c in cameras if c["id"] != camera_id]
    if len(new_cameras) == len(cameras):
        raise HTTPException(404, "Camera not found")
    _save(new_cameras)
    return {"deleted": camera_id}
