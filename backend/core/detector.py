"""
Core detection engine with BotSORT tracking and violation timers.

Strategy:
  - Single best.pt model detects both Person and PPE classes in one pass
  - .track() gives each detection a persistent track_id across frames
  - For Person boxes: find overlapping NO-* violation boxes via IOU
  - Track violation duration per person track_id
  - After violation_threshold seconds: red corners + warning badge + icons
"""
import json
import time
import cv2
import numpy as np
from collections import defaultdict, deque
from pathlib import Path
from ultralytics import YOLO

MODEL_PATH    = Path(__file__).parent.parent.parent / "models" / "best.pt"
ICONS_DIR     = Path(__file__).parent.parent / "assets" / "icons"
SETTINGS_PATH = Path(__file__).parent.parent / "data" / "settings.json"

TRACK_HISTORY_LEN = 40    # frames to keep for trail

ALL_CLASSES = [
    "Hardhat",
    "Mask",
    "NO-Hardhat",
    "NO-Mask",
    "NO-Safety Vest",
    "Person",
    "Safety Cone",
    "Safety Vest",
    "machinery",
    "vehicle",
]

VIOLATION_CLASSES = {"NO-Hardhat", "NO-Mask", "NO-Safety Vest"}
PPE_CLASSES       = {"Hardhat", "Safety Vest"}   # Mask excluded — unreliable

UNCERTAIN_COLOR  = (0, 220, 255)   # golden yellow in BGR — PPE status unknown
PPE_INFER_AREA   = 5000            # min person box px² for inverse PPE inference

CLASS_COLORS = {
    "NO-Hardhat":     (0,  0,  255),
    "NO-Mask":        (0,  0,  210),
    "NO-Safety Vest": (0, 50,  255),
    "Hardhat":        (0, 200,   0),
    "Mask":           (0, 180,   0),
    "Safety Vest":    (0, 220,  80),
    "Person":         (255, 180,  0),
    "Safety Cone":    (0, 165, 255),
    "machinery":      (200,  0, 200),
    "vehicle":        (180,  0, 180),
}

ICON_MAP = {
    "NO-Hardhat":     "no_helmet.png",
    "NO-Safety Vest": "no_vest.png",
    "NO-Mask":        "no_mask.png",
}


def _iou(a, b):
    """Compute IoU between two (x1,y1,x2,y2) boxes."""
    ix1 = max(a[0], b[0])
    iy1 = max(a[1], b[1])
    ix2 = min(a[2], b[2])
    iy2 = min(a[3], b[3])
    inter = max(0, ix2 - ix1) * max(0, iy2 - iy1)
    if inter == 0:
        return 0.0
    area_a = (a[2]-a[0]) * (a[3]-a[1])
    area_b = (b[2]-b[0]) * (b[3]-b[1])
    return inter / (area_a + area_b - inter)


def _overlay_icon(frame, icon_bgra, x, y, size=36):
    """Blend a pre-loaded BGRA icon onto frame at (x,y), clipped to frame bounds."""
    icon = cv2.resize(icon_bgra, (size, size), interpolation=cv2.INTER_AREA)
    h, w = icon.shape[:2]
    fh, fw = frame.shape[:2]

    # Clip to frame
    x1, y1 = max(x, 0), max(y, 0)
    x2, y2 = min(x + w, fw), min(y + h, fh)
    if x2 <= x1 or y2 <= y1:
        return

    icon_crop = icon[y1-y : y2-y, x1-x : x2-x]
    if icon_crop.shape[2] == 4:
        alpha = icon_crop[:, :, 3:4] / 255.0
        frame[y1:y2, x1:x2] = (
            alpha * icon_crop[:, :, :3] + (1 - alpha) * frame[y1:y2, x1:x2]
        ).astype(np.uint8)
    else:
        frame[y1:y2, x1:x2] = icon_crop[:, :, :3]


