"""Task JSON for the image tools this studio can edit.

Coordinates are percentages of the image after ``image_rotation``.
``original_width`` and ``original_height`` are the size before that rotation.
This module converts both ways. It does not download remote media.

Region types that are not boxes, polygons, oriented boxes or poses are kept as
those shapes for the canvas, and the original value is kept so an untouched
region exports as the same brush, bitmask, ellipse, vector or video keyframe.
Predictions stay out of the label file until review accepts them.
"""

from __future__ import annotations

import math
import re
import xml.etree.ElementTree as ElementTree
from pathlib import Path

from trainer_studio.errors import StudioError
from trainer_studio.schema import clean_fields

_ID = re.compile(r"[^A-Za-z0-9_.:-]+")
_SHAPE = {
    "rectanglelabels",
    "rectangle",
    "polygonlabels",
    "polygon",
    "ellipselabels",
    "ellipse",
    "keypointlabels",
    "keypoint",
    "brushlabels",
    "brush",
    "bitmasklabels",
    "bitmask",
    "vectorlabels",
    "vector",
    "videorectangle",
    "labels",
}
_CONTROL = {"choices", "taxonomy", "textarea", "number", "rating", "datetime"}
_LABEL_KEY = {
    "rectanglelabels": "rectanglelabels",
    "rectangle": "rectanglelabels",
    "polygonlabels": "polygonlabels",
    "polygon": "polygonlabels",
    "ellipselabels": "ellipselabels",
    "ellipse": "ellipselabels",
    "keypointlabels": "keypointlabels",
    "keypoint": "keypointlabels",
    "brushlabels": "brushlabels",
    "brush": "brushlabels",
    "bitmasklabels": "bitmasklabels",
    "bitmask": "bitmasklabels",
    "vectorlabels": "vectorlabels",
    "vector": "vectorlabels",
    "videorectangle": "labels",
    "labels": "labels",
}


def fit_id(value) -> str:
    return _ID.sub("", str(value or ""))[:80]


def slug(value: str) -> str:
    text = re.sub(r"[^a-z0-9_]+", "_", (value or "").strip().lower()).strip("_")
    if not text or not text[0].isalpha():
        text = f"field_{text}".strip("_")
    return text[:40]


def geometry_fingerprint(geometry: dict) -> str:
    kind = geometry.get("type")
    nums: list[float] = []
    if kind == "bbox":
        nums = [_num(geometry.get(key)) for key in ("x", "y", "width", "height")]
    elif kind == "polygon":
        nums = [_num(point.get(key)) for point in geometry.get("points") or [] for key in ("x", "y")]
    elif kind == "obb":
        nums = [_num(point.get(key)) for point in geometry.get("corners") or [] for key in ("x", "y")]
    elif kind == "pose":
        box = geometry.get("box") or {}
        nums = [_num(box.get(key)) for key in ("x", "y", "width", "height")]
        for point in geometry.get("keypoints") or []:
            nums.extend((_num(point.get("x")), _num(point.get("y")), float(int(point.get("visibility", 2)))))
    return ",".join(f"{value:.2f}" for value in nums)


def parse_config(xml_text: str) -> dict:
    """Labeling-config XML to class labels and schema fields. No project files are written."""
    if not isinstance(xml_text, str) or not xml_text.strip():
        return {"labels": [], "fields": [], "suggestedTask": "detect"}
    if len(xml_text) > 1_000_000:
        raise StudioError(code="tasks.payload")
    try:
        root = ElementTree.fromstring(xml_text)
    except ElementTree.ParseError as exc:
        raise StudioError(code="tasks.payload") from exc
    labels: list[dict] = []
    fields: list[dict] = []
    tools: set[str] = set()
    for node in root.iter():
        tag = _local(node.tag)
        if tag in {"RectangleLabels", "PolygonLabels", "EllipseLabels", "KeyPointLabels", "BrushLabels", "BitmaskLabels", "VectorLabels", "Labels", "VideoRectangle"}:
            tools.add(tag)
            for child in node.iter():
                if _local(child.tag) != "Label":
                    continue
                value = str(child.attrib.get("value") or "").strip()
                if not value:
                    continue
                labels.append({
                    "value": value,
                    "hotkey": str(child.attrib.get("hotkey") or "")[:1],
                    "color": _color(child.attrib.get("background")),
                })
        if tag in {"Choices", "Taxonomy", "TextArea", "Number", "Rating", "DateTime"}:
            field = _field_from_tag(node, tag)
            if field:
                fields.append(field)
    suggested = "detect"
    if "VideoRectangle" in tools:
        suggested = "detect"
    elif tools & {"PolygonLabels", "BrushLabels", "BitmaskLabels"} and not (tools & {"RectangleLabels", "KeyPointLabels"}):
        suggested = "segment"
    elif "KeyPointLabels" in tools and "RectangleLabels" not in tools:
        suggested = "pose"
    return {"labels": _unique_labels(labels), "fields": clean_fields(fields), "suggestedTask": suggested}


def decode_rle(rle: list[int]) -> list[int]:
    """Brush run-length bytes to a flat buffer."""
    stream = _BitStream(_bytes_to_bits([int(item) & 255 for item in rle]))
    count = stream.read(32)
    word_size = stream.read(5) + 1
    sizes = [stream.read(4) + 1 for _ in range(4)]
    if count <= 0 or count > 64_000_000 or word_size > 32:
        raise ValueError("rle")
    out = [0] * count
    index = 0
    while index < count:
        flag = stream.read(1)
        run = index + 1 + stream.read(sizes[stream.read(2)])
        run = min(run, count)
        if flag:
            value = stream.read(word_size) & 0xFF
            for cursor in range(index, run):
                out[cursor] = value
            index = run
        else:
            while index < run:
                out[index] = stream.read(word_size) & 0xFF
                index += 1
    return out


