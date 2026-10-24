"""Folder and file colors copied from the Legacy icon set."""

from __future__ import annotations

from pathlib import Path

KINDS = {
    "train": ("#3dd68c", "folder"),
    "val": ("#e8b931", "folder"),
    "test": ("#4c9aff", "folder"),
    "images": ("#b07cff", "images"),
    "labels": ("#2ec4b6", "tag"),
    "videos": ("#7aa2ff", "film"),
    "runs": ("#f0a05a", "flask-conical"),
    "weights": ("#c4a484", "cpu"),
    "datasets": ("#5b8def", "database"),
    "exports": ("#c084fc", "package"),
    "raw": ("#8b97a8", "inbox"),
    "configs": ("#94a3b8", "settings"),
    "folder": ("#8b97a8", "folder"),
}

ALIASES = {
    "train": "train",
    "training": "train",
    "egitim": "train",
    "val": "val",
    "valid": "val",
    "validation": "val",
    "dogrulama": "val",
    "test": "test",
    "testing": "test",
    "images": "images",
    "image": "images",
    "img": "images",
    "imgs": "images",
    "gorseller": "images",
    "labels": "labels",
    "label": "labels",
    "annotations": "labels",
    "etiketler": "labels",
    "videos": "videos",
    "video": "videos",
    "runs": "runs",
    "run": "runs",
    "experiments": "runs",
    "weights": "weights",
    "models": "weights",
    "model": "weights",
    "agirliklar": "weights",
    "datasets": "datasets",
    "dataset": "datasets",
    "exports": "exports",
    "export": "exports",
    "dist": "exports",
    "raw": "raw",
    "ham": "raw",
    "configs": "configs",
    "config": "configs",
}

FILES = {
    ".png": ("image", "#b07cff"),
    ".jpg": ("image", "#b07cff"),
    ".jpeg": ("image", "#b07cff"),
    ".webp": ("image", "#b07cff"),
    ".bmp": ("image", "#b07cff"),
    ".gif": ("image", "#b07cff"),
    ".tif": ("image", "#b07cff"),
    ".tiff": ("image", "#b07cff"),
    ".mp4": ("film", "#7aa2ff"),
    ".mov": ("film", "#7aa2ff"),
    ".avi": ("film", "#7aa2ff"),
    ".mkv": ("film", "#7aa2ff"),
    ".webm": ("film", "#7aa2ff"),
    ".yaml": ("file-code", "#e8b931"),
    ".yml": ("file-code", "#e8b931"),
    ".json": ("braces", "#fbbf24"),
    ".txt": ("file-text", "#cbd5e1"),
    ".md": ("file-text", "#93c5fd"),
    ".csv": ("table", "#3dd68c"),
    ".pt": ("cpu", "#f0a05a"),
    ".onnx": ("cpu", "#f0a05a"),
    ".py": ("file-code", "#7dd3fc"),
    ".zip": ("file-archive", "#a8a29e"),
}


def _fold(name: str) -> str:
    table = str.maketrans({"ç": "c", "ğ": "g", "ı": "i", "ö": "o", "ş": "s", "ü": "u"})
    return name.strip().lower().translate(table)


def folder_style(name: str) -> dict:
    kind = ALIASES.get(_fold(name), "folder")
    color, icon = KINDS.get(kind, KINDS["folder"])
    return {"id": kind, "color": color, "icon": icon}


def file_style(name: str) -> dict:
    ext = Path(name).suffix.lower()
    icon, color = FILES.get(ext, ("file", "#8b97a8"))
    return {"ext": ext, "icon": icon, "color": color}
