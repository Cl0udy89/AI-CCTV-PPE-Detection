"""Corrective actions: post-incident workflow."""
import os, sqlite3
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'app.db')


def _conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with _conn() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS corrective_actions (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                incident_id  INTEGER NOT NULL,
                description  TEXT NOT NULL,
                assigned_to  TEXT,
                due_date     TEXT,
                resolved     INTEGER DEFAULT 0,
                created_at   TEXT DEFAULT (datetime('now')),
                resolved_at  TEXT
            )
        """)
        conn.commit()


def list_for_incident(incident_id: int):
    with _conn() as conn:
        rows = conn.execute(
            "SELECT * FROM corrective_actions WHERE incident_id=? ORDER BY id",
            (incident_id,)
        ).fetchall()
        return [dict(r) for r in rows]


def create(incident_id: int, description: str, assigned_to: str = None, due_date: str = None) -> int:
    with _conn() as conn:
        cur = conn.execute(
            "INSERT INTO corrective_actions (incident_id,description,assigned_to,due_date) VALUES (?,?,?,?)",
            (incident_id, description, assigned_to or None, due_date or None)
        )
        conn.commit()
        return cur.lastrowid


def update(action_id: int, **kwargs):
    allowed = {'description', 'assigned_to', 'due_date', 'resolved'}
    fields = {k: v for k, v in kwargs.items() if k in allowed}
    if fields.get('resolved') == 1 and 'resolved_at' not in fields:
        fields['resolved_at'] = datetime.utcnow().isoformat()
    if fields.get('resolved') == 0:
        fields['resolved_at'] = None
    if not fields:
        return
    sets = ', '.join(f"{k}=?" for k in fields)
    vals = list(fields.values()) + [action_id]
    with _conn() as conn:
        conn.execute(f"UPDATE corrective_actions SET {sets} WHERE id=?", vals)
        conn.commit()


def delete(action_id: int):
    with _conn() as conn:
        conn.execute("DELETE FROM corrective_actions WHERE id=?", (action_id,))
        conn.commit()


def stats_open():
    """Count of open (unresolved) corrective actions."""
    with _conn() as conn:
        row = conn.execute(
            "SELECT COUNT(*) FROM corrective_actions WHERE resolved=0"
        ).fetchone()
        return row[0] if row else 0
