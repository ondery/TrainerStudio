"""YOLO, COCO and Pascal VOC exports, plus a stratified split. Never writes the source dataset."""

from __future__ import annotations

import json
from html import escape
from pathlib import Path

from trainer_studio.errors import StudioError
from trainer_studio.messages import text
from trainer_studio.yamlids import index_for_key
from trainer_studio.yolo import FORMAT_NOTES, render_text


def assign_splits(rows: list[dict], ratios: dict[str, float]) -> dict[str, str]:
    """Spread each class combination across train, val and test. ``rows`` stay in caller order."""
    names = ("train", "val", "test")
    count = len(rows)
    if count == 0:
        return {}
    raw = [ratios[name] * count for name in names]
    targets = [int(value) for value in raw]
    leftover = count - sum(targets)
    order = sorted(range(3), key=lambda index: (raw[index] - targets[index], -index), reverse=True)
    for index in range(leftover):
        targets[order[index]] += 1
    capacity = dict(zip(names, targets))
    groups: dict[tuple[str, ...], list[str]] = {}
    for row in rows:
        groups.setdefault(tuple(sorted(row["keys"])), []).append(row["id"])
    assignment: dict[str, str] = {}
    for signature in sorted(groups):
        ids = groups[signature]
        group = len(ids)
        graw = [ratios[name] * group for name in names]
        gcounts = [int(value) for value in graw]
        rest = group - sum(gcounts)
        gorder = sorted(range(3), key=lambda index: (graw[index] - gcounts[index], -index), reverse=True)
        for index in range(rest):
            gcounts[gorder[index]] += 1
        slots: list[str] = []
        for name, wanted in zip(names, gcounts):
            take = min(wanted, capacity[name])
            slots.extend([name] * take)
            capacity[name] -= take
        while len(slots) < group:
            dest = max(names, key=lambda name: capacity[name])
            if capacity[dest] <= 0:
                dest = max(names, key=lambda name: capacity[name])
                break
            slots.append(dest)
            capacity[dest] -= 1
        for image_id, split in zip(ids, slots):
            assignment[image_id] = split
    for row in rows:
        assignment.setdefault(row["id"], "train")
    return assignment


CORE_FORMATS = {"yolo", "coco", "voc", "createml", "cvat", "labelme", "kitti", "darknet", "openimages"}
_EXPORTERS: dict[str, tuple[str, object]] = {}


def register_exporter(export_id: str, title: str, fn) -> None:
    _EXPORTERS[export_id] = (title, fn)


def exporter_catalog() -> list[dict]:
    return [{"id": key, "title": title} for key, (title, _fn) in _EXPORTERS.items()]


