"""Atomic text writes and a backup taken before each real change."""

from __future__ import annotations

import os
import shutil
from datetime import datetime, timezone
from pathlib import Path


def backup_file(path: Path, backup_root: Path) -> Path | None:
    if not path.is_file():
        return None
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    dest = backup_root / stamp / path.name
    dest.parent.mkdir(parents=True, exist_ok=True)
    # Keep a readable relative hint when several files share a name.
    if dest.exists():
        dest = backup_root / stamp / f"{path.parent.name}-{path.name}"
    shutil.copy2(path, dest)
    return dest


def atomic_write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    data = text.encode("utf-8")
    with temporary.open("wb") as handle:
        handle.write(data)
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temporary, path)


def write_if_changed(path: Path, text: str, backup_root: Path) -> dict:
    """Write ``text`` atomically. Identical bytes are left untouched."""
    encoded = text.encode("utf-8")
    if path.is_file() and path.read_bytes() == encoded:
        return {"written": False, "backup": None}
    backup = backup_file(path, backup_root)
    atomic_write_text(path, text)
    return {"written": True, "backup": str(backup) if backup else None}
