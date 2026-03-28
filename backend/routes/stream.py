"""
/stream routes — MJPEG live feed + source management.
"""
import cv2
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse, Response
from pydantic import BaseModel

from core.detector import detector
from core.stream_manager import stream_manager
from core.zone_manager import zone_manager

router = APIRouter(prefix="/stream", tags=["stream"])


class SourceRequest(BaseModel):
    source: str
    width:  int = 1920
    height: int = 1080


@router.post("/open")
def open_source(req: SourceRequest):
    ok = stream_manager.open(req.source, req.width, req.height)
    if not ok:
        raise HTTPException(400, f"Cannot open source: {req.source}")
    res = stream_manager.resolution or (req.width, req.height)
    return {"status": "ok", "source": str(stream_manager.source), "resolution": res}


@router.get("/resolution")
def get_resolution():
    if not stream_manager.is_open():
        return {"resolution": None}
    return {"resolution": stream_manager.resolution}


@router.post("/close")
def close_source():
    stream_manager.close()
    return {"status": "closed"}


@router.get("/status")
def stream_status():
    return {
        "open": stream_manager.is_open(),
        "source": str(stream_manager.source) if stream_manager.source is not None else None,
    }


def _frame_generator():
    while stream_manager.is_open():
        ok, frame = stream_manager.read()
        if not ok or frame is None:
            break

        annotated, intrusion_zone_ids = detector.detect(frame)
        zone_manager.draw_zones(annotated, intrusion_zone_ids)

        _, buf = cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 80])
        yield (
            b"--frame\r\n"
            b"Content-Type: image/jpeg\r\n\r\n" + buf.tobytes() + b"\r\n"
        )


@router.get("/snapshot")
def snapshot():
    """Return a single JPEG frame (for zone editor background)."""
    if not stream_manager.is_open():
        raise HTTPException(400, "No stream open")
    ok, frame = stream_manager.read()
    if not ok or frame is None:
        raise HTTPException(503, "Could not read frame")
    _, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 85])
    return Response(content=buf.tobytes(), media_type="image/jpeg")


@router.get("/feed")
def video_feed():
    if not stream_manager.is_open():
        raise HTTPException(400, "No stream open. POST /stream/open first.")
    return StreamingResponse(
        _frame_generator(),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )
