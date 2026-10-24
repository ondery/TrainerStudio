"""Ultralytics YOLO. AGPL-3.0. Not imported until a job asks for it."""

from __future__ import annotations

from trainer_studio.messages import text

FAMILIES = ("yolo11", "yolov8", "yolo26")
SIZES = ("n", "s", "m", "l", "x")
TASKS = ("detect", "segment", "obb", "pose")
_ALIASES = {
    "stop_sign": "stop",
    "car": "vehicle_car",
    "bus": "vehicle_bus",
    "truck": "vehicle_truck",
    "motorcycle": "vehicle_motorcycle",
}


def _norm_class(name: str) -> str:
    return name.strip().lower().replace("-", "_").replace(" ", "_")


def match_class_name(key: str, names: list[str]) -> str | None:
    """Map a detector label onto a dataset class when names differ slightly."""
    if key in names:
        return key
    lookup = {_norm_class(name): name for name in names}
    norm = _norm_class(key)
    if not norm:
        return None
    if norm in lookup:
        return lookup[norm]
    aliased = _ALIASES.get(norm)
    if aliased and aliased in names:
        return aliased
    suffix = [name for token, name in lookup.items() if token.endswith("_" + norm)]
    if len(suffix) == 1:
        return suffix[0]
    return None


def model_name(family: str, size: str, task: str) -> str:
    name = f"{family}{size}"
    if task == "segment":
        return f"{name}-seg"
    if task == "obb":
        return f"{name}-obb"
    if task == "pose":
        return f"{name}-pose"
    return name


class UltralyticsDetector:
    id = "ultralytics"
    license = "AGPL-3.0"
    families = [
        {
            "id": family,
            "label": {"yolo11": "YOLO11", "yolov8": "YOLOv8", "yolo26": "YOLO26"}[family],
            "sizes": list(SIZES),
            "tasks": list(TASKS),
            "license": "AGPL-3.0",
            "note": text("detect.note.ultra"),
        }
        for family in FAMILIES
    ]

    def ready(self) -> tuple[bool, str]:
        try:
            import importlib

            importlib.import_module("ultralytics")
        except Exception:
            return False, "detect.ultralytics"
        return True, ""

    def predict(self, image_path: str, spec: dict, names: list[str]) -> list[dict]:
        from ultralytics import YOLO

        family = spec.get("family") or "yolo11"
        size = spec.get("size") or "n"
        task = spec.get("task") or "detect"
        from trainer_studio.deps import resolve_device, resolve_weights

        resolve_weights(spec)
        weights = spec.get("weights") or model_name(family, size, task) + ".pt"
        device = resolve_device(spec.get("device"))
        model = YOLO(weights)
        conf = spec.get("conf")
        kwargs = {"verbose": False, "device": device}
        if conf is not None:
            kwargs["conf"] = float(conf)
        result = model.predict(image_path, **kwargs)[0]
        model_names = result.names or {}
        rows = getattr(result, "boxes", None)
        if rows is None:
            return []
        boxes = []
        for index, box in enumerate(rows):
            cls = int(box.cls.item())
            key = match_class_name(str(model_names.get(cls, "")), names)
            if not key:
                continue
            boxes.append({
                "classId": key,
                "geometry": _geometry(result, index, box, task),
                "score": float(box.conf.item()) if box.conf is not None else None,
            })
        return boxes


def _geometry(result, index: int, box, task: str) -> dict:
    xyxy = box.xyxy[0].tolist()
    x0, y0, x1, y1 = xyxy
    bbox = {"type": "bbox", "x": x0, "y": y0, "width": x1 - x0, "height": y1 - y0}
    if task == "segment":
        masks = getattr(result, "masks", None)
        contours = getattr(masks, "xy", None) if masks is not None else None
        if contours is not None and index < len(contours):
            contour = contours[index]
            step = max(1, len(contour) // 80)
            points = [{"x": float(x), "y": float(y)} for x, y in contour[::step]]
            if len(points) >= 3:
                return {"type": "polygon", "points": points}
    if task == "obb":
        obb = getattr(result, "obb", None)
        corners = getattr(obb, "xyxyxyxy", None) if obb is not None else None
        if corners is not None and index < len(corners):
            raw = corners[index].reshape(-1, 2).tolist()
            if len(raw) >= 4:
                return {"type": "obb", "corners": [{"x": float(x), "y": float(y)} for x, y in raw[:4]]}
    if task == "pose":
        keypoints = getattr(result, "keypoints", None)
        data = getattr(keypoints, "data", None) if keypoints is not None else None
        if data is not None and index < len(data):
            points = []
            for item in data[index].tolist():
                x, y = float(item[0]), float(item[1])
                visible = int(item[2]) if len(item) > 2 else 2
                points.append({"x": x, "y": y, "visibility": 2 if visible >= 2 else 1 if visible == 1 else 0})
            if points:
                return {"type": "pose", "keypoints": points, "box": {"x": x0, "y": y0, "width": x1 - x0, "height": y1 - y0}}
    return bbox
