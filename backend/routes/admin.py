"""Admin utility routes: DB backup, system info."""
import os, shutil, tempfile
from datetime import datetime
from fastapi import APIRouter
from fastapi.responses import FileResponse
from core.auth import require_role

router = APIRouter(prefix="/admin", tags=["admin"])

BACKEND_DIR = os.path.dirname(os.path.dirname(__file__))
DATA_DIR    = os.path.join(BACKEND_DIR, 'data')


@router.get("/backup", dependencies=[require_role("admin")])
def download_backup():
    """Create a ZIP of data/ directory and stream it as download."""
    ts = datetime.now().strftime('%Y%m%d_%H%M%S')
    tmp_dir  = tempfile.mkdtemp()
    zip_base = os.path.join(tmp_dir, f"ppe_backup_{ts}")
    zip_path = shutil.make_archive(zip_base, 'zip', DATA_DIR)
    return FileResponse(
        zip_path,
        media_type='application/zip',
        filename=f"ppe_backup_{ts}.zip",
        headers={"Content-Disposition": f"attachment; filename=ppe_backup_{ts}.zip"}
    )


@router.get("/info", dependencies=[require_role("admin")])
def system_info():
    """Return system statistics."""
    import sqlite3
    info = {}
    # incidents.db
    inc_db = os.path.join(DATA_DIR, 'incidents.db')
    if os.path.exists(inc_db):
        conn = sqlite3.connect(inc_db)
        info['incidents_total'] = conn.execute("SELECT COUNT(*) FROM incidents").fetchone()[0]
        info['incidents_db_size_kb'] = round(os.path.getsize(inc_db) / 1024, 1)
        conn.close()
    # app.db
    app_db = os.path.join(DATA_DIR, 'app.db')
    if os.path.exists(app_db):
        conn = sqlite3.connect(app_db)
        info['users_total'] = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        info['workers_total'] = conn.execute("SELECT COUNT(*) FROM workers").fetchone()[0]
        info['app_db_size_kb'] = round(os.path.getsize(app_db) / 1024, 1)
        conn.close()
    # clips
    clips_dir = os.path.join(DATA_DIR, 'clips')
    if os.path.exists(clips_dir):
        files = os.listdir(clips_dir)
        total_size = sum(os.path.getsize(os.path.join(clips_dir, f)) for f in files)
        info['clips_count'] = len(files)
        info['clips_size_mb'] = round(total_size / 1024 / 1024, 1)
    return info
