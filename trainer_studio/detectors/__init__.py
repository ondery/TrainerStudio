"""Pluggable detectors.

Ultralytics YOLO is AGPL-3.0. Importing it is optional and lazy.
RT-DETR through Hugging Face Transformers is Apache-2.0 and does not import Ultralytics.
"""

from __future__ import annotations

from trainer_studio.detectors.base import Detector, available, get, predict

__all__ = ["Detector", "available", "get", "predict", "register_defaults"]

_READY = False


def register_defaults() -> None:
    global _READY
    if _READY:
        return
    from trainer_studio.detectors.rtdetr import RTDetrDetector
    from trainer_studio.detectors.ultralytics_yolo import UltralyticsDetector

    available.extend([UltralyticsDetector(), RTDetrDetector()])
    _READY = True
