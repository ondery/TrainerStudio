"""Drop-in engine. It does not change labeling unless its job is started."""

from __future__ import annotations

import json
from pathlib import Path


class BoxFileDetector:
    id = "boxfile"
    license = "AGPL-3.0"
    families = [{"id": "boxfile", "label": "Box file", "sizes": ["n"], "tasks": ["detect"]}]

    def ready(self) -> tuple[bool, str]:
        return True, ""

    def predict(self, image_path: str, spec: dict, names: list[str]) -> list[dict]:
        sidecar = Path(image_path).with_suffix(".boxes.json")
        if not sidecar.is_file():
            return []
        raw = json.loads(sidecar.read_text(encoding="utf-8"))
        boxes = []
        allowed = set(names)
        for row in raw if isinstance(raw, list) else []:
            key = str(row.get("classId") or "")
            if allowed and key not in allowed:
                continue
            boxes.append(
                {
                    "classId": key,
                    "geometry": {
                        "type": "bbox",
                        "x": float(row.get("x") or 0),
                        "y": float(row.get("y") or 0),
                        "width": float(row.get("width") or 0),
                        "height": float(row.get("height") or 0),
                    },
                    "score": row.get("score"),
                }
            )
        return boxes


def register(context):
    context.add_detector(BoxFileDetector())

    def echo(payload, progress, cancel):
        progress(1, "boxfile")
        return {"ok": True, "boxes": [{"x": 1, "y": 1, "width": 8, "height": 8, "classId": "object"}]}

    context.add_job("boxfile.echo", "Box file", echo)
