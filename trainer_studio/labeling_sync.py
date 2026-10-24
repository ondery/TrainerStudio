"""Patch labeling.json without replacing Legacy's document.

A style edit writes one override: the edited class, and only the fields
that changed. An empty ``classes`` list stays the fallback to Legacy's
built-in catalog. Unknown keys, key order, and the file's indent stay.
The caller writes the text atomically.
"""

from __future__ import annotations

import json


def patch_labeling_text(original: str, edits: list[dict]) -> str:
    """``edits`` is ``{"id", "set"}``. ``set`` holds only the edited fields.

    Recognized fields: title, titleEn, color, hotkey, group, deprecated, icon.
    ``icon`` is stored under ``classIcons[id]``. Nothing else is added.
    """
    document = json.loads(original)
    if not isinstance(document, dict):
        return original
    if not _apply(document, edits):
        return original
    return _dump_like(original, document)


def retarget_labeling_text(original: str, renames: dict[str, str], removed: set[str]) -> str:
    """Rename or drop override ids that already exist. Do not add classes."""
    document = json.loads(original)
    if not isinstance(document, dict):
        return original
    if not _retarget(document, renames, removed):
        return original
    return _dump_like(original, document)


def _apply(document: dict, edits: list[dict]) -> bool:
    changed = False
    classes = document.get("classes")
    if not isinstance(classes, list):
        classes = None
    by_id: dict[str, dict] = {}
    if isinstance(classes, list):
        for item in classes:
            if isinstance(item, dict) and item.get("id"):
                by_id[str(item["id"])] = item
    icons = document.get("classIcons") if isinstance(document.get("classIcons"), dict) else None
    for edit in edits:
        key = str(edit.get("id") or "")
        fields = edit.get("set") if isinstance(edit.get("set"), dict) else {}
        if not key or not fields:
            continue
        body = {name: value for name, value in fields.items() if name != "icon"}
        current = by_id.get(key)
        if body:
            if current is None:
                if classes is None:
                    classes = []
                    document["classes"] = classes
                current = _minimal(key, body)
                classes.append(current)
                by_id[key] = current
                changed = True
            else:
                changed = _touch_fields(current, body) or changed
        if "icon" not in fields:
            continue
        icon = fields.get("icon")
        if not isinstance(icon, dict) or not icon.get("kind"):
            continue
        if icons is None:
            icons = {}
            document["classIcons"] = icons
            changed = True
        if icons.get(key) != icon:
            icons[key] = icon
            changed = True
    return changed


def _retarget(document: dict, renames: dict[str, str], removed: set[str]) -> bool:
    changed = False
    classes = document.get("classes")
    if isinstance(classes, list):
        kept = []
        for item in classes:
            if not isinstance(item, dict) or not item.get("id"):
                kept.append(item)
                continue
            key = str(item["id"])
            if key in removed:
                changed = True
                continue
            nxt = renames.get(key)
            if nxt and nxt != key:
                item["id"] = nxt
                changed = True
            kept.append(item)
        if changed:
            document["classes"] = kept
    icons = document.get("classIcons")
    if isinstance(icons, dict) and (renames or removed):
        nxt_icons = {}
        for key, value in icons.items():
            if key in removed:
                changed = True
                continue
            renamed = renames.get(str(key))
            if renamed and renamed != key:
                nxt_icons[renamed] = value
                changed = True
            else:
                nxt_icons[key] = value
        if nxt_icons != icons:
            document["classIcons"] = nxt_icons
            changed = True
    return changed


def _minimal(key: str, body: dict) -> dict:
    item: dict = {"id": key}
    title = str(body.get("title") or "") if "title" in body else ""
    if title:
        item["tr"] = {"title": title}
    title_en = str(body.get("titleEn") or "") if "titleEn" in body else ""
    if title_en:
        item["en"] = {"title": title_en}
    if "color" in body:
        item["color"] = str(body.get("color") or "")
    if "hotkey" in body:
        item["hotkey"] = str(body.get("hotkey") or "")
    group = str(body.get("group") or "") if "group" in body else ""
    if group:
        item["group"] = group
    if "deprecated" in body:
        item["deprecated"] = bool(body.get("deprecated"))
    return item


def _touch_fields(current: dict, body: dict) -> bool:
    """Update only keys present in ``body``. Leave every other key."""
    changed = False
    if "title" in body and str(body.get("title") or ""):
        title = str(body["title"])
        if "title" in current and current.get("title") != title:
            current["title"] = title
            changed = True
        translated = current.get("tr")
        if isinstance(translated, dict):
            if translated.get("title") != title:
                translated["title"] = title
                changed = True
        elif "tr" not in current:
            current["tr"] = {"title": title}
            changed = True
    if "titleEn" in body and str(body.get("titleEn") or ""):
        title_en = str(body["titleEn"])
        english = current.get("en")
        if isinstance(english, dict):
            if english.get("title") != title_en:
                english["title"] = title_en
                changed = True
        elif "en" not in current:
            current["en"] = {"title": title_en}
            changed = True
    if "group" in body:
        group = str(body.get("group") or "")
        if group:
            if current.get("group") != group:
                current["group"] = group
                changed = True
        elif "group" in current and current.get("group") != "":
            current["group"] = ""
            changed = True
    if "color" in body and current.get("color") != str(body.get("color") or ""):
        current["color"] = str(body.get("color") or "")
        changed = True
    if "hotkey" in body and current.get("hotkey") != str(body.get("hotkey") or ""):
        current["hotkey"] = str(body.get("hotkey") or "")
        changed = True
    if "deprecated" in body and current.get("deprecated") != bool(body.get("deprecated")):
        current["deprecated"] = bool(body.get("deprecated"))
        changed = True
    return changed


def _dump_like(original: str, document: dict) -> str:
    indent = _indent(original)
    newline = "\n" if original.endswith("\n") else ""
    if indent is None:
        text = json.dumps(document, ensure_ascii=False, separators=(", ", ": "))
    else:
        text = json.dumps(document, ensure_ascii=False, indent=indent)
    return text + newline


def _indent(original: str) -> int | None:
    lines = original.splitlines()
    if len(lines) < 2:
        return None
    for line in lines[1:]:
        if not line.strip():
            continue
        spaces = len(line) - len(line.lstrip(" "))
        return spaces or None
    return None
