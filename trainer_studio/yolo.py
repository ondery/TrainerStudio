"""YOLO text import and export.

Written formats are the Ultralytics ones:

- detect: ``cls cx cy w h`` normalized
- segment: ``cls x1 y1 x2 y2 ...`` normalized polygon
- obb: ``cls x1 y1 x2 y2 x3 y3 x4 y4`` four corners, normalized
- pose: ``cls cx cy w h x1 y1 v1 ...`` with visibility 0, 1 or 2

Not written, and reported when seen:

- pixel ``xyxy`` boxes
- OBB ``cx cy w h angle`` (xywhr). Angle is ambiguous (radians vs degrees).
  A 6-number OBB line is read as xywhr radians and converted to corners, with a warning.
- RLE masks
- keypoint rows that omit visibility (``kpt_shape`` dim 2)

Geometry is stored in natural image pixels. The numeric class id is resolved from
``data.yaml`` at write time and is not stored on the annotation.
"""

from __future__ import annotations

import math
from typing import Any

from trainer_studio.messages import text

Point = dict[str, float]


def signature(text: str) -> tuple | None:
    """Class id plus numbers. Spacing differences do not count."""
    rows = []
    for line in text.splitlines():
        if not line.strip():
            continue
        parts = line.split()
        try:
            cls = int(float(parts[0]))
            nums = tuple(round(float(part), 6) for part in parts[1:])
        except (TypeError, ValueError):
            return None
        rows.append((cls, nums))
    return tuple(rows)


def _num(value: Any) -> float:
    return float(value)


def yolo_box(x: float, y: float, width: float, height: float, image_w: int, image_h: int) -> tuple[float, float, float, float]:
    return (
        (x + width / 2) / image_w,
        (y + height / 2) / image_h,
        width / image_w,
        height / image_h,
    )


def pixel_box(cx: float, cy: float, width: float, height: float, image_w: int, image_h: int) -> dict:
    box_w = width * image_w
    box_h = height * image_h
    return {"type": "bbox", "x": (cx - width / 2) * image_w, "y": (cy - height / 2) * image_h, "width": box_w, "height": box_h}


def _fmt(values: list[float], digits: int = 6) -> str:
    places = max(1, min(8, int(digits or 6)))
    return " ".join(f"{value:.{places}f}" for value in values)


def render_line(class_index: int, geometry: dict, image_w: int, image_h: int, task: str, digits: int = 6) -> str:
    if image_w <= 0 or image_h <= 0:
        raise ValueError("image size")
    kind = geometry.get("type")
    if kind == "raw":
        return str(geometry.get("line") or "").strip()
    if task == "segment" or (task == "detect" and kind == "polygon"):
        points = _points(geometry, image_w, image_h)
        flat = [item for point in points for item in (point[0] / image_w, point[1] / image_h)]
        return f"{class_index} {_fmt(flat, digits)}"
    if task == "obb" or kind == "obb":
        corners = _corners(geometry, image_w, image_h)
        flat = [item for point in corners for item in (point[0] / image_w, point[1] / image_h)]
        return f"{class_index} {_fmt(flat, digits)}"
    if task == "pose" or kind == "pose":
        box = _pose_box(geometry)
        cx, cy, bw, bh = yolo_box(box["x"], box["y"], box["width"], box["height"], image_w, image_h)
        places = max(1, min(8, int(digits or 6)))
        parts = [str(class_index), f"{cx:.{places}f}", f"{cy:.{places}f}", f"{bw:.{places}f}", f"{bh:.{places}f}"]
        for point in geometry.get("keypoints") or []:
            parts.append(f"{_num(point['x']) / image_w:.{places}f}")
            parts.append(f"{_num(point['y']) / image_h:.{places}f}")
            parts.append(str(int(point.get("visibility", 2))))
        return " ".join(parts)
    if kind != "bbox":
        box = _enclosing(geometry, image_w, image_h)
    else:
        box = geometry
    cx, cy, bw, bh = yolo_box(_num(box["x"]), _num(box["y"]), _num(box["width"]), _num(box["height"]), image_w, image_h)
    places = max(1, min(8, int(digits or 6)))
    return f"{class_index} {cx:.{places}f} {cy:.{places}f} {bw:.{places}f} {bh:.{places}f}"


def render_text(rows: list[tuple[int, dict]], image_w: int, image_h: int, task: str, digits: int = 6) -> str:
    lines = [render_line(index, geometry, image_w, image_h, task, digits) for index, geometry in rows]
    if not lines:
        return ""
    return "\n".join(lines) + "\n"


