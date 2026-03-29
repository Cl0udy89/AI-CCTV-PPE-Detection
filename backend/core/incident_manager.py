"""
Incident manager — persists PPE violation events to SQLite and records MP4 clips.

Each incident stores:
  - raw clip      (no overlays)         → incident_{id}_{ts}_raw.mp4
  - annotated clip (AI + zone overlays) → incident_{id}_{ts}_ai.mp4
  - raw snapshot                        → incident_{id}_{ts}_raw.jpg
  - annotated snapshot                  → incident_{id}_{ts}_ai.jpg
"""
import json
import sqlite3
import threading
import time
from collections import deque
from datetime import datetime
from pathlib import Path

import cv2
import numpy as np

DB_PATH    = Path(__file__).parent.parent / "data" / "incidents.db"
CLIPS_DIR  = Path(__file__).parent.parent / "data" / "clips"
POST_FRAMES = 60   # frames to record after the trigger (~2 s @ 30 fps)


def _ensure_dirs():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    CLIPS_DIR.mkdir(parents=True, exist_ok=True)


def _get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def _init_db():
    _ensure_dirs()
    with _get_conn() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS incidents (
                id                   INTEGER PRIMARY KEY AUTOINCREMENT,
                created_at           TEXT    NOT NULL,
                violation_types      TEXT    NOT NULL,
                track_id             INTEGER NOT NULL,
                clip_path            TEXT,
                clip_annotated_path  TEXT,
                snapshot_path        TEXT,
                snapshot_annotated_path TEXT,
                status               TEXT    NOT NULL DEFAULT 'new',
                zone_id              TEXT,
                zone_name            TEXT
            )
        """)
        # migrate old DB without new columns
        cols = [r[1] for r in conn.execute("PRAGMA table_info(incidents)").fetchall()]
        for col, typ in [
            ("clip_annotated_path",     "TEXT"),
            ("snapshot_annotated_path", "TEXT"),
            ("notes",                   "TEXT"),
        ]:
            if col not in cols:
                conn.execute(f"ALTER TABLE incidents ADD COLUMN {col} {typ}")
        conn.commit()


def _write_clip(frames: list, path: str, fps: int = 20) -> bool:
    """
    Write frames to a browser-playable H.264 MP4 (moov atom at front = faststart).

    Strategy (in order):
    1. imageio + imageio-ffmpeg  — bundled ffmpeg, always faststart
    2. OpenCV FFMPEG backend + OPENCV_FFMPEG_WRITER_OPTIONS=movflags;+faststart
    3. OpenCV MSMF backend (Windows)  — H.264 without explicit faststart
    4. OpenCV any backend + mp4v      — last resort, may not play in all browsers
    """
    if not frames:
        return False
    h, w = frames[0].shape[:2]

    # ── 1. imageio (bundled ffmpeg) ──────────────────────────────────────────
    try:
        import imageio  # type: ignore
        with imageio.get_writer(
            path, fps=fps, codec="libx264",
            output_params=["-movflags", "+faststart", "-preset", "fast", "-crf", "28"],
        ) as wr:
            for f in frames:
                wr.append_data(cv2.cvtColor(f, cv2.COLOR_BGR2RGB))
        if Path(path).exists() and Path(path).stat().st_size > 500:
            return True
    except Exception:
        pass

    # ── 2. OpenCV FFMPEG backend + faststart env var ─────────────────────────
    import os
    _prev = os.environ.get("OPENCV_FFMPEG_WRITER_OPTIONS")
    try:
        os.environ["OPENCV_FFMPEG_WRITER_OPTIONS"] = "movflags;+faststart"
        for fourcc_str in ("avc1", "mp4v"):
            try:
                fourcc = cv2.VideoWriter_fourcc(*fourcc_str)
                wr = cv2.VideoWriter(path, cv2.CAP_FFMPEG, fourcc, fps, (w, h))
                if wr.isOpened():
                    for f in frames:
                        wr.write(f)
                    wr.release()
                    if Path(path).exists() and Path(path).stat().st_size > 500:
                        return True
                else:
                    wr.release()
            except Exception:
                pass
    finally:
        if _prev is None:
            os.environ.pop("OPENCV_FFMPEG_WRITER_OPTIONS", None)
        else:
            os.environ["OPENCV_FFMPEG_WRITER_OPTIONS"] = _prev

    # ── 3. Windows MSMF + H.264 ──────────────────────────────────────────────
    import platform
    if platform.system() == "Windows":
        msmf = getattr(cv2, "CAP_MSMF", 1400)
        for fourcc_str in ("avc1", "H264"):
            try:
                fourcc = cv2.VideoWriter_fourcc(*fourcc_str)
                wr = cv2.VideoWriter(path, msmf, fourcc, fps, (w, h))
                if wr.isOpened():
                    for f in frames:
                        wr.write(f)
                    wr.release()
                    if Path(path).exists() and Path(path).stat().st_size > 500:
                        return True
                else:
                    wr.release()
            except Exception:
                pass

    # ── 4. Plain mp4v fallback ───────────────────────────────────────────────
    try:
        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        wr = cv2.VideoWriter(path, cv2.CAP_ANY, fourcc, fps, (w, h))
        if wr.isOpened():
            for f in frames:
                wr.write(f)
            wr.release()
            return Path(path).exists() and Path(path).stat().st_size > 500
        wr.release()
    except Exception:
        pass

    return False


class IncidentManager:
    def __init__(self):
        _init_db()
        self._lock = threading.Lock()
        # pending post-event recorders:
        # {inc_id: {"raw": deque, "ann": deque, "remaining": int}}
        self._pending: dict[int, dict] = {}

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def trigger(self, inc: dict,
                pre_raw: list[np.ndarray],
                pre_annotated: list[np.ndarray]) -> int:
        """
        Called when a new violation is detected.
        inc = {track_id, violations: set[str], zone_id?, zone_name?}
        pre_raw      = snapshot from frame_buffer (last ~2 s raw frames)
        pre_annotated = snapshot from annotated_buffer
        Returns the new incident id.
        """
        ts     = datetime.utcnow()
        ts_str = ts.strftime("%Y%m%d_%H%M%S")
        viol   = list(inc.get("violations", []))
        tid    = inc.get("track_id", 0)

        # Insert DB row to get ID
        with _get_conn() as conn:
            cur = conn.execute(
                """INSERT INTO incidents
                       (created_at, violation_types, track_id, status, zone_id, zone_name)
                   VALUES (?,?,?,?,?,?)""",
                (
                    ts.isoformat(),
                    json.dumps(viol),
                    tid,
                    "new",
                    inc.get("zone_id"),
                    inc.get("zone_name"),
                ),
            )
            inc_id = cur.lastrowid
            conn.commit()

        from core.alert_dispatcher import alert_dispatcher
        alert_dispatcher.broadcast({
            "type": "new_incident",
            "id": inc_id,
            "violations": viol,
            "zone_name": inc.get("zone_name"),
            "zone_id": inc.get("zone_id"),
            "created_at": ts.isoformat(),
            "track_id": tid,
        })

        base    = str(CLIPS_DIR / f"incident_{inc_id}_{ts_str}")
        raw_mp4 = base + "_raw.mp4"
        ann_mp4 = base + "_ai.mp4"
        raw_jpg = base + "_raw.jpg"
        ann_jpg = base + "_ai.jpg"

        # Save snapshots from the most-recent pre-frame
        if pre_raw:
            cv2.imwrite(raw_jpg, pre_raw[-1])
        else:
            raw_jpg = None

        if pre_annotated:
            cv2.imwrite(ann_jpg, pre_annotated[-1])
        else:
            ann_jpg = None

        # Start background recording thread
        threading.Thread(
            target=self._record_clip,
            args=(inc_id, pre_raw, pre_annotated, raw_mp4, ann_mp4, raw_jpg, ann_jpg),
            daemon=True,
        ).start()

        return inc_id

    def push_frame(self, raw_frame: np.ndarray, annotated_frame: np.ndarray):
        """Feed ongoing post-event recorders with each new frame pair."""
        with self._lock:
            done = []
            for inc_id, rec in self._pending.items():
                rec["raw"].append(raw_frame.copy())
                rec["ann"].append(annotated_frame.copy())
                rec["remaining"] -= 1
                if rec["remaining"] <= 0:
                    done.append(inc_id)
            for inc_id in done:
                del self._pending[inc_id]

    # ------------------------------------------------------------------
    # CRUD helpers
    # ------------------------------------------------------------------

    def list_incidents(self, status: str | None = None,
                       limit: int = 50, offset: int = 0,
                       date_from: str | None = None,
                       date_to: str | None = None,
                       search: str | None = None) -> list[dict]:
        conditions: list[str] = []
        params: list = []
        if status:
            conditions.append("status=?")
            params.append(status)
        if date_from:
            conditions.append("created_at >= ?")
            params.append(date_from)
        if date_to:
            # include whole day
            conditions.append("created_at < date(?, '+1 day')")
            params.append(date_to)
        if search:
            conditions.append("(zone_name LIKE ? OR CAST(track_id AS TEXT) LIKE ? OR violation_types LIKE ?)")
            like = f"%{search}%"
            params += [like, like, like]
        q = "SELECT * FROM incidents"
        if conditions:
            q += " WHERE " + " AND ".join(conditions)
        q += " ORDER BY id DESC LIMIT ? OFFSET ?"
        params += [limit, offset]
        with _get_conn() as conn:
            rows = conn.execute(q, params).fetchall()
        return [self._row_to_dict(r) for r in rows]

    def get_incident(self, inc_id: int) -> dict | None:
        with _get_conn() as conn:
            row = conn.execute(
                "SELECT * FROM incidents WHERE id=?", (inc_id,)
            ).fetchone()
        return self._row_to_dict(row) if row else None

    def update_status(self, inc_id: int, status: str) -> bool:
        if status not in ("new", "reviewing", "closed"):
            return False
        with _get_conn() as conn:
            n = conn.execute(
                "UPDATE incidents SET status=? WHERE id=?", (status, inc_id)
            ).rowcount
            conn.commit()
        return n > 0

    def update_notes(self, inc_id: int, notes: str) -> bool:
        with _get_conn() as conn:
            n = conn.execute(
                "UPDATE incidents SET notes=? WHERE id=?", (notes, inc_id)
            ).rowcount
            conn.commit()
        return n > 0

    def bulk_update_status(self, ids: list[int], status: str) -> int:
        if status not in ("new", "reviewing", "closed"):
            return 0
        placeholders = ",".join("?" * len(ids))
        with _get_conn() as conn:
            n = conn.execute(
                f"UPDATE incidents SET status=? WHERE id IN ({placeholders})",
                [status] + ids,
            ).rowcount
            conn.commit()
        return n

    def bulk_delete(self, ids: list[int]) -> int:
        count = 0
        for inc_id in ids:
            if self.delete_incident(inc_id):
                count += 1
        return count

    def delete_incident(self, inc_id: int) -> bool:
        inc = self.get_incident(inc_id)
        if not inc:
            return False
        for key in ("clip_path", "clip_annotated_path", "snapshot_path", "snapshot_annotated_path"):
            p = inc.get(key)
            if p:
                try:
                    Path(p).unlink(missing_ok=True)
                except Exception:
                    pass
        with _get_conn() as conn:
            conn.execute("DELETE FROM incidents WHERE id=?", (inc_id,))
            conn.commit()
        return True

    def stats_summary(self) -> dict:
        today = datetime.utcnow().date().isoformat()
        with _get_conn() as conn:
            total     = conn.execute("SELECT COUNT(*) FROM incidents").fetchone()[0]
            new_c     = conn.execute("SELECT COUNT(*) FROM incidents WHERE status='new'").fetchone()[0]
            reviewing = conn.execute("SELECT COUNT(*) FROM incidents WHERE status='reviewing'").fetchone()[0]
            closed    = conn.execute("SELECT COUNT(*) FROM incidents WHERE status='closed'").fetchone()[0]
            today_c   = conn.execute(
                "SELECT COUNT(*) FROM incidents WHERE created_at LIKE ?", (f"{today}%",)
            ).fetchone()[0]
        return {"total": total, "new": new_c, "reviewing": reviewing,
                "closed": closed, "today": today_c}

    def stats_timeline(self, days: int = 30) -> list[dict]:
        with _get_conn() as conn:
            rows = conn.execute(
                """SELECT substr(created_at,1,10) AS date, COUNT(*) AS count
                   FROM incidents
                   WHERE created_at >= date('now', ?)
                   GROUP BY date ORDER BY date""",
                (f"-{days} days",),
            ).fetchall()
        return [{"date": r["date"], "count": r["count"]} for r in rows]

    def stats_by_type(self) -> list[dict]:
        with _get_conn() as conn:
            rows = conn.execute("SELECT violation_types FROM incidents").fetchall()
        counts: dict[str, int] = {}
        for r in rows:
            for vt in json.loads(r["violation_types"]):
                counts[vt] = counts.get(vt, 0) + 1
        return [{"type": k, "count": v} for k, v in
                sorted(counts.items(), key=lambda x: -x[1])]

    def stats_hourly(self, days: int = 7) -> list[dict]:
        """Returns incident count grouped by hour-of-day for the last N days."""
        with _get_conn() as conn:
            rows = conn.execute(
                """SELECT CAST(substr(created_at, 12, 2) AS INTEGER) AS hour, COUNT(*) AS count
                   FROM incidents
                   WHERE created_at >= date('now', ?)
                   GROUP BY hour ORDER BY hour""",
                (f"-{days} days",),
            ).fetchall()
        counts = {r["hour"]: r["count"] for r in rows}
        return [{"hour": h, "count": counts.get(h, 0)} for h in range(24)]

    def stats_resolution_rate(self) -> dict:
        """% of incidents that are closed, reviewing, or still new."""
        s = self.stats_summary()
        total = s["total"]
        return {
            "total":    total,
            "closed":   s["closed"],
            "reviewing": s["reviewing"],
            "new":      s["new"],
            "closed_pct":    round(100 * s["closed"]    / total, 1) if total else 0,
            "reviewing_pct": round(100 * s["reviewing"] / total, 1) if total else 0,
            "new_pct":       round(100 * s["new"]       / total, 1) if total else 0,
        }

    def stats_by_zone(self) -> list[dict]:
        with _get_conn() as conn:
            rows = conn.execute(
                """SELECT COALESCE(NULLIF(zone_name,''), 'Brak strefy') AS zone, COUNT(*) AS count
                   FROM incidents
                   GROUP BY zone ORDER BY count DESC""",
            ).fetchall()
        return [{"zone": r["zone"], "count": r["count"]} for r in rows]

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _record_clip(self, inc_id: int,
                     pre_raw: list[np.ndarray],
                     pre_annotated: list[np.ndarray],
                     raw_mp4: str, ann_mp4: str,
                     raw_jpg: str | None, ann_jpg: str | None):
        """Background thread: collect post-event frames, write both MP4s."""
        raw_buf: deque[np.ndarray] = deque(maxlen=POST_FRAMES)
        ann_buf: deque[np.ndarray] = deque(maxlen=POST_FRAMES)

        with self._lock:
            self._pending[inc_id] = {
                "raw": raw_buf,
                "ann": ann_buf,
                "remaining": POST_FRAMES,
            }

        # Wait until post recording completes (max ~12 s)
        deadline = time.time() + 12
        while time.time() < deadline:
            with self._lock:
                if inc_id not in self._pending:
                    break
            time.sleep(0.1)

        with self._lock:
            post_raw = list(raw_buf)
            post_ann = list(ann_buf)
            self._pending.pop(inc_id, None)

        all_raw = pre_raw + post_raw
        all_ann = pre_annotated + post_ann

        paths_updated = {}

        def _write(frames, path):
            # normalise frame sizes to the first frame's dimensions
            if not frames:
                return
            h, w = frames[0].shape[:2]
            normed = []
            for f in frames:
                normed.append(cv2.resize(f, (w, h)) if (f.shape[1] != w or f.shape[0] != h) else f)
            if _write_clip(normed, path):
                paths_updated[path] = True

        _write(all_raw, raw_mp4)
        _write(all_ann, ann_mp4)

        with _get_conn() as conn:
            conn.execute(
                """UPDATE incidents SET
                     clip_path=?,
                     clip_annotated_path=?,
                     snapshot_path=?,
                     snapshot_annotated_path=?
                   WHERE id=?""",
                (
                    raw_mp4 if paths_updated.get(raw_mp4) else None,
                    ann_mp4 if paths_updated.get(ann_mp4) else None,
                    raw_jpg,
                    ann_jpg,
                    inc_id,
                ),
            )
            conn.commit()

    @staticmethod
    def _row_to_dict(row) -> dict:
        if row is None:
            return {}
        d = dict(row)
        d["violation_types"] = json.loads(d.get("violation_types") or "[]")
        return d


incident_manager = IncidentManager()
