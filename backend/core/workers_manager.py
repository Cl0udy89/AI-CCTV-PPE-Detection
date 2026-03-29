"""Workers registry: employees linked to track_ids for compliance scoring."""
import os, sqlite3

DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'app.db')


def _conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with _conn() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS workers (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                name        TEXT NOT NULL,
                badge_id    TEXT UNIQUE,
                department  TEXT,
                active      INTEGER DEFAULT 1,
                created_at  TEXT DEFAULT (datetime('now'))
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS worker_track_links (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                worker_id   INTEGER NOT NULL,
                track_id    INTEGER NOT NULL,
                linked_at   TEXT DEFAULT (datetime('now')),
                UNIQUE(track_id)
            )
        """)
        conn.commit()


def list_workers():
    with _conn() as conn:
        # Join with incident count and violation count
        rows = conn.execute("""
            SELECT w.*,
                   COUNT(DISTINCT wtl.track_id) as linked_tracks
            FROM workers w
            LEFT JOIN worker_track_links wtl ON wtl.worker_id = w.id
            GROUP BY w.id
            ORDER BY w.name
        """).fetchall()
        return [dict(r) for r in rows]


def get_worker(worker_id: int):
    with _conn() as conn:
        row = conn.execute("SELECT * FROM workers WHERE id=?", (worker_id,)).fetchone()
        return dict(row) if row else None


def create_worker(name: str, badge_id: str = None, department: str = None) -> int:
    with _conn() as conn:
        cur = conn.execute(
            "INSERT INTO workers (name,badge_id,department) VALUES (?,?,?)",
            (name, badge_id or None, department or None)
        )
        conn.commit()
        return cur.lastrowid


def update_worker(worker_id: int, **kwargs):
    allowed = {'name', 'badge_id', 'department', 'active'}
    fields = {k: v for k, v in kwargs.items() if k in allowed}
    if not fields:
        return
    sets = ', '.join(f"{k}=?" for k in fields)
    vals = list(fields.values()) + [worker_id]
    with _conn() as conn:
        conn.execute(f"UPDATE workers SET {sets} WHERE id=?", vals)
        conn.commit()


def delete_worker(worker_id: int):
    with _conn() as conn:
        conn.execute("DELETE FROM worker_track_links WHERE worker_id=?", (worker_id,))
        conn.execute("DELETE FROM workers WHERE id=?", (worker_id,))
        conn.commit()


def link_track(worker_id: int, track_id: int):
    with _conn() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO worker_track_links (worker_id,track_id) VALUES (?,?)",
            (worker_id, track_id)
        )
        conn.commit()


def unlink_track(track_id: int):
    with _conn() as conn:
        conn.execute("DELETE FROM worker_track_links WHERE track_id=?", (track_id,))
        conn.commit()


def get_worker_incidents(worker_id: int):
    """Get incidents for a worker via linked track_ids (queries incidents.db)."""
    import sqlite3 as _sq
    inc_db = os.path.join(os.path.dirname(__file__), '..', 'data', 'incidents.db')
    if not os.path.exists(inc_db):
        return []
    with _conn() as conn:
        tids = [r[0] for r in conn.execute(
            "SELECT track_id FROM worker_track_links WHERE worker_id=?", (worker_id,)
        ).fetchall()]
    if not tids:
        return []
    placeholders = ','.join('?' * len(tids))
    iconn = _sq.connect(inc_db)
    iconn.row_factory = _sq.Row
    rows = iconn.execute(
        f"SELECT * FROM incidents WHERE track_id IN ({placeholders}) ORDER BY created_at DESC",
        tids
    ).fetchall()
    iconn.close()
    return [dict(r) for r in rows]


def get_compliance_score(worker_id: int) -> int:
    """Returns 0-100 compliance score (% of days without incidents in last 30 days)."""
    incidents = get_worker_incidents(worker_id)
    if not incidents:
        return 100
    from datetime import datetime, timedelta
    cutoff = (datetime.utcnow() - timedelta(days=30)).strftime('%Y-%m-%d')
    recent = [i for i in incidents if i.get('created_at', '') >= cutoff]
    if not recent:
        return 100
    days_with_incident = len(set(i['created_at'][:10] for i in recent))
    score = max(0, 100 - days_with_incident * 4)
    return score