def encode_rle(values: list[int]) -> list[int]:
    """Inverse of ``decode_rle`` for an 8-bit buffer, including the encoder's aligned padding."""
    numbits = f"{len(values):032b}"
    header = numbits + f"{8 - 1:05b}" + "".join(f"{size - 1:04b}" for size in (3, 4, 8, 16))
    body = []
    for length, value in _runs(values):
        if length == 1:
            body.append("0" + "00" + "000" + f"{value & 255:08b}")
            continue
        remaining = length
        while remaining > 0:
            if remaining <= 8:
                take, bits, code = remaining, 3, "00"
            elif remaining <= 16:
                take, bits, code = remaining, 4, "01"
            elif remaining <= 256:
                take, bits, code = remaining, 8, "10"
            else:
                take, bits, code = min(remaining, 2**16), 16, "11"
            body.append("1" + code + f"{take - 1:0{bits}b}" + f"{value & 255:08b}")
            remaining -= take
    packed = header + "".join(body)
    pad = 8 - (len(packed) % 8)
    packed += "0" * pad
    return [int(packed[index:index + 8], 2) for index in range(0, len(packed), 8)]


def mask_from_rle(rle: list[int], width: int, height: int) -> list[int] | None:
    if width <= 0 or height <= 0:
        return None
    try:
        decoded = decode_rle(rle)
    except (ValueError, IndexError, ZeroDivisionError):
        return None
    need = width * height * 4
    if len(decoded) < need:
        return None
    return [1 if decoded[(index * 4) + 3] else 0 for index in range(width * height)]


def polygons_from_mask(mask: list[int], width: int, height: int) -> list[list[tuple[float, float]]]:
    if width <= 0 or height <= 0 or len(mask) < width * height:
        return []
    seen = bytearray(width * height)
    polygons = []
    for y in range(height):
        for x in range(width):
            start = y * width + x
            if not mask[start] or seen[start]:
                continue
            pixels: list[tuple[int, int]] = []
            stack = [(x, y)]
            minx = maxx = x
            miny = maxy = y
            while stack:
                cx, cy = stack.pop()
                if cx < 0 or cy < 0 or cx >= width or cy >= height:
                    continue
                index = cy * width + cx
                if seen[index] or not mask[index]:
                    continue
                seen[index] = 1
                pixels.append((cx, cy))
                minx, maxx = min(minx, cx), max(maxx, cx)
                miny, maxy = min(miny, cy), max(maxy, cy)
                stack.extend(((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)))
            if len(pixels) == (maxx - minx + 1) * (maxy - miny + 1):
                polygons.append([(minx, miny), (maxx + 1, miny), (maxx + 1, maxy + 1), (minx, maxy + 1)])
                continue
            outline = _angle_outline(pixels)
            if len(outline) >= 3:
                polygons.append(outline)
    return polygons


def split_payload(payload) -> tuple[list, dict, str]:
    if isinstance(payload, list):
        return payload, {}, ""
    if not isinstance(payload, dict):
        raise StudioError(code="tasks.payload")
    config = payload.get("label_config") if isinstance(payload.get("label_config"), str) else payload.get("config")
    config_text = config if isinstance(config, str) else ""
    wrapped = any(key in payload for key in ("tasks", "createClasses", "config", "label_config"))
    if wrapped:
        tasks = payload.get("tasks")
        if tasks is None and ("data" in payload or "annotations" in payload or "predictions" in payload):
            tasks = [payload]
        if tasks is None:
            tasks = []
        if not isinstance(tasks, list):
            raise StudioError(code="tasks.payload")
        return tasks, payload, config_text
    if "data" in payload or "annotations" in payload or "predictions" in payload:
        return [payload], {}, ""
    raise StudioError(code="tasks.payload")


def media_name(data: dict) -> tuple[str, str, bool]:
    raw = ""
    if isinstance(data, dict):
        value = data.get("image")
        if value in (None, ""):
            value = data.get("video")
        if isinstance(value, dict):
            value = value.get("url") or value.get("path") or ""
        raw = str(value or "").strip()
    remote = raw.startswith("http://") or raw.startswith("https://")
    name = Path(raw.split("?", 1)[0].replace("\\", "/")).name
    return raw, name, remote


def match_image(data: dict, meta: dict, images: list[dict]) -> tuple[dict | None, str]:
    raw, name, remote = media_name(data)
    if not raw and not (isinstance(meta, dict) and meta.get("image_id")):
        return None, "tasks.unsupported"
    image_id = str((meta or {}).get("image_id") or "")
    stem = Path(name).stem if name else ""
    norm = raw.replace("\\", "/").lstrip("./")
    for image in images:
        if image_id and image["id"] == image_id:
            return image, ""
    for image in images:
        rel = str(image.get("rel") or "").replace("\\", "/")
        image_name = str(image.get("name") or "")
        if name and (name == image_name or name == image["id"] or stem == image["id"]):
            return image, ""
        if norm and rel and (norm == rel or norm.endswith("/" + rel)):
            return image, ""
    return None, "tasks.url" if remote else "tasks.noImage"


def convert_results(results, file_w: int, file_h: int) -> dict:
    """One annotation or prediction ``result`` list. Geometry is in file pixels."""
    annotations: list[dict] = []
    failures: list[dict] = []
    relations: list[dict] = []
    preserved: list[dict] = []
    timeline: list[dict] = []
    image_values: dict = {}
    fields: list[dict] = []
    shapes = 0
    pending_controls: list[dict] = []
    if not isinstance(results, list):
        return _converted(annotations, failures, relations, preserved, timeline, image_values, fields, shapes)
    regions: dict[str, dict] = {}
    order: list[str] = []
    for item in results:
        if not isinstance(item, dict):
            continue
        kind = str(item.get("type") or "").lower()
        if kind == "relation":
            relations.append(_relation(item))
            continue
        if kind == "timelinelabels":
            timeline.append(item)
            continue
        if kind in _CONTROL:
            pending_controls.append(item)
            continue
        if kind not in _SHAPE:
            preserved.append(item)
            continue
        built = _shape(item, file_w, file_h)
        if built is None:
            failures.append({"code": "tasks.shape", "params": {"kind": kind}})
            preserved.append(item)
            continue
        shapes += 1
        region_id = fit_id(item.get("id")) or f"r{len(order)}"
        region = regions.get(region_id)
        if region is None:
            region = {"id": region_id, "parts": []}
            regions[region_id] = region
            order.append(region_id)
        built["source_id"] = region_id
        region["parts"].append(built)
    order = _fold_pose(regions, order)
    for item in pending_controls:
        _attach_control(item, regions, image_values, fields)
    for region_id in order:
        merged = _merge_region(regions[region_id], file_w, file_h)
        if merged is None:
            failures.append({"code": "tasks.shape", "params": {"kind": "region"}})
            continue
        annotations.append(merged)
    return _converted(annotations, failures, relations, preserved, timeline, image_values, fields, shapes)


