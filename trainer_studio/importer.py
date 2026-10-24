"""Read a YOLO dataset into SQLite. This module never writes the dataset."""

from __future__ import annotations

import hashlib
import json
import os
import re
import stat as statmod
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image

from trainer_studio import progress as import_progress
from trainer_studio.catalog import style_for
from trainer_studio.schema import fields_from_labeling
from trainer_studio.yamlids import names_list, read_name_pairs
from trainer_studio.yolo import parse_text

IMAGE_EXT = {".jpg", ".jpeg", ".png", ".bmp", ".webp", ".tif", ".tiff", ".ppm"}
_GEOM_KEYS = {
    "id", "cls", "classId", "class_id", "cx", "cy", "w", "h", "x", "y", "width", "height",
    "points", "kind", "angle", "keypoints", "geometry", "bbox",
}


def now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def file_token(size: int, mtime_ns: int) -> str:
    """Identity of a label file without reading it. Size plus mtime, not a content hash."""
    return f"{int(size)}:{int(mtime_ns)}"


class Scan:
    """One directory walk: image files, label files, and the change token."""

    def __init__(self) -> None:
        self.images: list[tuple[str, Path, os.stat_result]] = []
        self.labels_by_rel: dict[str, tuple[Path, os.stat_result]] = {}
        self.labels_by_stem: dict[str, str] = {}
        self.guard: tuple = ()


def _both(root: Path):
    """Walk images and labels together. Each folder is one scandir pass."""
    with ThreadPoolExecutor(max_workers=2) as pool:
        images = pool.submit(_walk, root / "images")
        labels = pool.submit(_walk, root / "labels")
        return images.result(), labels.result()


def tree_guard(root: Path) -> tuple:
    """Change token only. Size and mtime, no path objects and no sort."""
    (_image_roll, image_guard), (_label_roll, label_guard) = _both(root)
    return (tuple(_named(root)), label_guard, image_guard)


def scan_tree(root: Path) -> Scan:
    """Stat the dataset once. Callers reuse this for the open and the fingerprint."""
    found = Scan()
    (image_roll, image_guard), (label_roll, label_guard) = _both(root)
    images_root = root / "images"
    labels_root = root / "labels"
    found.images = [(rel, images_root / rel, st) for rel, st in image_roll if _suffix(rel) in IMAGE_EXT]
    found.images.sort(key=lambda item: (natural_key(item[0].rsplit("/", 1)[-1]), item[0]))
    texts = [(rel, st) for rel, st in label_roll if rel.lower().endswith(".txt")]
    texts.sort(key=lambda item: item[0])
    for rel, st in texts:
        found.labels_by_rel[rel] = (labels_root / rel, st)
        base = rel.rsplit("/", 1)[-1]
        stem = base.rsplit(".", 1)[0]
        found.labels_by_stem.setdefault(stem, rel)
    found.guard = (tuple(_named(root)), label_guard, image_guard)
    return found


def _named(root: Path) -> list[tuple]:
    named = []
    for name in ("data.yaml", "meta.json", "labeling.json", "class-undo.json"):
        path = root / name
        if path.is_file():
            st = path.stat()
            named.append((name, st.st_size, st.st_mtime_ns))
        else:
            named.append((name, None, None))
    return named


def _suffix(rel: str) -> str:
    base = rel.rsplit("/", 1)[-1]
    dot = base.rfind(".")
    if dot < 0:
        return ""
    return base[dot:].lower()


def _walk(folder: Path) -> tuple[list[tuple[str, os.stat_result]], tuple[int, int, int]]:
    """Regular files as (relative posix, stat) plus (count, total size, newest mtime)."""
    files: list[tuple[str, os.stat_result]] = []
    if not folder.is_dir():
        return files, (0, 0, 0)
    root = os.path.abspath(os.fspath(folder))
    prefix = root if root.endswith(os.sep) else root + os.sep
    prefix_len = len(prefix)
    total = 0
    newest = 0
    stack = [root]
    while stack:
        current = stack.pop()
        try:
            iterator = os.scandir(current)
        except OSError:
            continue
        with iterator:
            for entry in iterator:
                try:
                    st = entry.stat(follow_symlinks=False)
                except OSError:
                    continue
                if statmod.S_ISDIR(st.st_mode):
                    stack.append(entry.path)
                elif statmod.S_ISREG(st.st_mode):
                    rel = entry.path[prefix_len:].replace("\\", "/")
                    files.append((rel, st))
                    total += st.st_size
                    if st.st_mtime_ns > newest:
                        newest = st.st_mtime_ns
    return files, (len(files), total, newest)


