"""User-defined label fields. SignLens is only a template."""

from __future__ import annotations

import re

SCOPES = {"annotation", "image", "class"}
TYPES = {"text", "number", "boolean", "single", "multi", "date", "color", "url", "class_ref"}
BANNED_ICONS = {"Circle", "CircleDot", "Dot"}
_ID = re.compile(r"^[a-z][a-z0-9_]{0,48}$")

VEHICLES = (
    ("vehicle_car", "Otomobil", "Car", "OTO", "1"),
    ("vehicle_panelvan", "Panelvan", "Van", "PAN", "2"),
    ("vehicle_minibus", "Minibüs", "Minibus", "MNB", "3"),
    ("vehicle_bus", "Otobüs", "Bus", "OTB", "4"),
    ("vehicle_pickup", "Kamyonet", "Pickup", "KMT", "5"),
    ("vehicle_truck", "Kamyon", "Truck", "KAM", "6"),
    ("vehicle_motorcycle", "Motosiklet", "Motorcycle", "MOT", "7"),
    ("vehicle_tractor", "Traktör", "Tractor", "TRK", "8"),
)
VEHICLE_ICONS = {
    "vehicle_car": "Car",
    "vehicle_panelvan": "CarFront",
    "vehicle_minibus": "Bus",
    "vehicle_bus": "BusFront",
    "vehicle_pickup": "Truck",
    "vehicle_truck": "Truck",
    "vehicle_motorcycle": "Bike",
    "vehicle_tractor": "Tractor",
}


def _slug(value: str) -> str:
    text = re.sub(r"[^a-z0-9_]+", "_", (value or "").strip().lower()).strip("_")
    if not text or not text[0].isalpha():
        text = f"field_{text}".strip("_")
    return text[:40]


def clean_icon(value) -> dict | None:
    if not isinstance(value, dict):
        return None
    kind = value.get("kind")
    if kind == "lucide":
        name = str(value.get("name") or "")
        if not re.fullmatch(r"[A-Za-z][A-Za-z0-9]{0,40}", name) or name in BANNED_ICONS:
            return None
        return {"kind": "lucide", "name": name}
    if kind == "image":
        src = str(value.get("src") or "")
        if src.startswith("data:image/") and len(src) <= 200_000:
            return {"kind": "image", "src": src}
    return None


def _option(raw: dict) -> dict | None:
    option_id = _slug(str(raw.get("id") or raw.get("label") or ""))
    if not _ID.match(option_id):
        return None
    option = {
        "id": option_id,
        "label": str(raw.get("label") or option_id)[:80],
        "labelEn": str(raw.get("labelEn") or raw.get("label") or option_id)[:80],
        "abbr": str(raw.get("abbr") or option_id[:3]).upper()[:8],
    }
    if raw.get("shortcut"):
        option["shortcut"] = str(raw["shortcut"])[:2]
    icon = clean_icon(raw.get("icon"))
    if icon:
        option["icon"] = icon
    return option


def clean_field(raw: dict) -> dict | None:
    if not isinstance(raw, dict):
        return None
    field_id = _slug(str(raw.get("id") or raw.get("name") or raw.get("label") or ""))
    if not _ID.match(field_id):
        return None
    scope = raw.get("scope") if raw.get("scope") in SCOPES else "annotation"
    kind = raw.get("type") or "text"
    if kind == "checkbox":
        kind = "boolean"
    if kind not in TYPES:
        kind = "text"
    field: dict = {
        "id": field_id,
        "scope": scope,
        "type": kind,
        "label": str(raw.get("label") or field_id)[:80],
        "labelEn": str(raw.get("labelEn") or raw.get("label") or field_id)[:80],
        "appliesTo": [str(item) for item in (raw.get("appliesTo") or []) if str(item)],
        "options": [],
    }
    icon = clean_icon(raw.get("icon"))
    if icon:
        field["icon"] = icon
    when = raw.get("visibleWhen")
    if isinstance(when, dict) and when.get("field"):
        field["visibleWhen"] = {
            "field": _slug(str(when.get("field"))),
            "op": when.get("op") if when.get("op") in {"eq", "neq", "notEmpty", "includes"} else "eq",
            "value": when.get("value"),
        }
    if kind in {"single", "multi", "boolean"}:
        options = []
        for item in raw.get("options") or []:
            if isinstance(item, dict):
                option = _option(item)
                if option and option["id"] not in {row["id"] for row in options}:
                    options.append(option)
        field["options"] = options
    return field


def clean_fields(raw) -> list[dict]:
    fields = []
    seen = set()
    for item in raw or []:
        if not isinstance(item, dict):
            continue
        field = clean_field(item)
        if field and field["id"] not in seen:
            seen.add(field["id"])
            fields.append(field)
    return fields


def speed_keys(class_keys: list[str]) -> list[str]:
    return [key for key in class_keys if key.startswith("speed_")]


def signlens_fields(class_keys: list[str] | None = None) -> list[dict]:
    targets = speed_keys(class_keys or [])
    vehicles = []
    for option_id, label, label_en, abbr, shortcut in VEHICLES:
        vehicles.append({
            "id": option_id,
            "label": label,
            "labelEn": label_en,
            "abbr": abbr,
            "shortcut": shortcut,
            "icon": {"kind": "lucide", "name": VEHICLE_ICONS[option_id]},
        })
    return clean_fields([
        {
            "id": "vehicle",
            "scope": "annotation",
            "type": "multi",
            "label": "Araç tipi",
            "labelEn": "Vehicle type",
            "icon": {"kind": "lucide", "name": "Car"},
            "appliesTo": targets,
            "options": vehicles,
        },
        {
            "id": "occluded",
            "scope": "annotation",
            "type": "boolean",
            "label": "Kısmen gizli",
            "labelEn": "Occluded",
            "icon": {"kind": "lucide", "name": "EyeOff"},
            "options": [],
        },
        {
            "id": "sign_text",
            "scope": "annotation",
            "type": "text",
            "label": "Levha yazısı",
            "labelEn": "Sign text",
            "icon": {"kind": "lucide", "name": "Type"},
        },
        {
            "id": "speed_value",
            "scope": "annotation",
            "type": "number",
            "label": "Hız değeri",
            "labelEn": "Speed value",
            "icon": {"kind": "lucide", "name": "Gauge"},
            "appliesTo": targets,
        },
        {
            "id": "note",
            "scope": "image",
            "type": "text",
            "label": "Görüntü notu",
            "labelEn": "Image note",
            "icon": {"kind": "lucide", "name": "StickyNote"},
        },
    ])


def blank_fields() -> list[dict]:
    return []


def template_fields(template_id: str, class_keys: list[str] | None = None) -> list[dict]:
    if template_id == "signlens":
        return signlens_fields(class_keys)
    return []


def fields_from_labeling(payload: dict) -> list[dict]:
    """Read a labeling.json document without dropping unknown field keys we understand."""
    if not isinstance(payload, dict):
        return []
    fields = clean_fields(payload.get("fields"))
    if fields:
        return fields
    groups = payload.get("attributeGroups")
    if isinstance(groups, list):
        adapted = []
        for group in groups:
            if isinstance(group, dict):
                adapted.append({**group, "type": group.get("type") or group.get("mode") or "multi"})
        return clean_fields(adapted)
    return []
