"""Shift definitions and per-shift statistics."""
import os, sqlite3
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'app.db')
INC_DB  = os.path.join(os.path.dirname(__file__), '..', 'data', 'incidents.db')


def _conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with _conn() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS shifts (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                name        TEXT NOT NULL,
                start_hour  INTEGER NOT NULL,
                end_hour    INTEGER NOT NULL,
                active      INTEGER DEFAULT 1,
                color       TEXT DEFAULT '#3b82f6'
            )
        """)
        # Seed default shifts
        cur = conn.execute("SELECT COUNT(*) FROM shifts")
        if cur.fetchone()[0] == 0:
            conn.executemany(
                "INSERT INTO shifts (name,start_hour,end_hour,color) VALUES (?,?,?,?)",
                [
                    ('Ranna', 6, 14, '#22c55e'),
                    ('Popołudniowa', 14, 22, '#f97316'),
                    ('Nocna', 22, 6, '#8b5cf6'),
                ]
            )
        conn.commit()


def list_shifts():
    with _conn() as conn:
        rows = conn.execute("SELECT * FROM shifts ORDER BY start_hour").fetchall()
        return [dict(r) for r in rows]


def create_shift(name: str, start_hour: int, end_hour: int, color: str = '#3b82f6') -> int:
    with _conn() as conn:
        cur = conn.execute(
            "INSERT INTO shifts (name,start_hour,end_hour,color) VALUES (?,?,?,?)",
            (name, start_hour, end_hour, color)
        )
        conn.commit()
        return cur.lastrowid


def update_shift(shift_id: int, **kwargs):
    allowed = {'name', 'start_hour', 'end_hour', 'active', 'color'}
    fields = {k: v for k, v in kwargs.items() if k in allowed}
    if not fields:
        return
    sets = ', '.join(f"{k}=?" for k in fields)
    vals = list(fields.values()) + [shift_id]
    with _conn() as conn:
        conn.execute(f"UPDATE shifts SET {sets} WHERE id=?", vals)
        conn.commit()


def delete_shift(shift_id: int):
    with _conn() as conn:
        conn.execute("DELETE FROM shifts WHERE id=?", (shift_id,))
        conn.commit()


def _hour_of(ts_str: str) -> int:
    try:
        return datetime.fromisoformat(ts_str).hour
    except Exception:
        return -1


def stats_by_shift(days: int = 30):
    """Count incidents per shift based on created_at hour."""
    if not os.path.exists(INC_DB):
        return []
    shifts = list_shifts()
    import sqlite3 as _sq
    iconn = _sq.connect(INC_DB)
    iconn.row_factory = _sq.Row
    from datetime import timedelta
    cutoff = (datetime.utcnow() - timedelta(days=days)).isoformat()
    rows = iconn.execute(
        "SELECT created_at FROM incidents WHERE created_at >= ?", (cutoff,)
    ).fetchall()
    iconn.close()

    result = []
    for shift in shifts:
        s, e = shift['start_hour'], shift['end_hour']
        count = 0
        for row in rows:
            h = _hour_of(row['created_at'])
            if s < e:
                if s <= h < e:
                    count += 1
            else:  # overnight (e.g. 22-6)
                if h >= s or h < e:
                    count += 1
        result.append({
            'id': shift['id'],
            'name': shift['name'],
            'start_hour': s,
            'end_hour': e,
            'color': shift['color'],
            'count': count,
        })
    return result