def parse_text(text: str, task: str, image_w: int, image_h: int) -> tuple[list[dict], list[str]]:
    """Parse a label file. Unknown lines are kept as raw geometry so a save can preserve them."""
    annotations: list[dict] = []
    warnings: list[str] = []
    for line_no, line in enumerate(text.splitlines()):
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            if stripped.startswith("#"):
                annotations.append(_raw(line_no, stripped, None))
            continue
        parts = stripped.split()
        try:
            class_index = int(float(parts[0]))
            nums = [float(part) for part in parts[1:]]
        except ValueError:
            warnings.append(f"line {line_no + 1}: {text('yolo.nan')}")
            annotations.append(_raw(line_no, stripped, None))
            continue
        geometry, warning = _parse_numbers(task, nums, image_w, image_h)
        if warning:
            warnings.append(f"line {line_no + 1}: {warning}")
        if geometry is None:
            annotations.append(_raw(line_no, stripped, class_index))
        else:
            annotations.append({"ordinal": line_no, "classIndex": class_index, "geometry": geometry})
    return annotations, warnings


def _raw(ordinal: int, line: str, class_index: int | None) -> dict:
    row: dict[str, Any] = {"ordinal": ordinal, "geometry": {"type": "raw", "line": line}}
    if class_index is not None:
        row["classIndex"] = class_index
    return row


def _parse_numbers(task: str, nums: list[float], image_w: int, image_h: int) -> tuple[dict | None, str | None]:
    if task == "detect":
        if len(nums) == 4:
            return pixel_box(*nums, image_w, image_h), None
        return None, text("yolo.detectRaw")
    if task == "segment":
        if len(nums) >= 6 and len(nums) % 2 == 0:
            points = [{"x": nums[i] * image_w, "y": nums[i + 1] * image_h} for i in range(0, len(nums), 2)]
            return {"type": "polygon", "points": points}, None
        if len(nums) == 4:
            box = pixel_box(*nums, image_w, image_h)
            return {
                "type": "polygon",
                "points": [
                    {"x": box["x"], "y": box["y"]},
                    {"x": box["x"] + box["width"], "y": box["y"]},
                    {"x": box["x"] + box["width"], "y": box["y"] + box["height"]},
                    {"x": box["x"], "y": box["y"] + box["height"]},
                ],
            }, text("yolo.rectPoly")
        return None, text("yolo.segmentOdd")
    if task == "obb":
        if len(nums) == 8:
            corners = [{"x": nums[i] * image_w, "y": nums[i + 1] * image_h} for i in range(0, 8, 2)]
            return {"type": "obb", "corners": corners}, None
        if len(nums) == 5:
            corners = _xywhr_corners(*nums, image_w, image_h)
            return {"type": "obb", "corners": corners}, text("yolo.xywhr")
        return None, text("yolo.obbCount")
    if task == "pose":
        if len(nums) >= 4 and (len(nums) - 4) % 3 == 0:
            box = pixel_box(nums[0], nums[1], nums[2], nums[3], image_w, image_h)
            keypoints = []
            bad_vis = False
            for index in range(4, len(nums), 3):
                visibility = int(round(nums[index + 2]))
                if visibility not in {0, 1, 2}:
                    bad_vis = True
                    visibility = 2 if visibility > 2 else 0
                keypoints.append({"x": nums[index] * image_w, "y": nums[index + 1] * image_h, "visibility": visibility})
            note = text("yolo.visClamp") if bad_vis else None
            return {"type": "pose", "box": box, "keypoints": keypoints}, note
        if len(nums) >= 4 and (len(nums) - 4) % 2 == 0:
            return None, text("yolo.poseVis")
        return None, text("yolo.poseBox")
    return None, text("yolo.task", task=task)


def _points(geometry: dict, image_w: int, image_h: int) -> list[tuple[float, float]]:
    if geometry.get("type") == "polygon":
        return [(_num(point["x"]), _num(point["y"])) for point in geometry.get("points") or []]
    box = geometry if geometry.get("type") == "bbox" else _enclosing(geometry, image_w, image_h)
    x, y, w, h = _num(box["x"]), _num(box["y"]), _num(box["width"]), _num(box["height"])
    return [(x, y), (x + w, y), (x + w, y + h), (x, y + h)]


def _corners(geometry: dict, image_w: int, image_h: int) -> list[tuple[float, float]]:
    if geometry.get("type") == "obb" and len(geometry.get("corners") or []) == 4:
        return [(_num(point["x"]), _num(point["y"])) for point in geometry["corners"]]
    box = geometry if geometry.get("type") == "bbox" else _enclosing(geometry, image_w, image_h)
    x, y = _num(box["x"]), _num(box["y"])
    w, h = _num(box["width"]), _num(box["height"])
    return [(x, y), (x + w, y), (x + w, y + h), (x, y + h)]


