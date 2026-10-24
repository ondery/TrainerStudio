"""Helpers for the Windows live checkout.

``start-trainer-studio-dev.bat`` calls ``python -m trainer_studio.devlive``.
``npm`` installs web dependencies only when ``package-lock.json`` changed.
``open`` waits for the API and the Next dev server, then opens one browser URL.
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
import time
import urllib.request
import webbrowser
from pathlib import Path

from trainer_studio.envsetup import file_hash

ROOT = Path(__file__).resolve().parents[1]
LOCK = ROOT / "web" / "package-lock.json"
MODULES = ROOT / "web" / "node_modules"
STAMP = MODULES / ".package-lock.sha256"


def lock_action(stamp: str | None, lock_hash: str, modules_present: bool) -> str:
    """``ci`` when the install is missing or the lockfile moved, otherwise ``skip``."""
    if modules_present and stamp == lock_hash and lock_hash:
        return "skip"
    return "ci"


def reinstall_plan(before: dict[str, str], after: dict[str, str]) -> tuple[bool, bool]:
    """Return ``(pip, npm)`` for a pull. Unchanged hashes do not reinstall."""
    pip = before.get("requirements.txt") != after.get("requirements.txt") or before.get("requirements-window.txt") != after.get(
        "requirements-window.txt"
    )
    npm = before.get("web/package-lock.json") != after.get("web/package-lock.json")
    return pip, npm


def npm_ci_if_needed() -> int:
    if not LOCK.is_file():
        print("package-lock.json is missing")
        return 1
    digest = file_hash(LOCK)
    stamp = STAMP.read_text(encoding="utf-8").strip() if STAMP.is_file() else None
    action = lock_action(stamp, digest, MODULES.is_dir())
    if action == "skip":
        print("web dependencies unchanged")
        return 0
    npm = shutil.which("npm")
    if not npm:
        print("npm was not found. Dev-live needs Node.js.")
        return 1
    code = subprocess.call([npm, "ci"], cwd=ROOT / "web")
    if code != 0:
        return code
    STAMP.write_text(digest, encoding="utf-8")
    print("web dependencies installed")
    return 0


def _up(url: str) -> bool:
    try:
        with urllib.request.urlopen(url, timeout=0.8) as response:
            return response.status < 500
    except Exception:
        return False


def open_when_ready() -> int:
    host = os.environ.get("STUDIO_HOST", "127.0.0.1")
    api_port = os.environ.get("STUDIO_PORT", "43150")
    dev_port = os.environ.get("STUDIO_DEV_PORT", "43151")
    page = f"http://{host}:{dev_port}"
    api = f"http://{host}:{api_port}/api/health"
    for _ in range(80):
        if _up(api) and _up(page):
            print(page)
            webbrowser.open(page)
            return 0
        time.sleep(0.5)
    print(page)
    webbrowser.open(page)
    return 0


def main(argv: list[str] | None = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    command = args[0] if args else ""
    if command == "npm":
        return npm_ci_if_needed()
    if command == "open":
        return open_when_ready()
    print("usage: python -m trainer_studio.devlive npm|open")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
