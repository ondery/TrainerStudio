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


def _weights(model_id: str | None) -> str:
    wanted = (model_id or "mobile_sam").strip()
    candidate = Path(wanted).expanduser()
    if candidate.suffix.lower() in {".pt", ".onnx"} and candidate.is_file():
        return str(candidate)
    for row in MODELS:
        if row["id"] == wanted:
            return row["weights"]
    raise StudioError(code="sam.model", params={"model": wanted})


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
) -> dict:
    if not points:
        raise StudioError(code="sam.points")
    weights = _weights(model_id)
    chosen = _device(device)
    model = _load(weights, chosen)
    xy = [[float(point["x"]), float(point["y"])] for point in points]
    marks = labels or [1 for _ in xy]
    if len(marks) != len(xy):
        raise StudioError(code="sam.labels")
    results = model.predict(str(image_path), points=xy, labels=marks, device=chosen, verbose=False)
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
    return {
        "geometry": {"type": "polygon", "points": polygons[0]},
        "polygons": len(polygons),
        "model": model_id or "mobile_sam",
        "device": chosen,
    }