def choose_annotation(annotations: list) -> tuple[dict | None, list]:
    rows = [item for item in annotations or [] if isinstance(item, dict) and not item.get("was_cancelled")]
    if not rows:
        return None, []
    marked = [item for item in rows if item.get("ground_truth")]
    pool = marked or rows

    def stamp(pair: tuple[int, dict]) -> tuple:
        item = pair[1]
        return (str(item.get("updated_at") or item.get("created_at") or ""), pair[0])

    chosen = max(enumerate(pool), key=stamp)[1]
    return chosen, [item for item in rows if item is not chosen]


def export_result(annotation: dict, file_w: int, file_h: int, names: dict[str, str]) -> list[dict]:
    geometry = annotation.get("geometry") or {}
    attrs = annotation.get("attributes") if isinstance(annotation.get("attributes"), dict) else {}
    book = attrs.get("xchg") if isinstance(attrs.get("xchg"), dict) else {}
    same = book.get("fingerprint") == geometry_fingerprint(geometry)
    kind = str(book.get("kind") or "")
    if same and isinstance(book.get("value"), dict) and kind in _LABEL_KEY and kind != "pose":
        return [_stored_result(annotation, book)]
    label = names.get(str(annotation.get("classId") or "")) or str(annotation.get("classId") or "")
    if geometry.get("type") == "pose":
        return _pose_results(annotation, geometry, label, file_w, file_h, book)
    if geometry.get("type") == "obb":
        return [_obb_result(annotation, geometry, label, file_w, file_h, book)]
    if geometry.get("type") == "polygon":
        return [_polygon_result(annotation, geometry, label, file_w, file_h, book)]
    if geometry.get("type") == "bbox":
        return [_rectangle_result(annotation, geometry, label, file_w, file_h, book, "rectanglelabels")]
    return []


def control_results(annotation_id: str | None, values: dict, fields: list[dict], names: dict[str, str]) -> list[dict]:
    rows = []
    for field in fields:
        if field.get("id") not in values:
            continue
        if annotation_id is None and field.get("scope") != "image":
            continue
        if annotation_id is not None and field.get("scope") == "image":
            continue
        value = values.get(field["id"])
        result = _control_result(field, value)
        if result is None:
            continue
        result["from_name"] = names.get(field["id"]) or field["id"]
        result["to_name"] = "image"
        if annotation_id:
            result["id"] = annotation_id
        rows.append(result)
    return rows


def relations_from(annotations: list[dict], stored: list | None) -> list[dict]:
    ids = {str(item.get("id") or "") for item in annotations}
    rows = []
    seen = set()
    for item in stored or []:
        if not isinstance(item, dict):
            continue
        pair = (str(item.get("from_id") or item.get("from") or ""), str(item.get("to_id") or item.get("to") or ""))
        if pair[0] not in ids or pair[1] not in ids or not pair[0] or pair[0] == pair[1]:
            continue
        if pair in seen:
            continue
        seen.add(pair)
        labels = item.get("labels")
        if not isinstance(labels, list) or not labels:
            labels = [str(item.get("type") or "link")]
        rows.append({
            "type": "relation",
            "from_id": pair[0],
            "to_id": pair[1],
            "direction": "bi" if item.get("direction") in {"bi", "both"} else "right",
            "labels": [str(labels[0])],
        })
    for item in annotations:
        attrs = item.get("attributes") if isinstance(item.get("attributes"), dict) else {}
        target = attrs.get("linkedTo")
        if not isinstance(target, str) or target not in ids:
            continue
        pair = (str(item.get("id") or ""), target)
        if pair in seen or not pair[0] or pair[0] == pair[1]:
            continue
        seen.add(pair)
        label = attrs.get("relationLabel")
        rows.append({
            "type": "relation",
            "from_id": pair[0],
            "to_id": pair[1],
            "direction": "right",
            "labels": [str(label or "link")],
        })
    return rows


def link_attributes(relations: list[dict]) -> dict[str, dict]:
    """Canvas reads ``linkedTo`` on the source region and ``relation`` on the target."""
    extra: dict[str, dict] = {}
    for item in relations:
        source = str(item.get("from_id") or "")
        target = str(item.get("to_id") or "")
        if not source or not target:
            continue
        label = (item.get("labels") or ["link"])[0]
        extra.setdefault(source, {})["linkedTo"] = target
        extra.setdefault(source, {})["relationLabel"] = str(label)
        extra.setdefault(target, {})["relation"] = source
    return extra


def merge_fields(existing: list, incoming: list) -> list[dict]:
    """Union schema fields. A later multi-select widens a single choice; options are kept."""
    by_id: dict[str, dict] = {}
    order: list[str] = []
    for field in clean_fields(existing) + clean_fields(incoming):
        field_id = field["id"]
        if field_id not in by_id:
            by_id[field_id] = dict(field)
            order.append(field_id)
            continue
        current = by_id[field_id]
        options = list(current.get("options") or [])
        known = {item.get("id") for item in options}
        for option in field.get("options") or []:
            if option.get("id") not in known:
                options.append(option)
                known.add(option.get("id"))
        if options:
            current["options"] = options
        if field.get("type") == "multi":
            current["type"] = "multi"
        if field.get("visibleWhen") and "visibleWhen" not in current:
            current["visibleWhen"] = field["visibleWhen"]
        if field.get("scope") == "annotation":
            current["scope"] = "annotation"
    return clean_fields([by_id[item] for item in order])