def _xywhr_corners(cx: float, cy: float, width: float, height: float, angle: float, image_w: int, image_h: int) -> list[dict]:
    px, py = cx * image_w, cy * image_h
    pw, ph = width * image_w, height * image_h
    cosine, sine = math.cos(angle), math.sin(angle)
    corners = []
    for sx, sy in ((-pw / 2, -ph / 2), (pw / 2, -ph / 2), (pw / 2, ph / 2), (-pw / 2, ph / 2)):
        corners.append({"x": px + sx * cosine - sy * sine, "y": py + sx * sine + sy * cosine})
    return corners


def _pose_box(geometry: dict) -> dict:
    box = geometry.get("box")
    if isinstance(box, dict) and {"x", "y", "width", "height"} <= set(box):
        return box
    points = geometry.get("keypoints") or []
    visible = [point for point in points if int(point.get("visibility", 2)) > 0] or points
    if not visible:
        return {"x": 0, "y": 0, "width": 1, "height": 1}
    xs = [_num(point["x"]) for point in visible]
    ys = [_num(point["y"]) for point in visible]
    x0, x1 = min(xs), max(xs)
    y0, y1 = min(ys), max(ys)
    return {"x": x0, "y": y0, "width": max(x1 - x0, 1), "height": max(y1 - y0, 1)}


def _enclosing(geometry: dict, image_w: int, image_h: int) -> dict:
    if geometry.get("type") == "bbox":
        return geometry
    if geometry.get("type") == "pose":
        return _pose_box(geometry)
    points = _corners(geometry, image_w, image_h) if geometry.get("type") == "obb" else _points(geometry, image_w, image_h)
    xs = [point[0] for point in points]
    ys = [point[1] for point in points]
    x0, x1 = min(xs), max(xs)
    y0, y1 = min(ys), max(ys)
    return {"type": "bbox", "x": x0, "y": y0, "width": max(x1 - x0, 1), "height": max(y1 - y0, 1)}


FORMAT_NOTES = {
    "detect": text("format.detect"),
    "segment": text("format.segment"),
    "obb": text("format.obb"),
    "pose": text("format.pose"),
}


def validate_geometry(geometry: dict, image_w: int, image_h: int) -> list[str]:
    issues = []
    kind = geometry.get("type")
    if kind == "raw":
        issues.append(text("yolo.raw"))
        return issues
    if kind == "bbox":
        _check_box(geometry, image_w, image_h, issues)
    elif kind == "polygon":
        points = geometry.get("points") or []
        if len(points) < 3:
            issues.append(text("yolo.polyCount"))
        for point in points:
            _check_point(point, image_w, image_h, issues)
    elif kind == "obb":
        corners = geometry.get("corners") or []
        if len(corners) != 4:
            issues.append(text("yolo.obbCorners"))
        for point in corners:
            _check_point(point, image_w, image_h, issues)
    elif kind == "pose":
        _check_box(_pose_box(geometry), image_w, image_h, issues)
        keypoints = geometry.get("keypoints") or []
        if not keypoints:
            issues.append(text("yolo.poseEmpty"))
        for point in keypoints:
            if int(point.get("visibility", 2)) not in {0, 1, 2}:
                issues.append(text("yolo.vis"))
            _check_point(point, image_w, image_h, issues)
    else:
        issues.append(text("yolo.unknown", kind=kind))
    return issues


def _check_box(box: dict, image_w: int, image_h: int, issues: list[str]) -> None:
    try:
        x, y = _num(box["x"]), _num(box["y"])
        w, h = _num(box["width"]), _num(box["height"])
    except (KeyError, TypeError, ValueError):
        issues.append(text("yolo.boxFields"))
        return
    if w <= 0 or h <= 0:
        issues.append(text("yolo.zero"))
    if x < -1 or y < -1 or x + w > image_w + 1 or y + h > image_h + 1:
        issues.append(text("yolo.outside"))


def _check_point(point: dict, image_w: int, image_h: int, issues: list[str]) -> None:
    try:
        x, y = _num(point["x"]), _num(point["y"])
    except (KeyError, TypeError, ValueError):
        issues.append(text("yolo.point"))
        return
    if x < -1 or y < -1 or x > image_w + 1 or y > image_h + 1:
        issues.append(text("yolo.outside"))
