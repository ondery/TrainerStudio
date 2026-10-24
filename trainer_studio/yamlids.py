"""YOLO class indexes come from data.yaml, in key order.

A catalog may add a title, color or icon. It must not drop, dedupe or reorder
those ids. A catalog position is never a YOLO id.
"""

from __future__ import annotations

from pathlib import Path

import yaml

from trainer_studio.messages import text


def read_name_pairs(path: Path) -> list[tuple[int, str]] | None:
    """Return ``(index, key)`` pairs. Dict keys stay their integer ids."""
    if not path.is_file():
        return None
    try:
        payload = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    except (OSError, yaml.YAMLError):
        return None
    if not isinstance(payload, dict):
        return None
    names = payload.get("names")
    if isinstance(names, dict):
        pairs = []
        for key in sorted(names, key=lambda item: int(item)):
            pairs.append((int(key), str(names[key])))
        return pairs
    if isinstance(names, list):
        return [(index, str(name)) for index, name in enumerate(names)]
    return None


def names_list(pairs: list[tuple[int, str]]) -> list[str]:
    if not pairs:
        return []
    size = max(index for index, _name in pairs) + 1
    names = [""] * size
    for index, name in pairs:
        if 0 <= index < size:
            names[index] = name
    return names


def index_for_key(pairs: list[tuple[int, str]], key: str) -> int | None:
    for index, name in pairs:
        if name == key:
            return index
    return None


def contiguous(pairs: list[tuple[int, str]]) -> bool:
    return [index for index, _name in pairs] == list(range(len(pairs)))


def lock_report(pairs: list[tuple[int, str]] | None, catalog_keys: list[str]) -> dict:
    """Catalog keys must equal data.yaml names, in the same order."""
    if pairs is None:
        return {
            "ok": False,
            "yaml": 0,
            "catalog": len(catalog_keys),
            "missing": [],
            "extra": list(catalog_keys),
            "code": "catalog.empty",
            "params": {},
            "message": text("catalog.empty"),
        }
    if not pairs and not catalog_keys:
        return {"ok": True, "yaml": 0, "catalog": 0, "missing": [], "extra": []}
    yaml_names = [name for _index, name in pairs]
    if catalog_keys == yaml_names:
        return {"ok": True, "yaml": len(yaml_names), "catalog": len(catalog_keys), "missing": [], "extra": []}
    known = set(catalog_keys)
    yaml_set = set(yaml_names)
    missing = [name for name in yaml_names if name not in known]
    extra = [name for name in catalog_keys if name not in yaml_set]
    shown = ", ".join(missing[:8]) or ", ".join(extra[:8]) or "order"
    return {
        "ok": False,
        "yaml": len(yaml_names),
        "catalog": len(catalog_keys),
        "missing": missing,
        "extra": extra,
        "code": "catalog.mismatch",
        "params": {"shown": shown},
        "message": text("catalog.mismatch", shown=shown),
    }
