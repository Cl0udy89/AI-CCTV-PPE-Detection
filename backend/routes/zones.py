"""
/zones routes — CRUD for polygon zones (async to avoid blocking YOLO inference thread).
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Literal

from core.zone_manager import zone_manager

router = APIRouter(prefix="/zones", tags=["zones"])

ZoneType = Literal["restricted", "ppe_required", "safe"]


class ZoneCreate(BaseModel):
    name: str
    points: list[list[int]]
    zone_type: ZoneType = "restricted"


class ZoneUpdate(BaseModel):
    name: str | None = None
    active: bool | None = None
    zone_type: ZoneType | None = None
    locked: bool | None = None
    points: list[list[int]] | None = None


@router.get("/")
async def list_zones():
    return [z.to_dict() for z in zone_manager.list_zones()]


@router.post("/")
async def create_zone(body: ZoneCreate):
    if len(body.points) < 3:
        raise HTTPException(400, "Strefa musi mieć co najmniej 3 punkty")
    zone = zone_manager.add_zone(body.name, body.points, body.zone_type)
    return zone.to_dict()


@router.patch("/{zone_id}")
async def update_zone(zone_id: str, body: ZoneUpdate):
    kwargs = {k: v for k, v in body.model_dump().items() if v is not None}
    zone = zone_manager.update_zone(zone_id, **kwargs)
    if zone is None:
        raise HTTPException(404, "Strefa nie znaleziona")
    return zone.to_dict()


@router.delete("/{zone_id}")
async def delete_zone(zone_id: str):
    if not zone_manager.remove_zone(zone_id):
        raise HTTPException(404, "Strefa nie znaleziona")
    return {"deleted": zone_id}
