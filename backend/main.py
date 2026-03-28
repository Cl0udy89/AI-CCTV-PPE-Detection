"""
AI CCTV PPE Detection — FastAPI backend entry point.
Run: uvicorn main:app --reload --host 0.0.0.0 --port 8000
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routes.stream import router as stream_router
from routes.detection import router as detection_router
from routes.zones import router as zones_router

app = FastAPI(title="AI CCTV PPE Detection", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(stream_router)
app.include_router(detection_router)
app.include_router(zones_router)


@app.get("/health")
def health():
    return {"status": "ok"}