def class_key(label: str) -> str:
    text = str(label or "").strip()
    if re.fullmatch(r"[A-Za-z_][A-Za-z0-9_-]{0,63}", text):
        return text
    slugged = slug(text).strip("_")
    if re.fullmatch(r"[A-Za-z_][A-Za-z0-9_-]{0,63}", slugged):
        return slugged
    return ""


def resolve_label(label: str, names: list[str]) -> str:
    if label in names:
        return label
    folded = {item.casefold(): item for item in names}
    if label.casefold() in folded:
        return folded[label.casefold()]
    wanted = slug(label)
    for item in names:
        if slug(item) == wanted:
            return item
    return ""


def _converted(annotations, failures, relations, preserved, timeline, image_values, fields, shapes) -> dict:
    return {
        "annotations": annotations,
        "failures": failures,
        "relations": relations,
        "preserved": preserved,
        "timeline": timeline,
        "imageValues": image_values,
        "fields": clean_fields(fields),
        "shapes": shapes,
    }


def _shape(item: dict, file_w: int, file_h: int) -> dict | None:
    kind = str(item.get("type") or "").lower()
    value = dict(item.get("value") or {})
    legacy = value.pop("attributes", None)
    labels = _labels(value, kind)
    if kind == "labels" and not _looks_spatial(value):
        return None
    orig_w = int(item.get("original_width") or file_w or 0)
    orig_h = int(item.get("original_height") or file_h or 0)
    rotation = int(item.get("image_rotation") or 0) % 360
    if rotation not in {0, 90, 180, 270}:
        rotation = 0
    geometry = _geometry(kind, value, orig_w, orig_h, rotation, file_w, file_h)
    if geometry is None:
        return None
    book = {
        "kind": "videorectangle" if kind == "videorectangle" else (_LABEL_KEY.get(kind) or kind),
        "from_name": str(item.get("from_name") or "label"),
        "to_name": str(item.get("to_name") or "image"),
        "value": value,
        "labels": labels,
        "original_width": orig_w,
        "original_height": orig_h,
        "image_rotation": rotation,
        "fingerprint": geometry_fingerprint(geometry),
    }
    attrs = {}
    if isinstance(legacy, dict):
        for key, raw in legacy.items():
            coerced = _jsonable(raw)
            if coerced is not None:
                attrs[slug(str(key)) or str(key)[:40]] = coerced
    if item.get("score") is not None:
        try:
            attrs["score"] = float(item.get("score"))
        except (TypeError, ValueError):
            pass
    return {"kind": book["kind"], "label": labels[0] if labels else "", "labels": labels, "geometry": geometry, "book": book, "attributes": attrs}


def _geometry(kind: str, value: dict, orig_w: int, orig_h: int, rotation: int, file_w: int, file_h: int) -> dict | None:
    if kind in {"rectanglelabels", "rectangle"} or (kind == "labels" and "width" in value and "points" not in value and "rle" not in value):
        return _rectangle_geometry(value, orig_w, orig_h, rotation, file_w, file_h)
    if kind == "videorectangle":
        frame = _video_frame(value)
        if frame is None:
            return None
        return _rectangle_geometry(frame, orig_w or file_w, orig_h or file_h, rotation, file_w, file_h)
    if kind in {"polygonlabels", "polygon"} or (kind == "labels" and "points" in value):
        return _polygon_geometry(value.get("points"), orig_w, orig_h, rotation, file_w, file_h, closed=True)
    if kind in {"ellipselabels", "ellipse"}:
        return _ellipse_geometry(value, orig_w, orig_h, rotation, file_w, file_h)
    if kind in {"keypointlabels", "keypoint"}:
        return _keypoint_geometry(value, orig_w, orig_h, rotation, file_w, file_h)
    if kind in {"brushlabels", "brush", "bitmasklabels", "bitmask"} or (kind == "labels" and "rle" in value):
        return _brush_geometry(value, orig_w, orig_h, file_w, file_h)
    if kind in {"vectorlabels", "vector"}:
        points = value.get("vertices") or value.get("points")
        closed = bool(value.get("closed"))
        return _polygon_geometry(points, orig_w, orig_h, rotation, file_w, file_h, closed=closed)
    return None


def _rectangle_geometry(value: dict, orig_w: int, orig_h: int, rotation: int, file_w: int, file_h: int) -> dict | None:
    try:
        x, y = float(value.get("x")), float(value.get("y"))
        width, height = float(value.get("width")), float(value.get("height"))
        turn = float(value.get("rotation") or 0)
    except (TypeError, ValueError):
        return None
    if width == 0 or height == 0:
        return None
    disp_w, disp_h = _display_size(orig_w, orig_h, rotation)
    left, top = x / 100 * disp_w, y / 100 * disp_h
    box_w, box_h = width / 100 * disp_w, height / 100 * disp_h
    center_x, center_y = left + box_w / 2, top + box_h / 2
    theta = math.radians(turn)
    cosine, sine = math.cos(theta), math.sin(theta)
    corners = []
    for lx, ly in ((-box_w / 2, -box_h / 2), (box_w / 2, -box_h / 2), (box_w / 2, box_h / 2), (-box_w / 2, box_h / 2)):
        rx = center_x + lx * cosine - ly * sine
        ry = center_y + lx * sine + ly * cosine
        ox, oy = _unrotate(rx, ry, orig_w, orig_h, rotation)
        corners.append(_scale(ox, oy, orig_w, orig_h, file_w, file_h))
    if abs(turn) % 360 < 0.01:
        xs = [point[0] for point in corners]
        ys = [point[1] for point in corners]
        return {"type": "bbox", "x": min(xs), "y": min(ys), "width": max(xs) - min(xs), "height": max(ys) - min(ys)}
    return {"type": "obb", "corners": [{"x": point[0], "y": point[1]} for point in corners]}


