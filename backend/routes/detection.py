"""
/detection routes — manage which classes are actively detected + confidence/filter settings.
"""
from fastapi import APIRouter
from pydantic import BaseModel

from core.detector import detector, ALL_CLASSES

router = APIRouter(prefix="/detection", tags=["detection"])


@router.get("/classes")
def get_classes():
    return {
        "all": ALL_CLASSES,
        "enabled": list(detector.enabled_classes),
    }


class ClassesRequest(BaseModel):
    enabled: list[str]


@router.post("/classes")
def set_classes(req: ClassesRequest):
    valid = [c for c in req.enabled if c in ALL_CLASSES]
    detector.set_enabled_classes(valid)
    return {"enabled": list(detector.enabled_classes)}


@router.get("/settings")
def get_settings():
    return {
        "confidence":           detector.confidence,
        "violation_confidence": detector.violation_confidence,
        "min_box_area":         detector.min_box_area,
        "ppe_zone_only":        detector.ppe_zone_only,
    }


class SettingsRequest(BaseModel):
    confidence:           float | None = None
    violation_confidence: float | None = None
    min_box_area:         int   | None = None
    ppe_zone_only:        bool  | None = None


@router.post("/settings")
def update_settings(req: SettingsRequest):
    if req.confidence is not None:
        detector.set_confidence(req.confidence)
    if req.violation_confidence is not None:
        detector.set_violation_confidence(req.violation_confidence)
    if req.min_box_area is not None:
        detector.set_min_box_area(req.min_box_area)
    if req.ppe_zone_only is not None:
        detector.ppe_zone_only = req.ppe_zone_only
    return {
        "confidence":           detector.confidence,
        "violation_confidence": detector.violation_confidence,
        "min_box_area":         detector.min_box_area,
        "ppe_zone_only":        detector.ppe_zone_only,
    }
