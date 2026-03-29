"""
/detection routes — manage which classes are actively detected + confidence/filter settings.
"""
import time
from fastapi import APIRouter
from pydantic import BaseModel

from core.auth import require_role
from core.detector import detector, ALL_CLASSES

router = APIRouter(prefix="/detection", tags=["detection"])


@router.get("/classes", dependencies=[require_role("viewer")])
def get_classes():
    return {
        "all": ALL_CLASSES,
        "enabled": list(detector.enabled_classes),
    }


class ClassesRequest(BaseModel):
    enabled: list[str]


@router.post("/classes", dependencies=[require_role("operator")])
def set_classes(req: ClassesRequest):
    valid = [c for c in req.enabled if c in ALL_CLASSES]
    detector.set_enabled_classes(valid)
    return {"enabled": list(detector.enabled_classes)}


@router.get("/settings", dependencies=[require_role("viewer")])
def get_settings():
    return {
        "confidence":           detector.confidence,
        "violation_confidence": detector.violation_confidence,
        "min_box_area":         detector.min_box_area,
        "ppe_zone_only":        detector.ppe_zone_only,
        "violation_threshold":  detector.violation_threshold,
        "cooldown_seconds":     detector.cooldown_seconds,
        "muted":                detector.is_muted(),
        "mute_remaining":       detector.mute_remaining(),
    }


class SettingsRequest(BaseModel):
    confidence:            float | None = None
    violation_confidence:  float | None = None
    min_box_area:          int   | None = None
    ppe_zone_only:         bool  | None = None
    violation_threshold:   float | None = None
    cooldown_seconds:      int   | None = None


@router.post("/settings", dependencies=[require_role("operator")])
def update_settings(req: SettingsRequest):
    if req.confidence is not None:
        detector.set_confidence(req.confidence)
    if req.violation_confidence is not None:
        detector.set_violation_confidence(req.violation_confidence)
    if req.min_box_area is not None:
        detector.set_min_box_area(req.min_box_area)
    if req.ppe_zone_only is not None:
        detector.set_ppe_zone_only(req.ppe_zone_only)
    if req.violation_threshold is not None:
        detector.set_violation_threshold(req.violation_threshold)
    if req.cooldown_seconds is not None:
        detector.set_cooldown_seconds(req.cooldown_seconds)
    return {
        "confidence":           detector.confidence,
        "violation_confidence": detector.violation_confidence,
        "min_box_area":         detector.min_box_area,
        "ppe_zone_only":        detector.ppe_zone_only,
        "violation_threshold":  detector.violation_threshold,
        "cooldown_seconds":     detector.cooldown_seconds,
    }


class MuteRequest(BaseModel):
    seconds: int = 300


@router.post("/mute", dependencies=[require_role("operator")])
def mute_alerts(req: MuteRequest):
    detector.mute(req.seconds)
    return {"muted": True, "mute_remaining": detector.mute_remaining()}


@router.post("/unmute", dependencies=[require_role("operator")])
def unmute_alerts():
    detector.unmute()
    return {"muted": False}
