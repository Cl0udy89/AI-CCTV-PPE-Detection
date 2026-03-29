"""
AI CCTV PPE Detection — FastAPI backend entry point.
Run: uvicorn main:app --reload --host 0.0.0.0 --port 8000
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routes.stream import router as stream_router
from routes.detection import router as detection_router
from routes.zones import router as zones_router
from routes.incidents import router as incidents_router
from routes.stats import router as stats_router
from routes.alerts import router as alerts_router
from routes.auth import router as auth_router
from routes.users import router as users_router
from routes.workers import router as workers_router
from routes.shifts import router as shifts_router
from routes.notifications import router as notifications_router
from routes.reports import router as reports_router
from routes.corrective_actions import router as actions_router
from routes.admin import router as admin_router
from routes.setup import router as setup_router
from routes.cameras import router as cameras_router

app = FastAPI(title="AI CCTV PPE Detection", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(stream_router)
app.include_router(detection_router)
app.include_router(zones_router)
app.include_router(incidents_router)
app.include_router(stats_router)
app.include_router(alerts_router)
app.include_router(auth_router)
app.include_router(users_router)
app.include_router(workers_router)
app.include_router(shifts_router)
app.include_router(notifications_router)
app.include_router(reports_router)
app.include_router(actions_router)
app.include_router(admin_router)
app.include_router(setup_router)
app.include_router(cameras_router)


@app.on_event("startup")
async def _startup():
    import asyncio
    from core.alert_dispatcher import alert_dispatcher
    alert_dispatcher.set_loop(asyncio.get_event_loop())

    # Initialize new databases
    from core.user_manager import init_db as init_users
    from core.workers_manager import init_db as init_workers
    from core.shift_manager import init_db as init_shifts
    init_users()
    init_workers()
    init_shifts()

    from core.corrective_actions import init_db as init_actions
    init_actions()

    from core.app_config import init_config
    init_config()


@app.get("/health")
def health():
    return {"status": "ok"}