def _read_bytes(paths: list[Path], report: bool) -> dict[str, bytes]:
    if not paths:
        return {}
    total = len(paths)
    done = 0

    def read(path: Path) -> tuple[str, bytes]:
        nonlocal done
        data = path.read_bytes()
        done += 1
        if report and done % 80 == 0:
            import_progress.tick("read", done, total)
        return str(path), data

    workers = min(32, max(4, (os.cpu_count() or 4) * 4))
    with ThreadPoolExecutor(max_workers=workers) as pool:
        return dict(pool.map(read, paths, chunksize=16))


def natural_key(value: str):
    return [int(part) if part.isdigit() else part.lower() for part in re.split(r"(\d+)", value)]


def discover_images(root: Path) -> list[Path]:
    folder = root / "images"
    if not folder.is_dir():
        return []
    found = [path for path in folder.rglob("*") if path.is_file() and path.suffix.lower() in IMAGE_EXT]
    found.sort(key=lambda path: natural_key(path.name))
    return found


def label_for(root: Path, image: Path) -> Path | None:
    by_rel, by_stem = label_maps(root)
    return label_from_maps(root, image, by_rel, by_stem)


def label_maps(root: Path) -> tuple[dict[str, Path], dict[str, Path]]:
    by_rel: dict[str, Path] = {}
    by_stem: dict[str, Path] = {}
    labels = root / "labels"
    if not labels.is_dir():
        return by_rel, by_stem
    for path in labels.rglob("*.txt"):
        if not path.is_file():
            continue
        by_rel[path.relative_to(labels).as_posix()] = path
        by_stem.setdefault(path.stem, path)
    return by_rel, by_stem


def label_from_maps(root: Path, image: Path, by_rel: dict[str, Path], by_stem: dict[str, Path]) -> Path | None:
    rel = image.relative_to(root / "images").with_suffix(".txt").as_posix()
    found = by_rel.get(rel)
    if found is not None:
        return found
    return by_stem.get(image.stem)


def load_json(path: Path):
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def meta_index(payload) -> dict[str, dict]:
    found: dict[str, dict] = {}
    if not isinstance(payload, dict):
        return found
    for item in payload.get("images") or []:
        if not isinstance(item, dict):
            continue
        for key in (item.get("id"), item.get("name"), Path(str(item.get("file") or "")).name):
            if key:
                found[str(key)] = item
    return found


def sniff_task(root: Path, pairs: list[tuple[int, str]], samples: list[str] | None = None) -> str:
    yaml_path = root / "data.yaml"
    try:
        payload = __import__("yaml").safe_load(yaml_path.read_text(encoding="utf-8")) or {}
    except (OSError, Exception):
        payload = {}
    if isinstance(payload, dict) and payload.get("kpt_shape"):
        return "pose"
    lengths = []
    if samples is None:
        labels = root / "labels"
        samples = []
        if labels.is_dir():
            files = sorted(labels.rglob("*.txt"))[:40]
            for path in files:
                samples.append(path.read_text(encoding="utf-8", errors="replace"))
    for sample in samples[:40]:
        for line in sample.splitlines():
            parts = line.split()
            if len(parts) >= 2:
                lengths.append(len(parts))
            if len(lengths) > 200:
                break
    if lengths and all(count == 5 for count in lengths):
        return "detect"
    if lengths and all(count == 9 for count in lengths):
        return "obb"
    if lengths and all(count > 5 and (count - 5) % 3 == 0 for count in lengths):
        vis_ok = True
        return "pose" if vis_ok else "segment"
    if lengths and any(count > 5 for count in lengths):
        return "segment"
    return "detect"


def header_size(path: Path) -> tuple[int, int] | None:
    """Width and height from a JPEG SOF or PNG IHDR, without decoding pixels."""
    suffix = path.suffix.lower()
    try:
        if suffix in {".jpg", ".jpeg"}:
            return _jpeg_size(path)
        if suffix == ".png":
            return _png_size(path)
    except OSError:
        return None
    return None


