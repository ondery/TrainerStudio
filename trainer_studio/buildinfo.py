"""Build identity shown in the API and the About line."""

from __future__ import annotations

import json
from pathlib import Path

from trainer_studio import __version__

_PATH = Path(__file__).resolve().parents[1] / "build.json"


def current() -> dict:
    if _PATH.is_file():
        try:
            payload = json.loads(_PATH.read_text(encoding="utf-8"))
            if isinstance(payload, dict) and payload.get("id"):
                payload.setdefault("version", __version__)
                return payload
        except (OSError, json.JSONDecodeError):
            pass
    return {"id": "dev", "version": __version__}
