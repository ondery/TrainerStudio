"""Disk-cached thumbnails. Original images stay where they are."""

from __future__ import annotations

from pathlib import Path

from PIL import Image

from trainer_studio.db import data_dir


def thumb_path(project_id: str, image_id: str, source: Path) -> Path:
    dest = data_dir() / "thumbs" / project_id / f"{image_id}.jpg"
    if dest.is_file() and dest.stat().st_mtime >= source.stat().st_mtime:
        return dest
    dest.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(source) as handle:
        image = handle.convert("RGB")
        image.thumbnail((320, 320))
        image.save(dest, "JPEG", quality=80)
    return dest