def _png_size(path: Path) -> tuple[int, int] | None:
    with path.open("rb") as handle:
        header = handle.read(24)
    if len(header) < 24 or header[:8] != b"\x89PNG\r\n\x1a\n":
        return None
    width = int.from_bytes(header[16:20], "big")
    height = int.from_bytes(header[20:24], "big")
    if width <= 0 or height <= 0:
        return None
    return width, height


def _jpeg_size(path: Path) -> tuple[int, int] | None:
    with path.open("rb") as handle:
        if handle.read(2) != b"\xff\xd8":
            return None
        while True:
            marker = handle.read(1)
            if not marker:
                return None
            if marker != b"\xff":
                continue
            code = handle.read(1)
            while code == b"\xff":
                code = handle.read(1)
            if not code:
                return None
            kind = code[0]
            if kind in {0x01, 0xD8, 0xD9} or 0xD0 <= kind <= 0xD7:
                continue
            length_bytes = handle.read(2)
            if len(length_bytes) < 2:
                return None
            length = int.from_bytes(length_bytes, "big")
            if length < 2:
                return None
            if kind in {0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF}:
                body = handle.read(5)
                if len(body) < 5:
                    return None
                height = int.from_bytes(body[1:3], "big")
                width = int.from_bytes(body[3:5], "big")
                if width <= 0 or height <= 0:
                    return None
                return width, height
            handle.seek(length - 2, 1)


def image_size(path: Path, meta: dict | None) -> tuple[int, int]:
    if meta and meta.get("width") and meta.get("height"):
        return int(meta["width"]), int(meta["height"])
    sniffed = header_size(path)
    if sniffed:
        return sniffed
    with Image.open(path) as handle:
        return int(handle.width), int(handle.height)


def _sizes(jobs: list[tuple[Path, dict | None]]) -> dict[str, tuple[int, int]]:
    """Header reads run together. Meta width and height skip the file."""

    def one(item: tuple[Path, dict | None]) -> tuple[str, tuple[int, int]]:
        path, meta = item
        return str(path), image_size(path, meta)

    if not jobs:
        return {}
    if all(meta is not None for _path, meta in jobs):
        return {str(path): image_size(path, meta) for path, meta in jobs}
    workers = min(32, max(4, (os.cpu_count() or 4) * 4))
    with ThreadPoolExecutor(max_workers=workers) as pool:
        return dict(pool.map(one, jobs, chunksize=16))


def status_of(meta: dict | None, boxes: int) -> str:
    raw = str((meta or {}).get("status") or "")
    if raw in {"review", "needs_review", "flagged"}:
        return "review"
    if (meta or {}).get("reviewReason") or (meta or {}).get("flag"):
        if not (meta or {}).get("reviewed"):
            return "review"
    if boxes <= 0:
        return "unlabeled"
    return "labeled"


def jsonable(value):
    try:
        json.dumps(value)
        return value
    except TypeError:
        return str(value)


def box_attributes(box: dict) -> dict:
    attrs = {}
    for key, value in box.items():
        if key in _GEOM_KEYS:
            continue
        attrs[str(key)] = jsonable(value)
    nested = box.get("attributes")
    if isinstance(nested, dict):
        for key, value in nested.items():
            attrs[str(key)] = jsonable(value)
        attrs.pop("attributes", None)
    return attrs


def image_attributes(meta: dict | None) -> dict:
    if not meta:
        return {}
    keep = {}
    for key, value in meta.items():
        if key in {"boxes", "file", "id", "name", "width", "height"}:
            continue
        keep[key] = jsonable(value)
    return keep


def parse_image_labels(text: str, task: str, width: int, height: int, meta: dict | None, image_id: str) -> list[dict]:
    parsed, _warnings = parse_text(text, task, width, height)
    meta_boxes = [box for box in (meta or {}).get("boxes") or [] if isinstance(box, dict)]
    use_meta_ids = len(meta_boxes) == len(parsed) and parsed
    rows = []
    stamp = now()
    names_ready = True
    for position, item in enumerate(parsed):
        geometry = item["geometry"]
        class_index = item.get("classIndex")
        attrs = {}
        ann_id = f"{image_id}:{item['ordinal']}"
        if use_meta_ids:
            box = meta_boxes[position]
            if box.get("id"):
                attrs["_sourceId"] = str(box["id"])
            attrs.update(box_attributes(box))
        if class_index is not None and "_yamlIndex" not in attrs:
            attrs.setdefault("_yamlIndex", class_index)
        rows.append({
            "id": ann_id,
            "classIndex": class_index,
            "geometry": geometry,
            "attributes": attrs,
            "ordinal": int(item["ordinal"]),
            "created_at": stamp,
            "updated_at": stamp,
            "names_ready": names_ready,
        })
    return rows


