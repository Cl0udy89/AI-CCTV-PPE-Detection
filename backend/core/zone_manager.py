"""
Zone manager — polygon zones with file persistence and zone types.

Zone types:
  "restricted"   — no entry. Any person inside = alert.
  "ppe_required" — PPE must be worn. Person inside WITHOUT PPE = alert.
  "safe"         — informational only, no alerts.
"""
import json
import threading
from dataclasses import dataclass, field, asdict
from pathlib import Path
from typing import List, Tuple

import cv2
import numpy as np

ZONES_FILE = Path(__file__).parent.parent / "data" / "zones.json"


@dataclass
class Zone:
    id: str
    name: str
    points: List[Tuple[int, int]]
    zone_type: str = "restricted"   # "restricted" | "ppe_required" | "safe"
    active: bool = True
    locked: bool = False

    # colors per type (BGR)
    _COLORS = {
        "restricted":   (0,  80, 255),   # orange-red
        "ppe_required": (0, 180, 255),   # amber
        "safe":         (80, 180,  50),  # green
    }

    @property
    def color(self):
        return self._COLORS.get(self.zone_type, (180, 180, 180))

    def contains_box(self, x1: int, y1: int, x2: int, y2: int) -> bool:
        """
        Check if any key point of the bounding box is inside this polygon.
        Tests feet (bottom row) + body center to catch partial zone entry.
        """
        if len(self.points) < 3:
            return False
        poly = np.array(self.points, dtype=np.float32)
        cx = (x1 + x2) // 2
        cy = (y1 + y2) // 2
        # Test: bottom-center (feet), bottom-left, bottom-right, body center
        test_points = [
            (cx,       y2),           # bottom center — feet
            (x1 + (x2-x1)//4, y2),   # bottom left-quarter
            (x2 - (x2-x1)//4, y2),   # bottom right-quarter
            (cx,       cy),           # body center
        ]
        return any(
            cv2.pointPolygonTest(poly, (float(px), float(py)), False) >= 0
            for px, py in test_points
        )

    def to_dict(self):
        return {
            "id":        self.id,
            "name":      self.name,
            "points":    self.points,
            "zone_type": self.zone_type,
            "active":    self.active,
            "locked":    self.locked,
        }


class ZoneManager:
    def __init__(self):
        self._zones: dict[str, Zone] = {}
        self._lock = threading.Lock()
        self._counter = 0
        self._load()

    # ------------------------------------------------------------------ I/O

    def _load(self):
        if ZONES_FILE.exists():
            try:
                data = json.loads(ZONES_FILE.read_text(encoding="utf-8"))
                for d in data:
                    z = Zone(
                        id=d["id"], name=d["name"],
                        points=[tuple(p) for p in d["points"]],
                        zone_type=d.get("zone_type", "restricted"),
                        active=d.get("active", True),
                        locked=d.get("locked", False),
                    )
                    self._zones[z.id] = z
                    # keep counter above existing ids
                    try:
                        n = int(z.id.split("_")[1])
                        self._counter = max(self._counter, n)
                    except Exception:
                        pass
            except Exception as e:
                print(f"[ZoneManager] failed to load zones: {e}")

    def _save(self):
        ZONES_FILE.parent.mkdir(parents=True, exist_ok=True)
        ZONES_FILE.write_text(
            json.dumps([z.to_dict() for z in self._zones.values()], indent=2),
            encoding="utf-8",
        )

    # ----------------------------------------------------------------- CRUD

    def add_zone(self, name: str, points: list, zone_type: str = "restricted") -> Zone:
        with self._lock:
            self._counter += 1
            zid = f"zone_{self._counter}"
            zone = Zone(id=zid, name=name,
                        points=[list(p) for p in points],
                        zone_type=zone_type)
            self._zones[zid] = zone
            self._save()
            return zone

    def remove_zone(self, zone_id: str) -> bool:
        with self._lock:
            if zone_id not in self._zones:
                return False
            del self._zones[zone_id]
            self._save()
            return True

    def update_zone(self, zone_id: str, **kwargs) -> "Zone | None":
        with self._lock:
            z = self._zones.get(zone_id)
            if z is None:
                return None
            for k, v in kwargs.items():
                if hasattr(z, k):
                    setattr(z, k, v)
            self._save()
            return z

    def list_zones(self) -> list[Zone]:
        with self._lock:
            return list(self._zones.values())

    # ----------------------------------------------------------- Detection

    def check_intrusions(self, person_boxes: list, person_has_violation: list[bool]) -> dict:
        """
        Returns {zone_id: [box_index, ...]} for zones that are triggered.

        Logic per zone_type:
          restricted   → any person inside
          ppe_required → person inside AND that person has a PPE violation
          safe         → never triggers
        """
        result: dict[str, list] = {}
        with self._lock:
            for zid, zone in self._zones.items():
                if not zone.active or zone.zone_type == "safe":
                    continue
                hits = []
                for i, box in enumerate(person_boxes):
                    if not zone.contains_box(*box):
                        continue
                    if zone.zone_type == "restricted":
                        hits.append(i)
                    elif zone.zone_type == "ppe_required" and person_has_violation[i]:
                        hits.append(i)
                if hits:
                    result[zid] = hits
        return result

    def get_triggered_zone_ids(self, person_boxes, person_has_violation) -> set[str]:
        return set(self.check_intrusions(person_boxes, person_has_violation).keys())

    # ---------------------------------------------------------- Drawing

    def draw_zones(self, frame: np.ndarray, triggered_ids: set[str] = None):
        triggered_ids = triggered_ids or set()
        with self._lock:
            for zid, zone in self._zones.items():
                if not zone.active or len(zone.points) < 3:
                    continue
                pts = np.array(zone.points, dtype=np.int32)
                in_alert = zid in triggered_ids

                # fill
                overlay = frame.copy()
                fill = (0, 0, 180) if in_alert else tuple(int(c * 0.4) for c in zone.color)
                cv2.fillPoly(overlay, [pts], fill)
                cv2.addWeighted(overlay, 0.3, frame, 0.7, 0, frame)

                # border
                border = (0, 0, 255) if in_alert else zone.color
                cv2.polylines(frame, [pts], True, border, 2)

                # label — zone name + type in center
                cx = int(np.mean([p[0] for p in zone.points]))
                cy = int(np.mean([p[1] for p in zone.points]))
                tag = {"restricted": "⛔ RESTRICTED", "ppe_required": "⚠ PPE REQUIRED", "safe": "✓ SAFE"}
                prefix = "! " if in_alert else ""
                type_str = tag.get(zone.zone_type, "")
                line1 = f"{prefix}{zone.name}"
                line2 = type_str

                font = cv2.FONT_HERSHEY_SIMPLEX
                fs = 0.48
                (w1, h1), _ = cv2.getTextSize(line1, font, fs, 1)
                (w2, h2), _ = cv2.getTextSize(line2, font, fs - 0.04, 1)
                bw = max(w1, w2) + 10
                bh = h1 + h2 + 12
                bx = cx - bw // 2

                cv2.rectangle(frame, (bx, cy - bh), (bx + bw, cy + 4),
                              (0, 0, 0) if not in_alert else (0, 0, 160), -1)
                text_color = (80, 80, 255) if in_alert else (255, 220, 80)
                cv2.putText(frame, line1, (bx + 5, cy - h2 - 6), font, fs, text_color, 1)
                cv2.putText(frame, line2, (bx + 5, cy - 2), font, fs - 0.04, (200, 200, 200), 1)


zone_manager = ZoneManager()
