from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from core.alert_dispatcher import alert_dispatcher

router = APIRouter(prefix="/alerts", tags=["alerts"])


@router.get("/stream")
async def stream_alerts():
    return StreamingResponse(
        alert_dispatcher.stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
