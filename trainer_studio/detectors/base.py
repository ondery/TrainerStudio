"""Detector registry. Backends are constructed without importing their libraries."""

from __future__ import annotations

from typing import Protocol

available: list = []


class Detector(Protocol):
    id: str
    license: str
    families: list[dict]

    def ready(self) -> tuple[bool, str]: ...

    def predict(self, image_path: str, spec: dict, names: list[str]) -> list[dict]: ...


def catalog() -> list[dict]:
    if not available:
        from trainer_studio.detectors import register_defaults

        register_defaults()
    from trainer_studio.messages import text

    rows = []
    for detector in available:
        ok, code = detector.ready()
        rows.append({
            "id": detector.id,
            "license": detector.license,
            "ready": ok,
            "reason": text(code) if code else "",
            "reasonCode": code,
            "families": detector.families,
        })
    return rows


def get(backend: str):
    if not available:
        from trainer_studio.detectors import register_defaults

        register_defaults()
    for detector in available:
        if detector.id == backend:
            return detector
    return None


def predict(backend: str, image_path: str, spec: dict, names: list[str]) -> list[dict]:
    detector = get(backend)
    from trainer_studio.errors import StudioError

    if detector is None:
        raise StudioError(code="detect.missing", params={"backend": backend}, status=424)
    ok, code = detector.ready()
    if not ok:
        raise StudioError(code=code or "detect.unavailable", status=424)
    return detector.predict(image_path, spec, names)
