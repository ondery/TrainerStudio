"""Reveal a file in the OS explorer, and rename a project file in place.

Neither path rewrites data.yaml or moves a project folder.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

from trainer_studio.errors import StudioError


def reveal_command(path: Path, platform: str) -> list[str]:
    resolved = path.expanduser().resolve()
    target = str(resolved)
    if platform == "win32":
        return ["explorer", "/select,", target]
    if platform == "darwin":
        return ["open", "-R", target]
    parent = resolved.parent if resolved.is_file() or resolved.suffix else resolved
    return ["xdg-open", str(parent)]


def reveal(path: str, platform: str | None = None) -> dict:
    source = Path(path).expanduser()
    if not source.exists():
        raise StudioError(code="fs.missing", status=404)
    command = reveal_command(source, platform or sys.platform)
    subprocess.Popen(command)
    return {"command": command, "path": str(source.resolve())}


def reveal_project(project_id: str, relative: str, platform: str | None = None) -> dict:
    """Open the OS file explorer for one file inside a project or an extra folder."""
    from trainer_studio.db import connect
    from trainer_studio.enterprise import extra_roots
    from trainer_studio.service import _project_row

    conn = connect()
    try:
        root = Path(_project_row(conn, project_id)["root"]).resolve()
    finally:
        conn.close()
    candidate = Path(str(relative or ""))
    path = candidate.expanduser().resolve() if candidate.is_absolute() else (root / candidate).resolve()
    roots = [root, *extra_roots(project_id)]
    if not path.exists() or not any(path == item or path.is_relative_to(item) for item in roots):
        raise StudioError(code="local.forbidden", status=403)
    return reveal(str(path), platform)
