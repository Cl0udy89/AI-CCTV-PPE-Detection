"""
Manages video capture sources (webcam index or RTSP URL).
Thread-safe singleton that holds the current OpenCV VideoCapture.
"""
import cv2
import threading
from typing import Optional


class StreamManager:
    def __init__(self):
        self._cap: Optional[cv2.VideoCapture] = None
        self._lock = threading.Lock()
        self._source: Optional[str | int] = None

    @property
    def source(self):
        return self._source

    def open(self, source: str | int, width: int = 1920, height: int = 1080) -> bool:
        """Open a new video source. Closes previous one if open."""
        with self._lock:
            if self._cap and self._cap.isOpened():
                self._cap.release()

            if isinstance(source, str) and source.isdigit():
                source = int(source)

            cap = cv2.VideoCapture(source)
            if not cap.isOpened():
                cap.release()
                return False

            cap.set(cv2.CAP_PROP_FRAME_WIDTH,  width)
            cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)

            actual_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            actual_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            self._resolution = (actual_w, actual_h)

            self._cap = cap
            self._source = source
            return True

    @property
    def resolution(self):
        return getattr(self, '_resolution', None)

    def read(self):
        """Return (success, frame). Thread-safe."""
        with self._lock:
            if self._cap is None or not self._cap.isOpened():
                return False, None
            return self._cap.read()

    def close(self):
        with self._lock:
            if self._cap and self._cap.isOpened():
                self._cap.release()
            self._cap = None
            self._source = None

    def is_open(self) -> bool:
        with self._lock:
            return self._cap is not None and self._cap.isOpened()


stream_manager = StreamManager()