def build_snapshot(root: Path, task: str | None = None, report: bool = False, scanned: Scan | None = None) -> dict:
    """Pure read of the dataset. Caller persists it. No filesystem writes."""
    tree = scanned or scan_tree(root)
    label_rows = list(tree.labels_by_rel.values())
    raw_labels = _read_bytes([path for path, _st in label_rows], report)
    decoded: dict[str, str] = {}
    for path, _st in label_rows:
        decoded[str(path)] = raw_labels.get(str(path), b"").decode("utf-8", errors="replace")
    samples = [decoded[str(path)] for path, _st in label_rows[:40]]
    pairs = read_name_pairs(root / "data.yaml") or []
    chosen = task or sniff_task(root, pairs, samples)
    names = names_list(pairs)
    meta_payload = load_json(root / "meta.json")
    metas = meta_index(meta_payload)
    labeling = load_json(root / "labeling.json")
    class_undo = load_json(root / "class-undo.json")
    classes = []
    for index, key in enumerate(names):
        if not key:
            continue
        style = style_for(key, index)
        classes.append({"key": key, "yaml_index": index, "sort_index": len(classes), **style})
    size_jobs = []
    for rel, path, _st in tree.images:
        base = rel.rsplit("/", 1)[-1]
        stem = base.rsplit(".", 1)[0]
        meta = metas.get(stem) or metas.get(base)
        size_jobs.append((path, meta if meta and meta.get("width") and meta.get("height") else None))
    sizes = _sizes(size_jobs)
    images = []
    seen_ids: set[str] = set()
    total = len(tree.images)
    if report:
        import_progress.tick("read", 0, total)
    for sort_index, (rel, path, _st) in enumerate(tree.images):
        if report and sort_index % 200 == 0:
            import_progress.tick("parse", sort_index, total)
        base = rel.rsplit("/", 1)[-1]
        stem = base.rsplit(".", 1)[0]
        image_id = stem if stem not in seen_ids else f"{stem}-{sort_index}"
        seen_ids.add(image_id)
        meta = metas.get(image_id) or metas.get(base) or metas.get(stem)
        width, height = sizes[str(path)]
        dot = rel.rfind(".")
        slash = rel.rfind("/")
        label_key = (rel[:dot] if dot > slash else rel) + ".txt"
        label_under = label_key if label_key in tree.labels_by_rel else tree.labels_by_stem.get(stem)
        label = tree.labels_by_rel.get(label_under) if label_under else None
        label_text = ""
        label_rel = None
        label_sha = file_token(0, 0)
        if label is not None and label_under is not None:
            label_path, label_stat = label
            label_sha = file_token(label_stat.st_size, label_stat.st_mtime_ns)
            label_text = decoded.get(str(label_path), "")
            label_rel = "labels/" + label_under
        parsed = parse_image_labels(label_text, chosen, width, height, meta, image_id) if label_text.strip() else []
        for row in parsed:
            index = row.get("classIndex")
            if isinstance(index, int) and 0 <= index < len(names) and names[index]:
                row["class_key"] = names[index]
            else:
                row["class_key"] = ""
                if index is not None:
                    row["attributes"]["_unknownClass"] = index
        split = str((meta or {}).get("split") or "")
        if not split:
            head = rel.split("/", 1)[0] if "/" in rel else ""
            if head in {"train", "val", "test"}:
                split = head
        images.append({
            "id": image_id,
            "stem": stem,
            "rel_path": "images/" + rel,
            "name": path.name,
            "width": width,
            "height": height,
            "split": split,
            "status": status_of(meta, len(parsed)),
            "attributes": image_attributes(meta),
            "meta": meta or {},
            "label_rel": label_rel,
            "label_sha": label_sha,
            "sort_index": sort_index,
            "annotations": parsed,
        })
    if report:
        import_progress.tick("read", total, total)
    return {
        "root": str(root.resolve()),
        "name": root.name,
        "task": chosen,
        "classes": classes,
        "images": images,
        "fields": fields_from_labeling(labeling) if isinstance(labeling, dict) else [],
        "labeling": labeling,
        "class_undo": class_undo,
        "schema_from_file": isinstance(labeling, dict),
    }
