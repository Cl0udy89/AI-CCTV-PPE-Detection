"""
Reset all persisted data for a fresh production deploy.

Usage:
    python reset_db.py

WARNING: This deletes ALL data including incidents, users, zones, and config.
Only run before first production deploy or when you want a clean slate.
"""
import os
import shutil
from pathlib import Path

DATA_DIR = Path(__file__).parent / "data"

FILES_TO_DELETE = [
    "incidents.db",
    "app.db",
    "app_config.json",
    "zones.json",
    "settings.json",
    "cameras.json",
]

DIRS_TO_CLEAR = [
    "clips",
    "snapshots",
]


def main():
    if not DATA_DIR.exists():
        print(f"[reset_db] data/ directory not found at {DATA_DIR} — nothing to do.")
        return

    print("=" * 50)
    print("SafeVision PPE — Database Reset")
    print("=" * 50)

    for fname in FILES_TO_DELETE:
        fpath = DATA_DIR / fname
        if fpath.exists():
            fpath.unlink()
            print(f"  Deleted: {fpath.name}")
        else:
            print(f"  Not found (skip): {fpath.name}")

    for dname in DIRS_TO_CLEAR:
        dpath = DATA_DIR / dname
        if dpath.exists():
            shutil.rmtree(dpath)
            print(f"  Cleared dir: {dname}/")

    # Re-create empty directories
    for dname in DIRS_TO_CLEAR:
        (DATA_DIR / dname).mkdir(parents=True, exist_ok=True)
        print(f"  Re-created: {dname}/")

    print()
    print("Done. Start the backend to complete initialization.")
    print("The setup wizard will run on first browser visit.")


if __name__ == "__main__":
    main()
