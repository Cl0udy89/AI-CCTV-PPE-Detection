"""User management + audit log (SQLite: data/app.db)."""
import os, sqlite3
from datetime import datetime
from core.auth import hash_password

DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'app.db')


def _conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    with _conn() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                username     TEXT    UNIQUE NOT NULL,
                full_name    TEXT,
                email        TEXT,
                role         TEXT    NOT NULL DEFAULT 'operator',
                password_hash TEXT   NOT NULL,
                active       INTEGER DEFAULT 1,
                created_at   TEXT    DEFAULT (datetime('now')),
                language     TEXT    DEFAULT 'pl',
                theme        TEXT    DEFAULT 'auto'
            )
        """)
        # Migrate existing tables
        try:
            conn.execute("ALTER TABLE users ADD COLUMN language TEXT DEFAULT 'pl'")
        except Exception:
            pass
        try:
            conn.execute("ALTER TABLE users ADD COLUMN theme TEXT DEFAULT 'auto'")
        except Exception:
            pass
        conn.execute("""
            CREATE TABLE IF NOT EXISTS audit_log (
                id        INTEGER PRIMARY KEY AUTOINCREMENT,
                ts        TEXT DEFAULT (datetime('now')),
                user_id   INTEGER,
                username  TEXT,
                action    TEXT,
                detail    TEXT
            )
        """)
        # Default admin account
        cur = conn.execute("SELECT COUNT(*) FROM users")
        if cur.fetchone()[0] == 0:
            conn.execute(
                "INSERT INTO users (username, full_name, role, password_hash) VALUES (?,?,?,?)",
                ('admin', 'Administrator', 'admin', hash_password('admin123'))
            )
        conn.commit()


def get_by_username(username: str):
    with _conn() as conn:
        row = conn.execute("SELECT * FROM users WHERE username=?", (username,)).fetchone()
        return dict(row) if row else None


def get_by_id(user_id: int):
    with _conn() as conn:
        row = conn.execute("SELECT * FROM users WHERE id=?", (user_id,)).fetchone()
        return dict(row) if row else None


def list_users():
    with _conn() as conn:
        rows = conn.execute(
            "SELECT id,username,full_name,email,role,active,created_at,language,theme FROM users ORDER BY id"
        ).fetchall()
        return [dict(r) for r in rows]


def update_preferences(user_id: int, language: str, theme: str):
    with _conn() as conn:
        conn.execute(
            "UPDATE users SET language=?, theme=? WHERE id=?",
            (language, theme, user_id)
        )
        conn.commit()


def create_user(username: str, full_name: str, email: str, role: str, password: str) -> int:
    with _conn() as conn:
        cur = conn.execute(
            "INSERT INTO users (username,full_name,email,role,password_hash) VALUES (?,?,?,?,?)",
            (username, full_name, email, role, hash_password(password))
        )
        conn.commit()
        return cur.lastrowid


def update_user(user_id: int, **kwargs):
    allowed = {'full_name', 'email', 'role', 'active'}
    fields = {k: v for k, v in kwargs.items() if k in allowed}
    if 'password' in kwargs:
        fields['password_hash'] = hash_password(kwargs['password'])
    if not fields:
        return
    sets = ', '.join(f"{k}=?" for k in fields)
    vals = list(fields.values()) + [user_id]
    with _conn() as conn:
        conn.execute(f"UPDATE users SET {sets} WHERE id=?", vals)
        conn.commit()


def delete_user(user_id: int):
    with _conn() as conn:
        conn.execute("DELETE FROM users WHERE id=?", (user_id,))
        conn.commit()


# Audit log
def audit(user_id: int, username: str, action: str, detail: str = ""):
    with _conn() as conn:
        conn.execute(
            "INSERT INTO audit_log (user_id,username,action,detail) VALUES (?,?,?,?)",
            (user_id, username, action, detail)
        )
        conn.commit()


def list_audit(limit: int = 200):
    with _conn() as conn:
        rows = conn.execute(
            "SELECT * FROM audit_log ORDER BY id DESC LIMIT ?", (limit,)
        ).fetchall()
        return [dict(r) for r in rows]
