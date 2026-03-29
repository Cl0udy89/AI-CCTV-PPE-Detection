"""
Alert dispatcher — broadcasts incident events to all SSE listeners.

Called from incident_manager (background thread) via call_soon_threadsafe
so the asyncio event loop is never blocked.
"""
import asyncio
import json
import threading
from typing import AsyncIterator


class AlertDispatcher:
    def __init__(self):
        self._queues: list[asyncio.Queue] = []
        self._lock  = threading.Lock()
        self._loop: asyncio.AbstractEventLoop | None = None

    def set_loop(self, loop: asyncio.AbstractEventLoop):
        self._loop = loop

    # ── called from async FastAPI context ────────────────────────────────────

    def _add(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue()
        with self._lock:
            self._queues.append(q)
        return q

    def _remove(self, q: asyncio.Queue):
        with self._lock:
            try:
                self._queues.remove(q)
            except ValueError:
                pass

    async def stream(self) -> AsyncIterator[str]:
        """Yields SSE-formatted strings; keepalive every 25 s."""
        q = self._add()
        try:
            while True:
                try:
                    data = await asyncio.wait_for(q.get(), timeout=25)
                    yield f"data: {data}\n\n"
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            self._remove(q)

    # ── called from background threads ───────────────────────────────────────

    def broadcast(self, event: dict):
        """Thread-safe broadcast to all connected SSE clients."""
        if self._loop is None or self._loop.is_closed():
            return
        payload = json.dumps(event, default=str)
        with self._lock:
            queues = list(self._queues)
        for q in queues:
            try:
                self._loop.call_soon_threadsafe(q.put_nowait, payload)
            except Exception:
                pass


alert_dispatcher = AlertDispatcher()