def write_export(conn, project, pairs: list[tuple[int, str]], task: str, target: Path, fmt: str, grouped: bool, precision: int = 6, skip_empty: bool = False) -> dict:
    root = Path(project["root"])
    custom = _EXPORTERS.get(fmt)
    if fmt not in CORE_FORMATS and custom is None:
        raise StudioError(code="export.format")
    if _unsafe(target, root):
        raise StudioError(code="export.unsafe")
    names = [name for _index, name in pairs]
    images = conn.execute("SELECT * FROM images WHERE project_id = ? ORDER BY sort_index", (project["id"],)).fetchall()
    errors = []
    warnings = []
    pending = 0
    target.mkdir(parents=True, exist_ok=True)
    buckets: dict[str, list] = {"train": [], "val": [], "test": [], "all": []}
    for image in images:
        split = image["split"] if image["split"] in {"train", "val", "test"} else "train"
        buckets[split].append(image)
        buckets["all"].append(image)
    groups = [("all", images)] if not grouped else [(name, buckets[name]) for name in ("train", "val", "test")]
    if fmt == "yolo":
        _yolo(conn, groups, pairs, task, target, names, errors, warnings, grouped, root, precision, skip_empty)
    elif fmt == "coco":
        pending += _coco(conn, groups, pairs, target, names, errors)
    elif fmt == "voc":
        pending += _voc(conn, groups, pairs, target, errors)
    elif custom is not None:
        pending += int(custom[1](conn, groups, pairs, target, errors) or 0)
    else:
        pending += _extra(fmt, conn, groups, pairs, target, errors)
    if pending:
        warnings.append(text("export.pendingSkipped"))
    manifest = {
        "source": str(root),
        "task": task,
        "format": fmt,
        "grouped": grouped,
        "imagesCopied": False,
        "note": text("export.splitNote") if grouped else text("export.note"),
        "formats": FORMAT_NOTES,
    }
    (target / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return {
        "errors": errors,
        "warnings": warnings,
        "dest": str(target),
        "task": task,
        "format": fmt,
        "formats": FORMAT_NOTES,
        "ok": not errors,
        "imagesCopied": False,
    }


def _unsafe(target: Path, root: Path) -> bool:
    labels = (root / "labels").resolve()
    yaml_path = (root / "data.yaml").resolve()
    try:
        resolved = target.resolve()
    except OSError:
        return True
    if resolved == yaml_path or resolved == root.resolve() or resolved == labels:
        return True
    return resolved.is_relative_to(labels)


def _annotations_of(conn, image) -> list[dict]:
    from trainer_studio.service import _annotations

    return _annotations(conn, image["project_id"], image["id"])


def _committed(conn, image, pairs, errors) -> list[tuple[int, str, dict]]:
    rows = []
    for ann in _annotations_of(conn, image):
        if (ann.get("attributes") or {}).get("review") == "pending":
            continue
        key = ann["classId"]
        geometry = ann["geometry"]
        if geometry.get("type") == "raw":
            index = ann["attributes"].get("_yamlIndex", 0)
            rows.append((int(index), key or "", geometry))
            continue
        index = index_for_key(pairs, key)
        if index is None:
            errors.append({"image": image["id"], "issue": text("export.classMissing", key=key)})
            continue
        rows.append((index, key, geometry))
    return rows


def _yolo(conn, groups, pairs, task, target: Path, names, errors, warnings, grouped: bool, root: Path, precision: int = 6, skip_empty: bool = False) -> None:
    lists: dict[str, list[str]] = {}
    for split, images in groups:
        folder = target / "labels" if split == "all" else target / split / "labels"
        folder.mkdir(parents=True, exist_ok=True)
        lists[split] = []
        for image in images:
            rows = [(index, geometry) for index, _key, geometry in _committed(conn, image, pairs, errors)]
            if skip_empty and not rows:
                continue
            rendered = render_text(rows, image["width"], image["height"], task, precision)
            (folder / f"{image['stem']}.txt").write_text(rendered, encoding="utf-8")
            lists[split].append(image["rel_path"])
    names_map = {index: name for index, name in enumerate(names)}
    if grouped:
        yaml_payload = {"path": str(root), "train": "train/labels", "val": "val/labels", "test": "test/labels", "names": names_map}
    else:
        yaml_payload = {"path": str(root), "train": "images", "val": "images", "names": names_map}
    if task == "pose":
        yaml_payload["kpt_shape"] = [17, 3]
        warnings.append(text("export.poseShape"))
    (target / "data.yaml").write_text(__import__("yaml").safe_dump(yaml_payload, allow_unicode=True, sort_keys=False), encoding="utf-8")
    (target / "splits.json").write_text(json.dumps(lists, ensure_ascii=False, indent=2), encoding="utf-8")


def _box(geometry: dict) -> tuple[float, float, float, float] | None:
    from trainer_studio.qc import _aabb

    return _aabb(geometry)


def _coco(conn, groups, pairs, target: Path, names, errors) -> int:
    skipped_total = 0
    out = target / "annotations"
    out.mkdir(parents=True, exist_ok=True)
    for split, images in groups:
        payload, skipped = _coco_one(conn, images, pairs, names, errors)
        skipped_total += skipped
        name = "instances.json" if split == "all" else f"instances_{split}.json"
        (out / name).write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    return skipped_total


def _coco_one(conn, images, pairs, names, errors) -> tuple[dict, int]:
    coco_images = []
    annotations = []
    skipped = 0
    ann_id = 1
    for image_id, image in enumerate(images, start=1):
        coco_images.append({
            "id": image_id,
            "file_name": image["rel_path"],
            "width": image["width"],
            "height": image["height"],
        })
        for ann in _annotations_of(conn, image):
            if (ann.get("attributes") or {}).get("review") == "pending":
                skipped += 1
                continue
            geometry = ann["geometry"]
            if geometry.get("type") == "raw":
                continue
            index = index_for_key(pairs, ann["classId"])
            if index is None:
                errors.append({"image": image["id"], "issue": text("export.classMissing", key=ann["classId"])})
                continue
            box = _box(geometry)
            if box is None:
                continue
            x, y, w, h = box
            item = {
                "id": ann_id,
                "image_id": image_id,
                "category_id": index,
                "bbox": [round(x, 2), round(y, 2), round(w, 2), round(h, 2)],
                "area": round(max(w, 0) * max(h, 0), 2),
                "iscrowd": 0,
            }
            if geometry.get("type") == "polygon":
                flat = []
                for point in geometry.get("points") or []:
                    flat.extend([float(point["x"]), float(point["y"])])
                item["segmentation"] = [flat]
            elif geometry.get("type") == "obb":
                flat = []
                for point in geometry.get("corners") or []:
                    flat.extend([float(point["x"]), float(point["y"])])
                item["segmentation"] = [flat]
            elif geometry.get("type") == "pose":
                keypoints = []
                visible = 0
                for point in geometry.get("keypoints") or []:
                    visibility = int(point.get("visibility") or 0)
                    keypoints.extend([round(float(point.get("x") or 0), 2), round(float(point.get("y") or 0), 2), visibility])
                    if visibility > 0:
                        visible += 1
                item["keypoints"] = keypoints
                item["num_keypoints"] = visible
            annotations.append(item)
            ann_id += 1
    return {
        "images": coco_images,
        "annotations": annotations,
        "categories": [{"id": index, "name": name} for index, name in enumerate(names)],
    }, skipped


def _voc(conn, groups, pairs, target: Path, errors) -> int:
    skipped = 0
    for split, images in groups:
        folder = target / "Annotations" if split == "all" else target / split / "Annotations"
        folder.mkdir(parents=True, exist_ok=True)
        for image in images:
            xml, missed = _voc_image(conn, image, pairs, errors)
            skipped += missed
            (folder / f"{image['stem']}.xml").write_text(xml, encoding="utf-8")
    return skipped


def _voc_image(conn, image, pairs, errors) -> tuple[str, int]:
    objects = []
    skipped = 0
    for ann in _annotations_of(conn, image):
        if (ann.get("attributes") or {}).get("review") == "pending":
            skipped += 1
            continue
        geometry = ann["geometry"]
        if geometry.get("type") == "raw":
            continue
        if index_for_key(pairs, ann["classId"]) is None:
            errors.append({"image": image["id"], "issue": text("export.classMissing", key=ann["classId"])})
            continue
        box = _box(geometry)
        if box is None:
            continue
        x, y, w, h = box
        xmin = max(0, int(round(x)))
        ymin = max(0, int(round(y)))
        xmax = int(round(x + w))
        ymax = int(round(y + h))
        polygon = ""
        if geometry.get("type") == "polygon":
            points = "".join(
                f"<pt><x>{int(round(float(point['x'])))}</x><y>{int(round(float(point['y'])))}</y></pt>"
                for point in geometry.get("points") or []
            )
            polygon = f"<polygon>{points}</polygon>"
        objects.append(
            f"  <object><name>{escape(ann['classId'])}</name>"
            f"<bndbox><xmin>{xmin}</xmin><ymin>{ymin}</ymin><xmax>{xmax}</xmax><ymax>{ymax}</ymax></bndbox>"
            f"{polygon}</object>"
        )
    body = "\n".join(objects)
    xml = (
        "<annotation>\n"
        f"  <folder>images</folder>\n  <filename>{escape(image['name'])}</filename>\n"
        f"  <size><width>{int(image['width'])}</width><height>{int(image['height'])}</height><depth>3</depth></size>\n"
        f"{body}\n</annotation>\n"
    )
    return xml, skipped


def _extra(fmt: str, conn, groups, pairs, target: Path, errors) -> int:
    writers = {
        "createml": _createml,
        "cvat": _cvat,
        "labelme": _labelme,
        "kitti": _kitti,
        "darknet": _darknet,
        "openimages": _openimages,
    }
    writer = writers.get(fmt)
    if writer is None:
        raise StudioError(code="export.format")
    return writer(conn, groups, pairs, target, errors)


def _rows(conn, image, pairs, errors):
    found = []
    skipped = 0
    for ann in _annotations_of(conn, image):
        if (ann.get("attributes") or {}).get("review") == "pending":
            skipped += 1
            continue
        geometry = ann.get("geometry") or {}
        if geometry.get("type") == "raw":
            continue
        if index_for_key(pairs, ann["classId"]) is None:
            errors.append({"image": image["id"], "issue": text("export.classMissing", key=ann["classId"])})
            continue
        box = _box(geometry)
        if box is None:
            continue
        found.append((ann, box))
    return found, skipped


def _createml(conn, groups, pairs, target: Path, errors) -> int:
    skipped = 0
    payload = []
    for _split, images in groups:
        for image in images:
            rows, missed = _rows(conn, image, pairs, errors)
            skipped += missed
            annotations = []
            for ann, (x, y, w, h) in rows:
                annotations.append({
                    "label": ann["classId"],
                    "coordinates": {"x": round(x + w / 2, 2), "y": round(y + h / 2, 2), "width": round(w, 2), "height": round(h, 2)},
                })
            payload.append({"image": image["name"], "annotations": annotations})
    (target / "createml.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return skipped


def _cvat(conn, groups, pairs, target: Path, errors) -> int:
    skipped = 0
    images = []
    image_id = 0
    for _split, rows in groups:
        for image in rows:
            found, missed = _rows(conn, image, pairs, errors)
            skipped += missed
            shapes = []
            for ann, (x, y, w, h) in found:
                geometry = ann["geometry"]
                if geometry.get("type") == "polygon":
                    points = ";".join(f"{float(point['x']):.2f},{float(point['y']):.2f}" for point in geometry.get("points") or [])
                    shapes.append(f'<polygon label="{escape(ann["classId"])}" points="{points}" occluded="0"/>')
                else:
                    shapes.append(
                        f'<box label="{escape(ann["classId"])}" xtl="{x:.2f}" ytl="{y:.2f}" xbr="{x + w:.2f}" ybr="{y + h:.2f}" occluded="0"/>'
                    )
            body = "".join(shapes)
            images.append(
                f'<image id="{image_id}" name="{escape(image["name"])}" width="{int(image["width"])}" height="{int(image["height"])}">{body}</image>'
            )
            image_id += 1
    xml = "<annotations><version>1.1</version>" + "".join(images) + "</annotations>\n"
    (target / "annotations.xml").write_text(xml, encoding="utf-8")
    return skipped


def _labelme(conn, groups, pairs, target: Path, errors) -> int:
    skipped = 0
    folder = target / "labelme"
    folder.mkdir(parents=True, exist_ok=True)
    for _split, images in groups:
        for image in images:
            found, missed = _rows(conn, image, pairs, errors)
            skipped += missed
            shapes = []
            for ann, (x, y, w, h) in found:
                geometry = ann["geometry"]
                if geometry.get("type") == "polygon":
                    points = [[float(point["x"]), float(point["y"])] for point in geometry.get("points") or []]
                    shape_type = "polygon"
                else:
                    points = [[x, y], [x + w, y + h]]
                    shape_type = "rectangle"
                shapes.append({"label": ann["classId"], "points": points, "shape_type": shape_type})
            payload = {
                "version": "5.0.1",
                "shapes": shapes,
                "imagePath": image["name"],
                "imageHeight": int(image["height"]),
                "imageWidth": int(image["width"]),
            }
            (folder / f"{image['stem']}.json").write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    return skipped


def _kitti(conn, groups, pairs, target: Path, errors) -> int:
    skipped = 0
    folder = target / "kitti"
    folder.mkdir(parents=True, exist_ok=True)
    for _split, images in groups:
        for image in images:
            found, missed = _rows(conn, image, pairs, errors)
            skipped += missed
            lines = []
            for ann, (x, y, w, h) in found:
                lines.append(f"{ann['classId']} 0 0 0 {x:.2f} {y:.2f} {x + w:.2f} {y + h:.2f} 0 0 0 0 0 0 0")
            (folder / f"{image['stem']}.txt").write_text("\n".join(lines) + ("\n" if lines else ""), encoding="utf-8")
    return skipped


def _darknet(conn, groups, pairs, target: Path, errors) -> int:
    skipped = 0
    folder = target / "darknet"
    folder.mkdir(parents=True, exist_ok=True)
    names = []
    for _split, images in groups:
        for image in images:
            found, missed = _rows(conn, image, pairs, errors)
            skipped += missed
            lines = []
            for ann, (x, y, w, h) in found:
                if ann["classId"] not in names:
                    names.append(ann["classId"])
                lines.append(f"{names.index(ann['classId'])} {x:.2f} {y:.2f} {w:.2f} {h:.2f}")
            (folder / f"{image['stem']}.txt").write_text("\n".join(lines) + ("\n" if lines else ""), encoding="utf-8")
    (folder / "classes.txt").write_text("\n".join(names) + ("\n" if names else ""), encoding="utf-8")
    return skipped


def _openimages(conn, groups, pairs, target: Path, errors) -> int:
    skipped = 0
    lines = ["ImageID,LabelName,XMin,YMin,XMax,YMax"]
    for _split, images in groups:
        for image in images:
            found, missed = _rows(conn, image, pairs, errors)
            skipped += missed
            width = max(1, int(image["width"]))
            height = max(1, int(image["height"]))
            for ann, (x, y, w, h) in found:
                lines.append(
                    f"{image['stem']},{ann['classId']},{x / width:.6f},{y / height:.6f},{(x + w) / width:.6f},{(y + h) / height:.6f}"
                )
    (target / "openimages.csv").write_text("\n".join(lines) + "\n", encoding="utf-8")
    return skipped