def _polygon_geometry(raw, orig_w: int, orig_h: int, rotation: int, file_w: int, file_h: int, closed: bool) -> dict | None:
    points = []
    for item in raw or []:
        if isinstance(item, dict) and "x" in item and "y" in item:
            pair = (item.get("x"), item.get("y"))
        elif isinstance(item, (list, tuple)) and len(item) >= 2:
            pair = (item[0], item[1])
        else:
            continue
        try:
            px, py = float(pair[0]), float(pair[1])
        except (TypeError, ValueError):
            continue
        disp_w, disp_h = _display_size(orig_w, orig_h, rotation)
        ox, oy = _unrotate(px / 100 * disp_w, py / 100 * disp_h, orig_w, orig_h, rotation)
        fx, fy = _scale(ox, oy, orig_w, orig_h, file_w, file_h)
        points.append({"x": fx, "y": fy})
    if len(points) == 2 and not closed:
        last = points[-1]
        points.append({"x": last["x"] + 1, "y": last["y"] + 1})
    if len(points) < 3:
        return None
    return {"type": "polygon", "points": points}


def _ellipse_geometry(value: dict, orig_w: int, orig_h: int, rotation: int, file_w: int, file_h: int) -> dict | None:
    try:
        cx, cy = float(value.get("x")), float(value.get("y"))
        rx, ry = float(value.get("radiusX")), float(value.get("radiusY"))
        turn = float(value.get("rotation") or 0)
    except (TypeError, ValueError):
        return None
    if rx == 0 or ry == 0:
        return None
    disp_w, disp_h = _display_size(orig_w, orig_h, rotation)
    center = (cx / 100 * disp_w, cy / 100 * disp_h)
    radius = (rx / 100 * disp_w, ry / 100 * disp_h)
    theta = math.radians(turn)
    cosine, sine = math.cos(theta), math.sin(theta)
    points = []
    for step in range(32):
        angle = 2 * math.pi * step / 32
        ex, ey = radius[0] * math.cos(angle), radius[1] * math.sin(angle)
        rx_ = center[0] + ex * cosine - ey * sine
        ry_ = center[1] + ex * sine + ey * cosine
        ox, oy = _unrotate(rx_, ry_, orig_w, orig_h, rotation)
        fx, fy = _scale(ox, oy, orig_w, orig_h, file_w, file_h)
        points.append({"x": fx, "y": fy})
    return {"type": "polygon", "points": points}


def _keypoint_geometry(value: dict, orig_w: int, orig_h: int, rotation: int, file_w: int, file_h: int) -> dict | None:
    try:
        px, py = float(value.get("x")), float(value.get("y"))
    except (TypeError, ValueError):
        return None
    disp_w, disp_h = _display_size(orig_w, orig_h, rotation)
    ox, oy = _unrotate(px / 100 * disp_w, py / 100 * disp_h, orig_w, orig_h, rotation)
    fx, fy = _scale(ox, oy, orig_w, orig_h, file_w, file_h)
    size = max(2.0, min(file_w, file_h) * 0.01) if file_w and file_h else 2.0
    box = {
        "x": min(max(0.0, fx - size / 2), max(0.0, file_w - size)),
        "y": min(max(0.0, fy - size / 2), max(0.0, file_h - size)),
        "width": size if file_w else size,
        "height": size if file_h else size,
    }
    return {"type": "pose", "box": box, "keypoints": [{"x": fx, "y": fy, "visibility": 2}]}


def _brush_geometry(value: dict, orig_w: int, orig_h: int, file_w: int, file_h: int) -> dict | None:
    rle = value.get("rle")
    if not isinstance(rle, list) or orig_w <= 0 or orig_h <= 0:
        return None
    mask = mask_from_rle(rle, orig_w, orig_h)
    if not mask:
        return None
    polygons = polygons_from_mask(mask, orig_w, orig_h)
    if not polygons:
        return None
    points = []
    scale_x = file_w / orig_w if orig_w else 1
    scale_y = file_h / orig_h if orig_h else 1
    for px, py in polygons[0]:
        points.append({"x": px * scale_x, "y": py * scale_y})
    if len(points) < 3:
        return None
    return {"type": "polygon", "points": points}


def _merge_region(region: dict, file_w: int, file_h: int) -> dict | None:
    parts = region["parts"]
    keypoints = [part for part in parts if part["kind"] == "keypointlabels"]
    shapes = [part for part in parts if part["kind"] != "keypointlabels"]
    primary = shapes[0] if shapes else (keypoints[0] if keypoints else None)
    if primary is None:
        return None
    geometry = primary["geometry"]
    book = dict(primary["book"])
    book["classKey"] = ""
    attributes = dict(primary["attributes"])
    label = primary["label"]
    labels = list(primary["labels"])
    if len(keypoints) > 1 or (keypoints and shapes and shapes[0]["kind"] in {"rectanglelabels", "rectangle"}):
        indexed = []
        for index, part in enumerate(keypoints):
            found = re.search(r":k(\d+)$", str(part.get("source_id") or ""))
            indexed.append((int(found.group(1)) if found else index, part))
        indexed.sort()
        box = geometry.get("box") if geometry.get("type") == "pose" else _bounds(geometry)
        points = []
        cursor = 0
        for position, part in indexed:
            while cursor < position:
                points.append({"x": 0, "y": 0, "visibility": 0})
                cursor += 1
            point = (part["geometry"].get("keypoints") or [{}])[0]
            points.append({"x": _num(point.get("x")), "y": _num(point.get("y")), "visibility": 2})
            cursor += 1
        if len(points) >= 1 and box:
            geometry = {"type": "pose", "box": box, "keypoints": points}
            book = dict(book)
            book["kind"] = "pose"
            book["fingerprint"] = geometry_fingerprint(geometry)
            label = shapes[0]["label"] if shapes else keypoints[0]["label"]
            labels = shapes[0]["labels"] if shapes else keypoints[0]["labels"]
    for part in parts:
        for key, value in part["attributes"].items():
            attributes.setdefault(key, value)
    if not label:
        return None
    book["fingerprint"] = geometry_fingerprint(geometry)
    book["labels"] = labels
    attributes["xchg"] = book
    if file_w < 0 or file_h < 0:
        return None
    return {"id": region["id"], "label": label, "geometry": geometry, "attributes": attributes}


