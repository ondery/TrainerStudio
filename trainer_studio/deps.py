"""Optional AI packages. Probing does not import Ultralytics."""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

from trainer_studio.messages import text

ROOT = Path(__file__).resolve().parents[1]
REQUIREMENTS = ROOT / "requirements-ai.txt"


def _present(name: str) -> bool:
    return importlib.util.find_spec(name) is not None


def install_args() -> list[str]:
    """The only install command the server will run. The client cannot add packages."""
    return [sys.executable, "-m", "pip", "install", "-r", str(REQUIREMENTS)]


def resolve_device(requested: str | None) -> str:
    """Honor CUDA only when this process can actually use it."""
    want = (requested or "cpu").strip().lower()
    if want != "cuda":
        return "cpu"
    try:
        import torch

        if torch.cuda.is_available():
            return "cuda"
    except Exception:
        pass
    return "cpu"


def resolve_weights(spec: dict) -> None:
    """Drop a weights path that is not on disk so YOLO can use the default name."""
    raw = str(spec.get("weights") or "").strip()
    if not raw:
        return
    path = Path(raw).expanduser()
    looks_like_path = path.is_absolute() or "/" in raw or "\\" in raw
    if looks_like_path and not path.is_file():
        spec.pop("weights", None)


def probe() -> dict:
    torch_ok = _present("torch")
    cuda = False
    device_name = ""
    if torch_ok:
        import torch

        cuda = bool(torch.cuda.is_available())
        if cuda:
            device_name = str(torch.cuda.get_device_name(0))
    ultra = _present("ultralytics")
    hint_code = "" if ultra else "ai.hint"
    return {
        "ultralytics": ultra,
        "torch": torch_ok,
        "cuda": cuda,
        "deviceName": device_name,
        "requirements": REQUIREMENTS.name,
        "installCommand": "python -m pip install -r requirements-ai.txt",
        "hint": text(hint_code) if hint_code else "",
        "hintCode": hint_code,
    }
