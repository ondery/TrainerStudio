"""In-memory progress for a dataset open. The request runs on a worker thread."""

from __future__ import annotations

import threading

_LOCK = threading.Lock()
_STATE = {"active": False, "phase": "idle", "done": 0, "total": 0, "path": ""}


def begin(path: str, total: int = 0) -> None:
    with _LOCK:
        _STATE.update({"active": True, "phase": "read", "done": 0, "total": total, "path": path})


def tick(phase: str, done: int, total: int) -> None:
    with _LOCK:
        _STATE.update({"active": True, "phase": phase, "done": done, "total": total})


def finish() -> None:
    with _LOCK:
        _STATE.update({"active": False, "phase": "idle", "done": 0, "total": 0, "path": ""})


def snapshot() -> dict:
    with _LOCK:
        return dict(_STATE)
