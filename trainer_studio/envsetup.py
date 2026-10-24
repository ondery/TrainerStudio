"""Install Python dependencies only when their file hash changes.

An offline start keeps the environment that is already there. pywebview is
optional: if it cannot be installed, the app opens in the browser.
"""

from __future__ import annotations

import hashlib
import subprocess
import sys
from pathlib import Path

from trainer_studio.messages import text

ROOT = Path(__file__).resolve().parents[1]
REQUIREMENTS = ROOT / "requirements.txt"
WINDOW = ROOT / "requirements-window.txt"


def file_hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def plan(core_stamp: str | None, core_hash: str, window_ready: bool, window_stamp: str | None, window_hash: str) -> tuple[str, str]:
    """Return ``(core, window)`` actions: skip, install, or ready.

    A failed pywebview install must not count as installed. ``window_stamp`` is
    ignored unless the import works, so the next start tries pip again.
    """
    del window_stamp
    core = "skip" if core_stamp == core_hash else "install"
    if window_ready:
        window = "ready"
    elif not window_hash:
        window = "skip"
    else:
        window = "install"
    return core, window


def _read_stamp(path: Path) -> str | None:
    if not path.is_file():
        return None
    return path.read_text(encoding="utf-8").strip() or None


def _window_ready() -> bool:
    try:
        import webview  # noqa: F401
    except Exception:
        return False
    return True


def main() -> int:
    venv = ROOT / ".venv"
    venv.mkdir(parents=True, exist_ok=True)
    core_hash = file_hash(REQUIREMENTS)
    window_hash = file_hash(WINDOW) if WINDOW.is_file() else ""
    core_stamp = venv / ".requirements.sha256"
    window_stamp = venv / ".window.sha256"
    core_action, window_action = plan(_read_stamp(core_stamp), core_hash, _window_ready(), _read_stamp(window_stamp), window_hash)
    if core_action == "skip":
        print(text("env.unchanged"))
    else:
        code = subprocess.call([sys.executable, "-m", "pip", "install", "-q", "-r", str(REQUIREMENTS)])
        if code == 0:
            core_stamp.write_text(core_hash, encoding="utf-8")
        else:
            print(text("env.offline"))
    if window_action == "ready":
        if window_hash and _read_stamp(window_stamp) != window_hash:
            window_stamp.write_text(window_hash, encoding="utf-8")
    elif window_action == "install":
        code = subprocess.call([sys.executable, "-m", "pip", "install", "-q", "-r", str(WINDOW)])
        if code == 0 and _window_ready():
            window_stamp.write_text(window_hash, encoding="utf-8")
        else:
            print(text("env.window"))
    elif window_hash and not _window_ready():
        print(text("env.window"))
    return 0
