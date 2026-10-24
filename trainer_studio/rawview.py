"""Read-only view of a label file and image file. This module does not write."""

from __future__ import annotations

import hashlib
from datetime import datetime, timezone
from pathlib import Path

_CACHE: dict[tuple, str] = {}


def annotate_lines(text: str, names: list[tuple[str, str]]) -> list[dict]:
    """Keep every disk line, including blanks. Class index comes from the first token."""
    rows = []
    for number, line in enumerate(text.splitlines(), start=1):
        row: dict = {"n": number, "text": line, "classIndex": None, "classId": "", "title": ""}
        parts = line.split()
        if parts:
            try:
                index = int(float(parts[0]))
            except (TypeError, ValueError):
                index = None
            if index is not None and 0 <= index < len(names):
                class_id, title = names[index]
                row["classIndex"] = index
                row["classId"] = class_id
                row["title"] = title or class_id
        rows.append(row)
    return rows


def file_sha256(path: Path) -> str:
    stat = path.stat()
    key = (str(path), stat.st_size, stat.st_mtime_ns)
    cached = _CACHE.get(key)
    if cached:
        return cached
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    value = digest.hexdigest()
    if len(_CACHE) > 64:
        _CACHE.clear()
    _CACHE[key] = value
    return value


def _stamp(stat) -> str:
    return datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat()


def image_facts(path: Path) -> dict:
    stat = path.stat()
    facts: dict = {
        "bytes": stat.st_size,
        "mtime": _stamp(stat),
        "sha256": file_sha256(path),
        "format": "",
        "mode": "",
        "width": 0,
        "height": 0,
        "exif": {},
    }
    try:
        from PIL import Image
        from PIL.ExifTags import TAGS

        with Image.open(path) as image:
            facts["format"] = image.format or ""
            facts["mode"] = image.mode or ""
            facts["width"], facts["height"] = image.size
            exif: dict[str, str] = {}
            for key, value in list(image.getexif().items())[:32]:
                label = str(TAGS.get(key, key))
                rendered = str(value)
                if len(rendered) > 160:
                    continue
                exif[label] = rendered
            facts["exif"] = exif
    except OSError:
        pass
    return facts


def label_facts(path: Path) -> dict:
    stat = path.stat()
    return {"bytes": stat.st_size, "mtime": _stamp(stat), "sha256": file_sha256(path)}