def _fold_pose(regions: dict[str, dict], order: list[str]) -> list[str]:
    """Keypoints exported as ``{box}:k0`` belong to that box, not to their own pose."""
    drop = set()
    for region_id in order:
        found = re.search(r":k(\d+)$", region_id)
        if not found:
            continue
        parent = regions.get(region_id[:found.start()])
        if parent is None:
            continue
        if not any(part["kind"] in {"rectanglelabels", "rectangle"} for part in parent["parts"]):
            continue
        parent["parts"].extend(regions[region_id]["parts"])
        drop.add(region_id)
    return [region_id for region_id in order if region_id not in drop]


def _attach_control(item: dict, regions: dict[str, dict], image_values: dict, fields: list[dict]) -> None:
    kind = str(item.get("type") or "").lower()
    value = item.get("value") or {}
    from_name = str(item.get("from_name") or kind)
    field_id = slug(from_name)
    parsed = _control_value(kind, value)
    if parsed is None:
        return
    stored, field = parsed
    field["id"] = field_id
    field["label"] = from_name
    field["labelEn"] = from_name
    region_id = fit_id(item.get("id") or "")
    if item.get("id") and region_id in regions:
        field["scope"] = "annotation"
        regions[region_id].setdefault("controls", {})[field_id] = stored
        for part in regions[region_id]["parts"]:
            part["attributes"][field_id] = stored
    else:
        field["scope"] = "image"
        image_values[field_id] = stored
    when = item.get("visibleWhen") if isinstance(item.get("visibleWhen"), dict) else None
    if when:
        field["visibleWhen"] = when
    fields.append(field)


def _control_value(kind: str, value: dict) -> tuple[object, dict] | None:
    if kind == "choices":
        choices = [str(item) for item in value.get("choices") or [] if str(item)]
        if not choices:
            return None
        options = [{"id": slug(item), "label": item, "labelEn": item} for item in choices]
        stored: object = options[0]["id"] if len(options) == 1 else [item["id"] for item in options]
        return stored, {"type": "single" if len(options) == 1 else "multi", "options": options, "scope": "image"}
    if kind == "taxonomy":
        paths = []
        for item in value.get("taxonomy") or []:
            if isinstance(item, list):
                paths.append("/".join(str(part) for part in item if str(part)))
            elif item:
                paths.append(str(item))
        paths = [item for item in paths if item]
        if not paths:
            return None
        options = [{"id": slug(item), "label": item, "labelEn": item} for item in paths]
        return [item["id"] for item in options], {"type": "multi", "options": options, "scope": "image"}
    if kind == "textarea":
        text = value.get("text")
        if isinstance(text, list):
            body = "\n".join(str(item) for item in text)
        else:
            body = str(text or "")
        if body == "":
            return None
        return body, {"type": "text", "scope": "image"}
    if kind == "number":
        try:
            return float(value.get("number")), {"type": "number", "scope": "image"}
        except (TypeError, ValueError):
            return None
    if kind == "rating":
        try:
            return float(value.get("rating")), {"type": "number", "scope": "image"}
        except (TypeError, ValueError):
            return None
    if kind == "datetime":
        raw = str(value.get("datetime") or "")
        if not raw:
            return None
        return raw, {"type": "date", "scope": "image"}
    return None


def _field_from_tag(node, tag: str) -> dict | None:
    name = str(node.attrib.get("name") or "").strip()
    if not name:
        return None
    scope = "annotation" if str(node.attrib.get("perRegion") or "").lower() == "true" else "image"
    field: dict = {"id": name, "label": name, "labelEn": name, "scope": scope}
    when_field = node.attrib.get("visibleWhen") or node.attrib.get("whenTagName")
    when_value = node.attrib.get("whenChoiceValue") or node.attrib.get("whenLabelValue")
    if when_field and when_value:
        field["visibleWhen"] = {"field": slug(str(when_field)), "op": "eq", "value": slug(str(when_value))}
    if tag in {"Choices", "Taxonomy"}:
        options = []
        for child in node.iter():
            if _local(child.tag) != "Choice":
                continue
            value = str(child.attrib.get("value") or "").strip()
            if value and value not in {item["label"] for item in options}:
                options.append({"id": slug(value), "label": value, "labelEn": value})
        multiple = str(node.attrib.get("choice") or "").lower() == "multiple" or tag == "Taxonomy"
        field["type"] = "multi" if multiple else "single"
        field["options"] = options
        return field
    if tag == "TextArea":
        field["type"] = "text"
    elif tag in {"Number", "Rating"}:
        field["type"] = "number"
    elif tag == "DateTime":
        field["type"] = "date"
    else:
        return None
    return field


def _stored_result(annotation: dict, book: dict) -> dict:
    value = book.get("value")
    if isinstance(value, dict):
        value = dict(value)
        if isinstance(value.get("points"), list):
            value["points"] = _pair_points(value["points"])
    result = {
        "id": annotation.get("id"),
        "type": book.get("kind"),
        "from_name": book.get("from_name") or "label",
        "to_name": book.get("to_name") or "image",
        "original_width": book.get("original_width"),
        "original_height": book.get("original_height"),
        "image_rotation": book.get("image_rotation") or 0,
        "value": value,
    }
    score = annotation.get("attributes", {}).get("score") if isinstance(annotation.get("attributes"), dict) else None
    if isinstance(score, (int, float)):
        result["score"] = score
    return result


