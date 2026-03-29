"""
Zone manager — polygon zones with file persistence and zone types.

Zone types:
  "restricted"   — no entry. Any person inside = alert.
  "ppe_required" — PPE must be worn. Person inside WITHOUT PPE = alert.
  "safe"         — informational only, no alerts.

Each zone also has enabled_violations: which PPE violations are enforced
(subset of ["NO-Hardhat", "NO-Safety Vest", "NO-Mask"]).
"""
import json
import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Tuple

import cv2
import numpy as np

ZONES_FILE = Path(__file__).parent.parent / "data" / "zones.json"


ALL_VIOLATIONS = ["NO-Hardhat", "NO-Safety Vest", "NO-Mask"]


@dataclass
class Zone:
    id: str
    name: str
    points: List[Tuple[int, int]]
    zone_type: str = "restricted"   # "restricted" | "ppe_required" | "safe"
    active: bool = True
    locked: bool = False
    enabled_violations: List[str] = field(
        default_factory=lambda: list(ALL_VIOLATIONS)
    )
    camera_id: str | None = None

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
            "id":                 self.id,
            "name":               self.name,
            "points":             self.points,
            "zone_type":          self.zone_type,
            "active":             self.active,
            "locked":             self.locked,
            "enabled_violations": self.enabled_violations,
            "camera_id":          self.camera_id,
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
                        enabled_violations=d.get("enabled_violations", list(ALL_VIOLATIONS)),
                        camera_id=d.get("camera_id", None),
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

    def add_zone(self, name: str, points: list, zone_type: str = "restricted",
                 enabled_violations: list | None = None,
                 camera_id: str | None = None) -> Zone:
        with self._lock:
            self._counter += 1
            zid = f"zone_{self._counter}"
            zone = Zone(
                id=zid, name=name,
                points=[list(p) for p in points],
                zone_type=zone_type,
                enabled_violations=enabled_violations if enabled_violations is not None
                                    else list(ALL_VIOLATIONS),
                camera_id=camera_id,
            )
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

    def list_zones(self, camera_id: str | None = None) -> list[Zone]:
        with self._lock:
            zones = list(self._zones.values())
            if camera_id is not None:
                zones = [z for z in zones if z.camera_id == camera_id]
            return zones

    # ----------------------------------------------------------- Detection

    def check_intrusions(self, person_boxes: list, person_has_violation: list[bool],
                         person_violations: list[set] | None = None) -> dict:
        """
        Returns {zone_id: [box_index, ...]} for zones that are triggered.

        Logic per zone_type:
          restricted   → any person inside
          ppe_required → person inside AND has a violation from zone.enabled_violations
          safe         → never triggers

        person_violations: optional list of violation sets per person.
        If provided, ppe_required zones only trigger on violations in zone.enabled_violations.
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
                    elif zone.zone_type == "ppe_required":
                        # Use fine-grained violation types if available
                        if person_violations is not None:
                            ev = set(zone.enabled_violations)
                            if person_violations[i] & ev:
                                hits.append(i)
                        elif person_has_violation[i]:
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

                # fill — 50% alpha so visible on any background
                overlay = frame.copy()
                fill = (0, 0, 200) if in_alert else tuple(int(c * 0.5) for c in zone.color)
                cv2.fillPoly(overlay, [pts], fill)
                cv2.addWeighted(overlay, 0.5, frame, 0.5, 0, frame)

                # border — dark outline + colored inner for contrast on any background
                border = (0, 0, 255) if in_alert else zone.color
                cv2.polylines(frame, [pts], True, (0, 0, 0), 5)   # thick black outline
                cv2.polylines(frame, [pts], True, border, 2)       # colored inner

                # label — ASCII only (cv2 cannot render Unicode/emoji)
                cx = int(np.mean([p[0] for p in zone.points]))
                cy = int(np.mean([p[1] for p in zone.points]))
                tag = {"restricted": "RESTRICTED", "ppe_required": "PPE REQUIRED", "safe": "SAFE"}
                prefix = "!! " if in_alert else ""
                line1 = f"{prefix}{zone.name}"
                line2 = tag.get(zone.zone_type, "")

                font = cv2.FONT_HERSHEY_SIMPLEX
                fs = 0.52
                th = 1
                (w1, h1), _ = cv2.getTextSize(line1, font, fs, th)
                (w2, h2), _ = cv2.getTextSize(line2, font, fs - 0.06, th)
                bw = max(w1, w2) + 12
                bh = h1 + h2 + 14
                bx = cx - bw // 2

                # semi-transparent label background
                lbl_overlay = frame.copy()
                bg = (0, 0, 140) if in_alert else (20, 20, 20)
                cv2.rectangle(lbl_overlay, (bx, cy - bh), (bx + bw, cy + 4), bg, -1)
                cv2.addWeighted(lbl_overlay, 0.8, frame, 0.2, 0, frame)

                text_color = (60, 60, 255) if in_alert else (255, 220, 60)
                # draw text with dark shadow for readability
                cv2.putText(frame, line1, (bx + 6, cy - h2 - 6), font, fs, (0, 0, 0), 3)
                cv2.putText(frame, line1, (bx + 6, cy - h2 - 6), font, fs, text_color, th)
                cv2.putText(frame, line2, (bx + 6, cy - 2), font, fs - 0.06, (0, 0, 0), 3)
                cv2.putText(frame, line2, (bx + 6, cy - 2), font, fs - 0.06, (210, 210, 210), th)


zone_manager = ZoneManager()
