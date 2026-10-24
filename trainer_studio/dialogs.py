"""Native folder and file dialogs for the local window.

Tauri uses its own dialog plugin in the web shell. This module serves the
browser and pywebview builds: a pywebview dialog when a window is open, and a
tkinter dialog in a subprocess otherwise. The text field stays editable.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import threading
from pathlib import Path

from trainer_studio.errors import StudioError

_LOCK = threading.Lock()
_TEXT_EXT = {".json", ".key", ".yaml", ".yml", ".txt"}
_MAX_TEXT = 1_000_000

_TK = r"""
import json
import sys
from tkinter import Tk, filedialog

spec = json.loads(sys.stdin.read() or "{}")
root = Tk()
root.withdraw()
try:
    root.attributes("-topmost", True)
except Exception:
    pass
kind = spec.get("kind") or "file"
title = spec.get("title") or ""
initial = spec.get("initial") or ""
types = spec.get("types") or [("All", "*.*")]
try:
    if kind == "folder":
        chosen = filedialog.askdirectory(title=title, initialdir=initial or None)
    else:
        chosen = filedialog.askopenfilename(title=title, initialdir=initial or None, filetypes=types)
except Exception:
    chosen = ""
try:
    root.destroy()
except Exception:
    pass
sys.stdout.write(json.dumps({"path": chosen or ""}))
"""


def file_types(filters: list | None) -> list[tuple[str, str]]:
    """Tkinter (label, pattern) rows. Extensions may arrive with or without a dot."""
    rows: list[tuple[str, str]] = []
    for item in filters or []:
        if not isinstance(item, dict):
            continue
        name = str(item.get("name") or "Files").strip() or "Files"
        extensions = []
        for raw in item.get("extensions") or []:
            ext = str(raw).strip().lstrip(".").lower()
            if ext and ext not in extensions:
                extensions.append(ext)
        if extensions:
            rows.append((name, " ".join(f"*.{ext}" for ext in extensions)))
    if not rows:
        rows.append(("All", "*.*"))
    return rows


def _initial_dir(initial: str) -> str:
    if not initial:
        return ""
    path = Path(initial).expanduser()
    if path.is_dir():
        return str(path)
    if path.parent.is_dir():
        return str(path.parent)
    return ""


def _display() -> bool:
    if sys.platform in {"win32", "darwin"}:
        return True
    return bool(os.environ.get("DISPLAY") or os.environ.get("WAYLAND_DISPLAY"))


def _webview_pick(kind: str, title: str, initial: str, filters: list | None) -> str | None:
    """Path from the open pywebview window. None when no window is available."""
    try:
        import webview
        from webview import FileDialog
    except Exception:
        return None
    windows = list(getattr(webview, "windows", []) or [])
    if not windows:
        return None
    directory = _initial_dir(initial)
    if kind == "folder":
        chosen = windows[0].create_file_dialog(FileDialog.FOLDER, directory=directory, allow_multiple=False)
    else:
        patterns = tuple(f"{name} ({pattern.replace(' ', ';')})" for name, pattern in file_types(filters))
        chosen = windows[0].create_file_dialog(
            FileDialog.OPEN,
            directory=directory,
            allow_multiple=False,
            file_types=patterns,
        )
    if not chosen:
        return ""
    if isinstance(chosen, (list, tuple)):
        return str(chosen[0]) if chosen else ""
    return str(chosen)


def _tk_pick(kind: str, title: str, initial: str, filters: list | None) -> str:
    spec = json.dumps({
        "kind": "folder" if kind == "folder" else "file",
        "title": title,
        "initial": _initial_dir(initial),
        "types": file_types(filters),
    })
    completed = subprocess.run(
        [sys.executable, "-c", _TK],
        input=spec,
        text=True,
        capture_output=True,
        timeout=180,
        check=False,
    )
    if completed.returncode != 0:
        raise StudioError(code="dialog.unavailable")
    payload = json.loads(completed.stdout or "{}")
    return str(payload.get("path") or "")


def _with_grant(path: str, cancelled: bool, code: str = "") -> dict:
    body: dict = {"path": path, "cancelled": cancelled}
    if code:
        body["code"] = code
    if path and not cancelled:
        from trainer_studio.local_access import issue_grant

        body["grant"] = issue_grant(path)
    return body


def pick(kind: str, filters: list | None = None, title: str = "", initial: str = "") -> dict:
    """Return ``{path, cancelled, grant?}``. A stub env skips the real dialog for tests."""
    forced = os.environ.get("STUDIO_DIALOG_PATH")
    if forced is not None:
        return _with_grant(forced, forced == "")
    if os.environ.get("STUDIO_DIALOG") == "off":
        return _with_grant("", True, "dialog.unavailable")
    mode = "folder" if kind == "folder" else "file"
    with _LOCK:
        chosen: str | None
        try:
            chosen = _webview_pick(mode, title, initial, filters)
        except Exception:
            chosen = None
        if chosen is None:
            if not _display():
                return _with_grant("", True, "dialog.unavailable")
            try:
                chosen = _tk_pick(mode, title, initial, filters)
            except Exception:
                return _with_grant("", True, "dialog.unavailable")
    return _with_grant(chosen, chosen == "")


def read_local_text(path: str, grant: str | None = None) -> str:
    """Read a small text file the user just chose, or a file under the data dir."""
    from trainer_studio.local_access import authorize

    target = authorize(path, grant, write=False)
    if target.suffix.lower() not in _TEXT_EXT or not target.is_file():
        raise StudioError(code="dialog.file")
    if target.stat().st_size > _MAX_TEXT:
        raise StudioError(code="dialog.file")
    return target.read_text(encoding="utf-8")


def write_local_text(path: str, body: str, grant: str | None = None) -> str:
    """Write JSON to a dialog-chosen path or to the app data directory."""
    from trainer_studio.local_access import authorize

    target = authorize(path, grant, write=True)
    if target.suffix.lower() != ".json":
        raise StudioError(code="dialog.file")
    raw = body.encode("utf-8")
    if len(raw) > _MAX_TEXT:
        raise StudioError(code="dialog.file")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(body, encoding="utf-8")
    return str(target)
