"""
Circular frame buffers — keeps the last ~60 raw frames (≈2 s @ 30 fps) and
a parallel buffer of annotated frames (with AI overlays + zone drawings).
Thread-safe; used by incident_manager to capture pre-event footage.
"""
import threading
import numpy as np
from collections import deque

BUFFER_SIZE = 60  # frames (~2 s @ 30 fps)


class FrameBuffer:
    def __init__(self, maxlen: int = BUFFER_SIZE):
        self._buf: deque[np.ndarray] = deque(maxlen=maxlen)
        self._lock = threading.Lock()

    def push(self, frame: np.ndarray) -> None:
        with self._lock:
            self._buf.append(frame.copy())

    def snapshot(self) -> list[np.ndarray]:
        """Return a list copy of the current buffer contents."""
        with self._lock:
            return list(self._buf)


# Raw frames (no overlays)
frame_buffer = FrameBuffer()

# Annotated frames (AI bboxes + zone overlays drawn on top)
annotated_buffer = FrameBuffer()
