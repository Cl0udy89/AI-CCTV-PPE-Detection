"""App-level configuration stored in data/app_config.json."""
import json
import os
from pathlib import Path

CONFIG_PATH = Path(__file__).parent.parent / "data" / "app_config.json"

_DEFAULTS = {
    "company_name": "SafeVision",
    "timezone": "Europe/Warsaw",
    "default_language": "pl",
    "setup_done": False,
}


def load_config() -> dict:
    if CONFIG_PATH.exists():
        try:
            data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
            return {**_DEFAULTS, **data}
        except Exception:
            pass
    return dict(_DEFAULTS)


def save_config(cfg: dict):
    CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)
    CONFIG_PATH.write_text(json.dumps(cfg, indent=2, ensure_ascii=False), encoding="utf-8")


def is_setup_done() -> bool:
    return load_config().get("setup_done", False)


def init_config():
    """Ensure config file exists (call on startup)."""
    if not CONFIG_PATH.exists():
        save_config(dict(_DEFAULTS))
