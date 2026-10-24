"""SignLens class titles and colors, joined by key, never by position."""

from __future__ import annotations

import json
import re
from pathlib import Path

_SPEED = re.compile(r"speed_(\d+)$")
_END = re.compile(r"end_speed_(\d+)$")
_BARE_TR = {"hız sınırı", "hiz siniri", "speed limit"}
_BARE_EN = {"speed limit", "hız sınırı", "hiz siniri"}

_PATH = Path(__file__).resolve().parent / "templates" / "signlens.json"
_CACHE: dict | None = None

PALETTE = [
    "#e11d48", "#f97316", "#eab308", "#84cc16", "#10b981", "#14b8a6",
    "#06b6d4", "#3b82f6", "#6366f1", "#8b5cf6", "#d946ef", "#f43f5e",
    "#b45309", "#0f766e", "#1d4ed8", "#7c3aed",
]


def signlens_template() -> dict:
    global _CACHE
    if _CACHE is None:
        _CACHE = json.loads(_PATH.read_text(encoding="utf-8"))
    return _CACHE


def signlens_by_key() -> dict[str, dict]:
    return {row["id"]: row for row in signlens_template()["classes"]}


def display_titles(key: str, title: str, title_en: str, detail: str = "") -> tuple[str, str]:
    """Show the speed value in the title. Class ids are not rewritten."""
    speed = _SPEED.fullmatch(key or "")
    if speed and not key.startswith("end_"):
        number = speed.group(1)
        if number not in (title or "") or (title or "").strip().casefold() in _BARE_TR:
            title = f"Hız sınırı {number} km/h"
        if number not in (title_en or "") or (title_en or "").strip().casefold() in _BARE_EN:
            title_en = f"Speed limit {number} km/h"
        return title, title_en
    end = _END.fullmatch(key or "")
    if end:
        number = end.group(1)
        if number not in (title or ""):
            title = f"Hız sonu {number} km/h"
        if number not in (title_en or ""):
            title_en = f"End of {number} km/h limit"
        return title, title_en
    if not title:
        title = key
    if not title_en:
        title_en = title
    if detail and detail not in title and key.startswith("speed_"):
        title = f"{title} {detail}".strip()
    return title, title_en


def style_for(key: str, index: int) -> dict:
    row = signlens_by_key().get(key) or {}
    tr = row.get("tr") or {}
    en = row.get("en") or {}
    icon = row.get("icon") or {"kind": "lucide", "name": "Tag"}
    title, title_en = display_titles(key, tr.get("title") or key, en.get("title") or key, tr.get("detail") or "")
    return {
        "title": title,
        "title_en": title_en,
        "detail": tr.get("detail") or "",
        "color": row.get("color") or PALETTE[index % len(PALETTE)],
        "icon": icon,
        "group": row.get("group") or "",
    }