def _draw_corners(frame, x1, y1, x2, y2, color, length=18, thickness=2):
    """Draw corner-bracket style bounding box."""
    pts = [
        ((x1, y1), (x1+length, y1), (x1, y1+length)),
        ((x2, y1), (x2-length, y1), (x2, y1+length)),
        ((x1, y2), (x1+length, y2), (x1, y2-length)),
        ((x2, y2), (x2-length, y2), (x2, y2-length)),
    ]
    for corner, h_end, v_end in pts:
        cv2.line(frame, corner, h_end, color, thickness)
        cv2.line(frame, corner, v_end, color, thickness)


class Detector:
    def __init__(self):
        self.model = YOLO(str(MODEL_PATH))
        self.enabled_classes: set[str] = set(ALL_CLASSES)
        self.confidence: float = 0.45
        self.violation_confidence: float = 0.28
        self.min_box_area: int = 1000
        self.ppe_zone_only: bool = False
        self.violation_threshold: float = 3.0   # seconds before alert triggers
        self.cooldown_seconds: int = 60          # min seconds between incidents per track
        self.muted_until: float = 0.0

        # Per-track state
        self._tracks: dict = defaultdict(lambda: {
            "violation_start": None,
            "duration": 0.0,
            "history": deque(maxlen=TRACK_HISTORY_LEN),
            "was_alerting": False,
        })
        self._last_incident_time: dict[int, float] = {}

        # Live stats
        self._stats: dict = {"person_count": 0, "violation_count": 0, "fps": 0.0}
        self._frame_times: deque = deque(maxlen=60)

        # Pre-load icons
        self._icons: dict[str, np.ndarray | None] = {}
        for cls, fname in ICON_MAP.items():
            path = ICONS_DIR / fname
            img = cv2.imread(str(path), cv2.IMREAD_UNCHANGED) if path.exists() else None
            self._icons[cls] = img

        # Load persisted settings (overrides defaults above)
        self._load_settings()

    # ── Setters (each persists settings) ─────────────────────────────────────

    def set_enabled_classes(self, classes: list[str]):
        self.enabled_classes = set(classes)
        self._save_settings()

    def set_confidence(self, conf: float):
        self.confidence = max(0.1, min(0.95, conf))
        self._save_settings()

    def set_violation_confidence(self, conf: float):
        self.violation_confidence = max(0.05, min(self.confidence, conf))
        self._save_settings()

    def set_min_box_area(self, area: int):
        self.min_box_area = max(0, area)
        self._save_settings()

    def set_violation_threshold(self, t: float):
        self.violation_threshold = max(0.5, min(30.0, t))
        self._save_settings()

    def set_cooldown_seconds(self, s: int):
        self.cooldown_seconds = max(0, min(3600, s))
        self._save_settings()

    def set_ppe_zone_only(self, v: bool):
        self.ppe_zone_only = v
        self._save_settings()

    # ── Mute support ─────────────────────────────────────────────────────────

    def mute(self, seconds: int = 300):
        self.muted_until = time.time() + seconds

    def unmute(self):
        self.muted_until = 0.0

    def is_muted(self) -> bool:
        return time.time() < self.muted_until

    def mute_remaining(self) -> int:
        """Returns seconds remaining in mute, 0 if not muted."""
        return max(0, int(self.muted_until - time.time()))

    # ── Live stats ────────────────────────────────────────────────────────────

    def get_stats(self) -> dict:
        return dict(self._stats)

    # ── Settings persistence ──────────────────────────────────────────────────

    def _load_settings(self):
        try:
            if SETTINGS_PATH.exists():
                data = json.loads(SETTINGS_PATH.read_text())
                self.confidence           = data.get("confidence",           self.confidence)
                self.violation_confidence = data.get("violation_confidence", self.violation_confidence)
                self.min_box_area         = data.get("min_box_area",         self.min_box_area)
                self.ppe_zone_only        = data.get("ppe_zone_only",        self.ppe_zone_only)
                self.violation_threshold  = data.get("violation_threshold",  self.violation_threshold)
                self.cooldown_seconds     = data.get("cooldown_seconds",     self.cooldown_seconds)
                classes = data.get("enabled_classes")
                if classes:
                    self.enabled_classes = set(classes)
        except Exception:
            pass

    def _save_settings(self):
        try:
            SETTINGS_PATH.parent.mkdir(parents=True, exist_ok=True)
            data = {
                "confidence":           self.confidence,
                "violation_confidence": self.violation_confidence,
                "min_box_area":         self.min_box_area,
                "ppe_zone_only":        self.ppe_zone_only,
                "violation_threshold":  self.violation_threshold,
                "cooldown_seconds":     self.cooldown_seconds,
                "enabled_classes":      list(self.enabled_classes),
            }
            SETTINGS_PATH.write_text(json.dumps(data, indent=2))
        except Exception:
            pass

    # ── Main detection loop ───────────────────────────────────────────────────

    def detect(self, frame: np.ndarray) -> tuple[np.ndarray, set[str], list[dict]]:
        """
        Run tracking + PPE violation detection.
        Returns (annotated_frame, intrusion_zone_ids, new_incidents).
        new_incidents: list of {track_id, violations, snapshot_frame}
        """
        from core.zone_manager import zone_manager

        now = time.time()

        # FPS tracking
        self._frame_times.append(now)
        if len(self._frame_times) >= 2:
            span = self._frame_times[-1] - self._frame_times[0]
            self._stats["fps"] = round((len(self._frame_times) - 1) / span, 1) if span > 0 else 0.0

        annotated = frame.copy()
        new_incidents: list[dict] = []

        if not self.enabled_classes:
            self._stats["person_count"] = 0
            self._stats["violation_count"] = 0
            return annotated, set(), new_incidents

        # Run BotSORT tracking
        inference_conf = min(self.confidence, self.violation_confidence)
        results = self.model.track(
            frame, persist=True, verbose=False,
            conf=inference_conf,
            tracker="botsort.yaml"
        )[0]

        if results.boxes is None or len(results.boxes) == 0:
            self._stats["person_count"] = 0
            self._stats["violation_count"] = 0
            return annotated, set(), new_incidents

        boxes   = results.boxes.xyxy.cpu().numpy()
        cls_ids = results.boxes.cls.cpu().numpy().astype(int)
        confs   = results.boxes.conf.cpu().numpy()
        ids     = (results.boxes.id.cpu().numpy().astype(int)
                   if results.boxes.id is not None
                   else np.arange(len(boxes)))

        names = self.model.names

        def _box_area(b):
            return max(0, b[2] - b[0]) * max(0, b[3] - b[1])

        def _conf_threshold(cid):
            return self.violation_confidence if names[cid] in VIOLATION_CLASSES else self.confidence

        keep = [
            i for i, (b, cid, c) in enumerate(zip(boxes, cls_ids, confs))
            if c >= _conf_threshold(cid) and _box_area(b) >= self.min_box_area
        ]
        boxes   = boxes[keep]
        cls_ids = cls_ids[keep]
        confs   = confs[keep]
        ids     = ids[keep]

        person_idxs    = [i for i, c in enumerate(cls_ids) if names[c] == "Person"]
        violation_idxs = [i for i, c in enumerate(cls_ids) if names[c] in VIOLATION_CLASSES]
        ppe_idxs       = [i for i, c in enumerate(cls_ids) if names[c] in PPE_CLASSES]

        # Draw non-person, non-violation classes
        for i, (box, cid, conf) in enumerate(zip(boxes, cls_ids, confs)):
            label = names[cid]
            if label not in self.enabled_classes:
                continue
            if label in ("Person",) or label in VIOLATION_CLASSES:
                continue
            x1, y1, x2, y2 = map(int, box)
            color = CLASS_COLORS.get(label, (200, 200, 200))
            cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 1)
            self._draw_label(annotated, label, conf, x1, y1, color)

        person_boxes_list:    list[tuple]    = []
        person_has_violation: list[bool]     = []
        person_violations:    list[set[str]] = []
        potential_incidents:  list[dict]     = []

        active_violation_count = 0

        for pi in person_idxs:
            if "Person" not in self.enabled_classes:
                break

            track_id = int(ids[pi])
            px1, py1, px2, py2 = map(int, boxes[pi])
            pcx = (px1 + px2) // 2
            pbox = (px1, py1, px2, py2)

            self._tracks[track_id]["history"].append((pcx, py2))

            raw_violations: set[str] = set()
            for vi in violation_idxs:
                vlabel = names[cls_ids[vi]]
                if vlabel not in self.enabled_classes:
                    continue
                if _iou(pbox, tuple(map(int, boxes[vi]))) > 0.05:
                    raw_violations.add(vlabel)

            # Inverse PPE inference
            person_area = (px2 - px1) * (py2 - py1)
            if person_area >= PPE_INFER_AREA:
                def _ppe_present(ppe_cls):
                    confirm_thresh = max(self.confidence, 0.65)
                    for ai in ppe_idxs:
                        if names[cls_ids[ai]] != ppe_cls or confs[ai] < confirm_thresh:
                            continue
                        cx_p = (boxes[ai][0] + boxes[ai][2]) / 2
                        cy_p = (boxes[ai][1] + boxes[ai][3]) / 2
                        if px1 <= cx_p <= px2 and py1 <= cy_p <= py2:
                            return True
                    return False

                if "NO-Hardhat" in self.enabled_classes and "NO-Hardhat" not in raw_violations:
                    if not _ppe_present("Hardhat"):
                        raw_violations.add("NO-Hardhat")
                if "NO-Safety Vest" in self.enabled_classes and "NO-Safety Vest" not in raw_violations:
                    if not _ppe_present("Safety Vest"):
                        raw_violations.add("NO-Safety Vest")

            relevant_enabled = (
                "NO-Hardhat"     in self.enabled_classes or
                "NO-Safety Vest" in self.enabled_classes
            )
            uncertain = relevant_enabled and not raw_violations

            person_boxes_list.append(pbox)
            person_has_violation.append(bool(raw_violations))
            person_violations.append(set(raw_violations))

            t = self._tracks[track_id]
            if raw_violations:
                if t["violation_start"] is None:
                    t["violation_start"] = now
                t["duration"] = now - t["violation_start"]
            else:
                t["violation_start"] = None
                t["duration"] = 0.0

            is_alerting = t["duration"] >= self.violation_threshold and (
                not self.ppe_zone_only
            )
            active_violations = raw_violations if (not self.ppe_zone_only or is_alerting) else set()

            if is_alerting:
                active_violation_count += 1

            # Cooldown check: don't re-trigger if within cooldown window
            last_inc = self._last_incident_time.get(track_id, 0)
            in_cooldown = (now - last_inc) < self.cooldown_seconds

            newly_triggered = is_alerting and not t.get("was_alerting", False) and not in_cooldown
            t["was_alerting"] = is_alerting
            if newly_triggered and active_violations:
                potential_incidents.append({
                    "track_id":   track_id,
                    "violations": set(active_violations),
                    "person_idx": len(person_boxes_list) - 1,
                })

            if is_alerting:
                person_color = (0, 0, 255)
            elif active_violations:
                person_color = (0, 140, 255)
            elif uncertain:
                person_color = UNCERTAIN_COLOR
            else:
                person_color = (0, 220, 0)

            if is_alerting:
                _draw_corners(annotated, px1, py1, px2, py2, person_color, thickness=3)
            else:
                _draw_corners(annotated, px1, py1, px2, py2, person_color)

            badge = f"#{track_id}"
            if active_violations:
                badge += f"  {t['duration']:.1f}s"
            elif uncertain:
                badge += " ?"
            self._draw_label(annotated, badge, confs[pi], px1, py1, person_color)

            if is_alerting:
                btext = "! VIOLATION"
                bw = cv2.getTextSize(btext, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)[0][0]
                bx = (px1 + px2 - bw) // 2
                cv2.putText(annotated, btext, (bx, py2 + 14),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 255), 1)

            # Mute banner overlay
            if self.is_muted():
                rem = self.mute_remaining()
                cv2.putText(annotated, f"MUTED {rem}s", (10, 30),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 200, 255), 2)

            history = list(self._tracks[track_id]["history"])
            if len(history) > 1:
                for j in range(1, len(history)):
                    a = j / len(history)
                    cv2.line(annotated, history[j-1], history[j],
                             (int(255*a), int(200*a), 0), 1)

            icon_x, icon_y = px2 + 6, py1 - 36
            for vcls in ["NO-Hardhat", "NO-Safety Vest", "NO-Mask"]:
                if vcls in raw_violations and self._icons.get(vcls) is not None:
                    if not self.ppe_zone_only or is_alerting:
                        _overlay_icon(annotated, self._icons[vcls], icon_x, icon_y)
                        icon_x += 40

        # Update live stats
        self._stats["person_count"]    = len(person_idxs)
        self._stats["violation_count"] = active_violation_count

        # Zone intrusion check
        intrusion_map = (
            zone_manager.check_intrusions(
                person_boxes_list, person_has_violation, person_violations)
            if person_boxes_list else {}
        )
        intrusion_zone_ids = set(intrusion_map.keys())

        # Fill zone info into potential incidents, then emit
        for inc in potential_incidents:
            pidx = inc.pop("person_idx")
            zone_id, zone_name = None, None
            for zid, box_indices in intrusion_map.items():
                if pidx in box_indices:
                    z = next((z for z in zone_manager.list_zones() if z.id == zid), None)
                    if z:
                        zone_id   = zid
                        zone_name = z.name
                    break
            inc["zone_id"]   = zone_id
            inc["zone_name"] = zone_name
            # Only emit if not muted; record last incident time
            if not self.is_muted():
                self._last_incident_time[inc["track_id"]] = now
                new_incidents.append(inc)

        # Draw zone badges
        for zid, box_indices in intrusion_map.items():
            zone = next((z for z in zone_manager.list_zones() if z.id == zid), None)
            if zone is None:
                continue

            if zone.zone_type == "restricted":
                badge_color = (0, 0, 220)
                badge_text  = f"⛔ {zone.name}"
            elif zone.zone_type == "ppe_required":
                badge_color = (0, 140, 255)
                badge_text  = f"⚠ {zone.name}  — PPE REQUIRED"
            else:
                badge_color = (60, 160, 60)
                badge_text  = f"✓ {zone.name}"

            for bi in box_indices:
                px1, py1, px2, py2 = person_boxes_list[bi]
                cv2.rectangle(annotated, (px1, py1), (px2, py2), badge_color, 3)

                font       = cv2.FONT_HERSHEY_SIMPLEX
                font_scale = 0.52
                thickness  = 1
                (tw, th), _ = cv2.getTextSize(badge_text, font, font_scale, thickness)
                pad = 5
                bx1 = px1
                by1 = max(py1 - th - pad * 2 - 22, 0)
                bx2 = bx1 + tw + pad * 2
                by2 = by1 + th + pad * 2

                cv2.rectangle(annotated, (bx1, by1), (bx2, by2), badge_color, -1)
                cv2.putText(annotated, badge_text, (bx1 + pad, by2 - pad - 1),
                            font, font_scale, (255, 255, 255), thickness)

                if self.ppe_zone_only and person_has_violation[bi]:
                    for vcls in ["NO-Hardhat", "NO-Safety Vest", "NO-Mask"]:
                        if vcls in self.enabled_classes and self._icons.get(vcls) is not None:
                            _overlay_icon(annotated, self._icons[vcls], px2 + 6, py1 - 36)

        return annotated, intrusion_zone_ids, new_incidents

    @staticmethod
    def _draw_label(frame, label, conf, x1, y1, color):
        text = f"{label} {conf:.0%}"
        (tw, th), _ = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, 0.48, 1)
        ty = max(y1 - 4, th + 4)
        cv2.rectangle(frame, (x1, ty - th - 4), (x1 + tw + 4, ty + 2), color, -1)
        cv2.putText(frame, text, (x1 + 2, ty - 1),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.48, (255, 255, 255), 1)


# Singleton
detector = Detector()
