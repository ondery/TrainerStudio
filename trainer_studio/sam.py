"""Point prompts for the SAM family. The dependency is optional and lazy."""

from __future__ import annotations

from pathlib import Path

from trainer_studio.errors import StudioError

MODELS = (
    {"id": "mobile_sam", "label": "Mobile SAM", "weights": "mobile_sam.pt", "family": "SAM"},
    {"id": "sam_b", "label": "SAM base", "weights": "sam_b.pt", "family": "SAM"},
    {"id": "sam_l", "label": "SAM large", "weights": "sam_l.pt", "family": "SAM"},
    {"id": "sam2_t", "label": "SAM 2 tiny", "weights": "sam2_t.pt", "family": "SAM 2"},
    {"id": "sam2_s", "label": "SAM 2 small", "weights": "sam2_s.pt", "family": "SAM 2"},
    {"id": "sam2_b", "label": "SAM 2 base", "weights": "sam2_b.pt", "family": "SAM 2"},
    {"id": "sam2_l", "label": "SAM 2 large", "weights": "sam2_l.pt", "family": "SAM 2"},
)

_CACHE: dict[tuple[str, str], object] = {}


def models() -> list[dict]:
    return [dict(row) for row in MODELS]


def _search_weights(filename: str) -> Path | None:
    from trainer_studio.db import data_dir

    roots = [Path.cwd(), data_dir() / "weights", Path.home() / ".ultralytics" / "weights"]
    try:
        from ultralytics.utils import SETTINGS

        roots.append(Path(str(SETTINGS.get("weights_dir") or "")))
    except Exception:
        pass
    for root in roots:
        if not str(root):
            continue
        candidate = (root / filename).expanduser()
        if candidate.is_file():
            return candidate
    return None


def _weights(model_id: str | None) -> str:
    wanted = (model_id or "mobile_sam").strip()
    candidate = Path(wanted).expanduser()
    if candidate.suffix.lower() in {".pt", ".onnx"}:
        if candidate.is_file():
            return str(candidate)
        raise StudioError(code="sam.weights", params={"file": candidate.name})
    for row in MODELS:
        if row["id"] == wanted:
            found = _search_weights(row["weights"])
            if found is None:
                raise StudioError(code="sam.weights", params={"file": row["weights"]})
            return str(found)
    raise StudioError(code="sam.model", params={"model": wanted})


def download_weights(model_id: str | None) -> dict:
    """Fetch a catalog checkpoint. Called only when the user asks."""
    wanted = (model_id or "mobile_sam").strip()
    filename = ""
    for row in MODELS:
        if row["id"] == wanted:
            filename = row["weights"]
            break
    if not filename:
        raise StudioError(code="sam.model", params={"model": wanted})
    found = _search_weights(filename)
    if found is not None:
        return {"ok": True, "weights": str(found), "file": filename}
    try:
        from ultralytics import SAM
    except Exception as exc:
        raise StudioError(code="sam.unavailable", status=424) from exc
    SAM(filename)
    found = _search_weights(filename)
    return {"ok": True, "weights": str(found or filename), "file": filename}


def _device(requested: str | None) -> str:
    want = (requested or "cpu").lower()
    if want not in {"cpu", "cuda"}:
        raise StudioError(code="sam.device")
    if want == "cpu":
        return "cpu"
    try:
        import torch
    except Exception as exc:
        raise StudioError(code="sam.cuda", status=409) from exc
    if not torch.cuda.is_available():
        raise StudioError(code="sam.cuda", status=409)
    return "cuda"


def _load(weights: str, device: str):
    key = (weights, device)
    cached = _CACHE.get(key)
    if cached is not None:
        return cached
    try:
        from ultralytics import SAM
    except Exception as exc:
        raise StudioError(code="sam.unavailable", status=424) from exc
    model = SAM(weights)
    _CACHE[key] = model
    return model


def segment(
    image_path: Path,
    points: list[dict],
    labels: list[int] | None = None,
    model_id: str | None = None,
    device: str | None = None,
    conf: float | None = None,
) -> dict:
    if not points:
        raise StudioError(code="sam.points")
    try:
        import importlib

        importlib.import_module("ultralytics")
    except Exception as exc:
        raise StudioError(code="sam.unavailable", status=424) from exc
    weights = _weights(model_id)
    chosen = _device(device)
    model = _load(weights, chosen)
    xy = [[float(point["x"]), float(point["y"])] for point in points]
    marks = labels or [1 for _ in xy]
    if len(marks) != len(xy):
        raise StudioError(code="sam.labels")
    kwargs = {"points": xy, "labels": marks, "device": chosen, "verbose": False}
    if conf is not None:
        kwargs["conf"] = float(conf)
    results = model.predict(str(image_path), **kwargs)
    result = results[0]
    masks = getattr(result, "masks", None)
    polygons = []
    if masks is not None and getattr(masks, "xy", None):
        for contour in masks.xy:
            polygon = [{"x": float(x), "y": float(y)} for x, y in contour[:: max(1, len(contour) // 80)]]
            if len(polygon) >= 3:
                polygons.append(polygon)
    if not polygons:
        raise StudioError(code="sam.empty")
    polygons.sort(key=len, reverse=True)
    choices = [{"type": "polygon", "points": polygon} for polygon in polygons]
    return {
        "geometry": choices[0],
        "choices": choices,
        "polygons": len(choices),
        "model": model_id or "mobile_sam",
        "device": chosen,
    }