def _rectangle_result(annotation, geometry, label, file_w, file_h, book, kind: str) -> dict:
    orig_w = int(book.get("original_width") or file_w)
    orig_h = int(book.get("original_height") or file_h)
    rotation = int(book.get("image_rotation") or 0)
    x, y, width, height = _num(geometry["x"]), _num(geometry["y"]), _num(geometry["width"]), _num(geometry["height"])
    corners = [(x, y), (x + width, y), (x + width, y + height), (x, y + height)]
    percents = [_percent(px, py, orig_w, orig_h, rotation, file_w, file_h) for px, py in corners]
    left = min(point[0] for point in percents)
    top = min(point[1] for point in percents)
    return _region(annotation, kind, book, {
        "x": round(left, 4),
        "y": round(top, 4),
        "width": round(max(point[0] for point in percents) - left, 4),
        "height": round(max(point[1] for point in percents) - top, 4),
        "rotation": 0,
        _LABEL_KEY[kind]: [label],
    })


def _polygon_result(annotation, geometry, label, file_w, file_h, book) -> dict:
    orig_w = int(book.get("original_width") or file_w)
    orig_h = int(book.get("original_height") or file_h)
    rotation = int(book.get("image_rotation") or 0)
    points = []
    for point in geometry.get("points") or []:
        px, py = _percent(_num(point["x"]), _num(point["y"]), orig_w, orig_h, rotation, file_w, file_h)
        points.append([round(px, 4), round(py, 4)])
    return _region(annotation, "polygonlabels", book, {"points": points, "polygonlabels": [label]})


def _obb_result(annotation, geometry, label, file_w, file_h, book) -> dict:
    corners = [(_num(point["x"]), _num(point["y"])) for point in geometry.get("corners") or []]
    rect = _rect_from_corners(corners) if len(corners) == 4 else None
    if rect is None:
        geometry = {"type": "polygon", "points": [{"x": point[0], "y": point[1]} for point in corners]}
        return _polygon_result(annotation, geometry, label, file_w, file_h, book)
    orig_w = int(book.get("original_width") or file_w)
    orig_h = int(book.get("original_height") or file_h)
    rotation = int(book.get("image_rotation") or 0)
    left, top = _percent(rect[0], rect[1], orig_w, orig_h, rotation, file_w, file_h)
    right, bottom = _percent(rect[0] + rect[2], rect[1] + rect[3], orig_w, orig_h, rotation, file_w, file_h)
    return _region(annotation, "rectanglelabels", book, {
        "x": round(left, 4),
        "y": round(top, 4),
        "width": round(right - left, 4),
        "height": round(bottom - top, 4),
        "rotation": round(rect[4], 4),
        "rectanglelabels": [label],
    })


def _pose_results(annotation, geometry, label, file_w, file_h, book) -> list[dict]:
    rows = []
    box = geometry.get("box")
    if isinstance(box, dict) and _num(box.get("width")) > 0 and _num(box.get("height")) > 0:
        rows.append(_rectangle_result(annotation, box, label, file_w, file_h, book, "rectanglelabels"))
    orig_w = int(book.get("original_width") or file_w)
    orig_h = int(book.get("original_height") or file_h)
    rotation = int(book.get("image_rotation") or 0)
    for index, point in enumerate(geometry.get("keypoints") or []):
        if int(point.get("visibility", 2)) <= 0:
            continue
        px, py = _percent(_num(point["x"]), _num(point["y"]), orig_w, orig_h, rotation, file_w, file_h)
        rows.append(_region(
            {**annotation, "id": f"{annotation.get('id')}:k{index}"},
            "keypointlabels",
            book,
            {"x": round(px, 4), "y": round(py, 4), "width": 0.5, "keypointlabels": [label]},
        ))
    return rows


def _control_result(field: dict, value) -> dict | None:
    options = {str(item.get("id")): str(item.get("label") or item.get("id")) for item in field.get("options") or []}
    kind = field.get("type")
    if kind in {"single", "multi", "boolean"}:
        chosen = []
        if isinstance(value, list):
            chosen = [options.get(str(item), str(item)) for item in value if item not in (False, None, "")]
        elif value is True:
            chosen = [options.get("true") or str(field.get("label") or field.get("id"))]
        elif value not in (False, None, ""):
            chosen = [options.get(str(value), str(value))]
        if not chosen:
            return None
        return {"type": "choices", "value": {"choices": chosen}}
    if kind == "text" and value not in (None, ""):
        return {"type": "textarea", "value": {"text": [str(value)]}}
    if kind == "number" and isinstance(value, (int, float)) and not isinstance(value, bool):
        return {"type": "number", "value": {"number": value}}
    if kind == "date" and value not in (None, ""):
        return {"type": "datetime", "value": {"datetime": str(value)}}
    return None


def _region(annotation: dict, kind: str, book: dict, value: dict) -> dict:
    return {
        "id": annotation.get("id"),
        "type": kind,
        "from_name": book.get("from_name") or "label",
        "to_name": book.get("to_name") or "image",
        "original_width": int(book.get("original_width") or 0) or None,
        "original_height": int(book.get("original_height") or 0) or None,
        "image_rotation": int(book.get("image_rotation") or 0),
        "value": value,
    }


def _pair_points(raw) -> list:
    points = []
    for item in raw or []:
        if isinstance(item, dict) and "x" in item and "y" in item:
            pair = (item.get("x"), item.get("y"))
        elif isinstance(item, (list, tuple)) and len(item) >= 2:
            pair = (item[0], item[1])
        else:
            continue
        try:
            points.append([round(float(pair[0]), 4), round(float(pair[1]), 4)])
        except (TypeError, ValueError):
            continue
    return points


def _relation(item: dict) -> dict:
    labels = item.get("labels") if isinstance(item.get("labels"), list) else []
    return {
        "from_id": fit_id(item.get("from_id") or ""),
        "to_id": fit_id(item.get("to_id") or ""),
        "direction": "bi" if item.get("direction") == "bi" else "right",
        "labels": [str(labels[0])] if labels else ["link"],
        "type": "relation",
    }


def _labels(value: dict, kind: str) -> list[str]:
    key = _LABEL_KEY.get(kind, "")
    raw = value.get(key) if key else None
    if not isinstance(raw, list) or not raw:
        for name in ("rectanglelabels", "polygonlabels", "ellipselabels", "keypointlabels", "brushlabels", "bitmasklabels", "vectorlabels", "labels"):
            if isinstance(value.get(name), list) and value.get(name):
                raw = value[name]
                break
    if not isinstance(raw, list):
        return []
    return [str(item) for item in raw if str(item)]


