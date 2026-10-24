"""Quality checks that do not rewrite labels."""

from __future__ import annotations

import json

from trainer_studio.messages import text
from trainer_studio.yamlids import index_for_key, read_name_pairs
from trainer_studio.yolo import validate_geometry

_TASK_GEOMETRY = {
    "detect": {"bbox", "raw"},
    "segment": {"polygon", "raw"},
    "obb": {"obb", "raw"},
    "pose": {"pose", "raw"},
}


def scan(conn, project) -> dict:
    from pathlib import Path

    root = Path(project["root"])
    pairs = read_name_pairs(root / "data.yaml") or []
    issues = []
    distribution = {
        key: {"key": key, "count": 0, "images": set(), "tiny": 0, "outside": 0}
        for _index, key in pairs
        if key
    }
    consistency = {
        "unknownClass": 0,
        "unknownIndex": 0,
        "taskMismatch": 0,
        "emptyClass": 0,
        "duplicateId": 0,
        "unlabeled": 0,
    }
    queue = []
    seen_ids: set[str] = set()
    allowed = _TASK_GEOMETRY.get(project["task"], {"bbox", "polygon", "obb", "pose", "raw"})
    rows = conn.execute("SELECT * FROM images WHERE project_id = ? ORDER BY sort_index", (project["id"],)).fetchall()
    for image in rows:
        anns = conn.execute(
            "SELECT * FROM annotations WHERE project_id = ? AND image_id = ? ORDER BY ordinal",
            (project["id"], image["id"]),
        ).fetchall()
        if not anns and image["status"] != "review":
            issues.append(_issue(image, None, "info", "unlabeled", text("qc.unlabeled")))
            consistency["unlabeled"] += 1
        seen = []
        boxes = []
        for ann in anns:
            geometry = json.loads(ann["geometry"])
            attrs = json.loads(ann["attributes"])
            key = ann["class_key"]
            if ann["id"] in seen_ids:
                consistency["duplicateId"] += 1
                issues.append(_issue(image, ann["id"], "error", "duplicateId", text("qc.duplicateId")))
            seen_ids.add(ann["id"])
            if geometry.get("type") not in allowed:
                consistency["taskMismatch"] += 1
                issues.append(_issue(image, ann["id"], "warning", "taskMismatch", text("qc.taskMismatch")))
            if not key and geometry.get("type") != "raw":
                consistency["emptyClass"] += 1
                issues.append(_issue(image, ann["id"], "error", "emptyClass", text("qc.emptyClass")))
            if key and index_for_key(pairs, key) is None and geometry.get("type") != "raw":
                consistency["unknownClass"] += 1
                issues.append(_issue(image, ann["id"], "error", "unknownClass", text("qc.unknownClass")))
            unknown = attrs.get("_unknownClass")
            if unknown is not None and not key:
                consistency["unknownIndex"] += 1
                issues.append(_issue(image, ann["id"], "error", "unknownIndex", text("qc.unknownIndex", index=unknown), {"index": unknown}))
            outside = False
            for problem in validate_geometry(geometry, image["width"], image["height"]):
                code = _geometry_code(problem)
                severity = "warning" if code in {"outside", "zero", "raw"} else "error"
                issues.append(_issue(image, ann["id"], severity, code, problem))
                if code == "outside":
                    outside = True
            if attrs.get("review") == "pending":
                queue.append({
                    "imageId": image["id"],
                    "image": image["name"],
                    "annotationId": ann["id"],
                    "classId": key,
                    "score": attrs.get("score"),
                })
            box = _aabb(geometry)
            if box is None:
                continue
            if key in distribution:
                distribution[key]["count"] += 1
                distribution[key]["images"].add(image["id"])
                if outside:
                    distribution[key]["outside"] += 1
            if geometry.get("type") == "bbox":
                signature = (key, round(box[0], 2), round(box[1], 2), round(box[2], 2), round(box[3], 2))
                if signature in seen:
                    issues.append(_issue(image, ann["id"], "warning", "duplicate", text("qc.duplicate")))
                seen.append(signature)
            tiny = box[2] < 2 or box[3] < 2
            if tiny:
                issues.append(_issue(image, ann["id"], "warning", "tiny", text("qc.tiny")))
                if key in distribution:
                    distribution[key]["tiny"] += 1
            boxes.append((ann["id"], box))
        for index, (ann_id, box) in enumerate(boxes):
            for other_id, other in boxes[index + 1 :]:
                if other_id == ann_id:
                    continue
                if _iou(box, other) > 0.5:
                    issues.append(_issue(image, other_id, "warning", "overlap", text("qc.overlap")))
                    break
        path = root / image["rel_path"]
        if not path.is_file():
            issues.append(_issue(image, None, "error", "missingFile", text("qc.missingFile")))
    counts = {"error": 0, "warning": 0, "info": 0}
    for item in issues:
        counts[item["severity"]] = counts.get(item["severity"], 0) + 1
    report = []
    for code, count in consistency.items():
        if count:
            report.append({"code": code, "count": count, "message": text(f"qc.{code}")})
    classes = []
    for _index, key in pairs:
        row = distribution.get(key)
        if row is None:
            continue
        classes.append({
            "key": key,
            "count": row["count"],
            "images": len(row["images"]),
            "tiny": row["tiny"],
            "outside": row["outside"],
        })
    return {
        "issues": issues,
        "counts": counts,
        "distribution": classes,
        "consistency": report,
        "queue": queue,
        "missingLabels": consistency["unlabeled"],
    }


def _geometry_code(problem: str) -> str:
    if "outside" in problem:
        return "outside"
    if "zero" in problem:
        return "zero"
    if problem.startswith("raw"):
        return "raw"
    return "geometry"


def _aabb(geometry: dict) -> tuple[float, float, float, float] | None:
    kind = geometry.get("type")
    try:
        if kind == "bbox":
            return (float(geometry["x"]), float(geometry["y"]), float(geometry["width"]), float(geometry["height"]))
        if kind == "polygon":
            points = geometry.get("points") or []
            xs = [float(point["x"]) for point in points]
            ys = [float(point["y"]) for point in points]
        elif kind == "obb":
            points = geometry.get("corners") or []
            xs = [float(point["x"]) for point in points]
            ys = [float(point["y"]) for point in points]
        elif kind == "pose":
            box = geometry.get("box")
            if isinstance(box, dict) and {"x", "y", "width", "height"} <= set(box):
                return (float(box["x"]), float(box["y"]), float(box["width"]), float(box["height"]))
            points = geometry.get("keypoints") or []
            xs = [float(point["x"]) for point in points]
            ys = [float(point["y"]) for point in points]
        else:
            return None
        if not xs or not ys:
            return None
        return (min(xs), min(ys), max(xs) - min(xs), max(ys) - min(ys))
    except (KeyError, TypeError, ValueError):
        return None


def _iou(a: tuple[float, float, float, float], b: tuple[float, float, float, float]) -> float:
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    iw = min(ax + aw, bx + bw) - max(ax, bx)
    ih = min(ay + ah, by + bh) - max(ay, by)
    if iw <= 0 or ih <= 0:
        return 0.0
    inter = iw * ih
    union = aw * ah + bw * bh - inter
    if union <= 0:
        return 0.0
    return inter / union


def _issue(image, ann_id, severity, code, message, params: dict | None = None) -> dict:
    return {
        "imageId": image["id"],
        "image": image["name"],
        "annotationId": ann_id,
        "severity": severity,
        "code": code,
        "message": message,
        "params": params or {},
    }
