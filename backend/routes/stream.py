"""
/stream routes — MJPEG live feed + source management.
"""
import cv2
import threading
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse, Response
from pydantic import BaseModel

from core.auth import require_role
from core.detector import detector
from core.frame_buffer import frame_buffer, annotated_buffer
from core.incident_manager import incident_manager
from core.stream_manager import stream_manager
from core.zone_manager import zone_manager

router = APIRouter(prefix="/stream", tags=["stream"])


class SourceRequest(BaseModel):
    source: str
    width:  int = 1920
    height: int = 1080


@router.get("/cameras", dependencies=[require_role("viewer")])
def list_cameras():
    """Scan camera indices 0-9 and return available ones with names."""
    found = []
    results = {}
    lock = threading.Lock()

    def probe(idx):
        cap = cv2.VideoCapture(idx, cv2.CAP_DSHOW)
        ok = cap.isOpened()
        name = None
        if ok:
            name = cap.getBackendName()
            backend_name = cap.get(cv2.CAP_PROP_BACKEND)
        cap.release()
        with lock:
            results[idx] = {"available": ok, "name": name}

    threads = [threading.Thread(target=probe, args=(i,)) for i in range(10)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=3)

    for idx in range(10):
        info = results.get(idx)
        if info and info["available"]:
            found.append({"index": idx, "label": f"Camera #{idx}"})

    return {"cameras": found}


@router.post("/open", dependencies=[require_role("operator")])
def open_source(req: SourceRequest):
    ok = stream_manager.open(req.source, req.width, req.height)
    if not ok:
        raise HTTPException(400, f"Cannot open source: {req.source}")
    res = stream_manager.resolution or (req.width, req.height)
    return {"status": "ok", "source": str(stream_manager.source), "resolution": res}


@router.get("/resolution", dependencies=[require_role("viewer")])
def get_resolution():
    if not stream_manager.is_open():
        return {"resolution": None}
    return {"resolution": stream_manager.resolution}


@router.post("/close", dependencies=[require_role("operator")])
def close_source():
    stream_manager.close()
    return {"status": "closed"}


@router.get("/status", dependencies=[require_role("viewer")])
def stream_status():
    return {
        "open": stream_manager.is_open(),
        "source": str(stream_manager.source) if stream_manager.source is not None else None,
    }


def _frame_generator():
    import time
    bad = 0
    while stream_manager.is_open():
        ok, frame = stream_manager.read()
        if not ok or frame is None:
            bad += 1
            if bad >= 30:   # ~1 s of consecutive failures → really dead
                break
            time.sleep(0.033)
            continue
        bad = 0

        frame_buffer.push(frame)
        annotated, intrusion_zone_ids, new_incidents = detector.detect(frame)
        zone_manager.draw_zones(annotated, intrusion_zone_ids)
        annotated_buffer.push(annotated)
        for inc in new_incidents:
            incident_manager.trigger(inc, frame_buffer.snapshot(), annotated_buffer.snapshot())
        incident_manager.push_frame(frame, annotated)

        _, buf = cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 80])
        yield (
            b"--frame\r\n"
            b"Content-Type: image/jpeg\r\n\r\n" + buf.tobytes() + b"\r\n"
        )


@router.get("/stats", dependencies=[require_role("viewer")])
def stream_stats():
    """Live detection metrics: FPS, person count, violation count, mute status."""
    s = detector.get_stats()
    return {
        "fps":             s.get("fps", 0.0),
        "person_count":    s.get("person_count", 0),
        "violation_count": s.get("violation_count", 0),
        "muted":           detector.is_muted(),
        "mute_remaining":  detector.mute_remaining(),
        "open":            stream_manager.is_open(),
    }


@router.get("/snapshot", dependencies=[require_role("viewer")])
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