def _looks_spatial(value: dict) -> bool:
    return any(key in value for key in ("x", "points", "rle", "vertices", "sequence", "radiusX"))


def _video_frame(value: dict) -> dict | None:
    sequence = value.get("sequence")
    if not isinstance(sequence, list):
        return None
    enabled = [item for item in sequence if isinstance(item, dict) and item.get("enabled", True)]
    frame = enabled[0] if enabled else next((item for item in sequence if isinstance(item, dict)), None)
    if not isinstance(frame, dict):
        return None
    labels = value.get("labels") or value.get("rectanglelabels") or []
    return {**frame, "rectanglelabels": labels if isinstance(labels, list) else [str(labels)]}


def _percent(px: float, py: float, orig_w: int, orig_h: int, rotation: int, file_w: int, file_h: int) -> tuple[float, float]:
    ox = px * orig_w / file_w if file_w else px
    oy = py * orig_h / file_h if file_h else py
    dx, dy = _rotate(ox, oy, orig_w, orig_h, rotation)
    disp_w, disp_h = _display_size(orig_w, orig_h, rotation)
    if disp_w <= 0 or disp_h <= 0:
        return 0.0, 0.0
    return dx / disp_w * 100, dy / disp_h * 100


def _rect_from_corners(corners: list[tuple[float, float]]) -> tuple[float, float, float, float, float] | None:
    center_x = sum(point[0] for point in corners) / 4
    center_y = sum(point[1] for point in corners) / 4
    ordered = sorted(corners, key=lambda point: math.atan2(point[1] - center_y, point[0] - center_x))
    edges = []
    for index in range(4):
        x1, y1 = ordered[index]
        x2, y2 = ordered[(index + 1) % 4]
        edges.append((x2 - x1, y2 - y1, math.hypot(x2 - x1, y2 - y1)))
    width, height = edges[0][2], edges[1][2]
    if width <= 0 or height <= 0:
        return None
    dot = abs(edges[0][0] * edges[1][0] + edges[0][1] * edges[1][1]) / (width * height)
    if dot > 0.05:
        return None
    if abs(edges[0][2] - edges[2][2]) > 1 or abs(edges[1][2] - edges[3][2]) > 1:
        return None
    angle = math.degrees(math.atan2(edges[0][1], edges[0][0]))
    return center_x - width / 2, center_y - height / 2, width, height, angle


def _bounds(geometry: dict) -> dict | None:
    if geometry.get("type") == "bbox":
        return {"x": _num(geometry["x"]), "y": _num(geometry["y"]), "width": _num(geometry["width"]), "height": _num(geometry["height"])}
    if geometry.get("type") == "pose" and isinstance(geometry.get("box"), dict):
        return geometry["box"]
    points = geometry.get("points") or geometry.get("corners") or []
    if not points:
        return None
    xs = [_num(point["x"]) for point in points]
    ys = [_num(point["y"]) for point in points]
    return {"x": min(xs), "y": min(ys), "width": max(xs) - min(xs), "height": max(ys) - min(ys)}


def _display_size(width: int, height: int, rotation: int) -> tuple[int, int]:
    if int(rotation) % 360 in {90, 270}:
        return height, width
    return width, height


def _unrotate(x: float, y: float, width: int, height: int, rotation: int) -> tuple[float, float]:
    turn = int(rotation) % 360
    if turn == 90:
        return y, height - x
    if turn == 180:
        return width - x, height - y
    if turn == 270:
        return width - y, x
    return x, y


def _rotate(x: float, y: float, width: int, height: int, rotation: int) -> tuple[float, float]:
    turn = int(rotation) % 360
    if turn == 90:
        return height - y, x
    if turn == 180:
        return width - x, height - y
    if turn == 270:
        return y, width - x
    return x, y


def _scale(x: float, y: float, orig_w: int, orig_h: int, file_w: int, file_h: int) -> tuple[float, float]:
    if orig_w <= 0 or orig_h <= 0:
        return x, y
    return x * file_w / orig_w, y * file_h / orig_h


def _angle_outline(pixels: list[tuple[int, int]]) -> list[tuple[float, float]]:
    owned = set(pixels)
    boundary = [point for point in pixels if any((point[0] + dx, point[1] + dy) not in owned for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))]
    if len(boundary) < 3:
        return [(float(point[0]), float(point[1])) for point in pixels[:4]]
    center_x = sum(point[0] for point in boundary) / len(boundary)
    center_y = sum(point[1] for point in boundary) / len(boundary)
    boundary.sort(key=lambda point: math.atan2(point[1] - center_y, point[0] - center_x))
    step = max(1, len(boundary) // 48)
    return [(float(point[0]), float(point[1])) for point in boundary[::step]]


def _runs(values: list[int]) -> list[tuple[int, int]]:
    if not values:
        return []
    runs = []
    start = 0
    current = values[0]
    for index, value in enumerate(values[1:], start=1):
        if value != current:
            runs.append((index - start, current))
            start = index
            current = value
    runs.append((len(values) - start, current))
    return runs


def _bytes_to_bits(data: list[int]) -> str:
    return "".join(f"{byte:08b}" for byte in data)


class _BitStream:
    def __init__(self, bits: str):
        self.bits = bits
        self.index = 0

    def read(self, size: int) -> int:
        chunk = self.bits[self.index:self.index + size]
        self.index += size
        if len(chunk) < size:
            raise ValueError("rle")
        return int(chunk, 2)


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _color(value) -> str:
    text = str(value or "")
    return text if re.fullmatch(r"#[0-9a-fA-F]{6}", text) else ""


def _unique_labels(labels: list[dict]) -> list[dict]:
    seen = set()
    rows = []
    for item in labels:
        if item["value"] in seen:
            continue
        seen.add(item["value"])
        rows.append(item)
    return rows


def _jsonable(value):
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    if isinstance(value, list) and all(isinstance(item, str) for item in value):
        return value
    return None


def _num(value) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0
