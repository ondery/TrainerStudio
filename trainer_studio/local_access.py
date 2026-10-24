"""Session token and single-use dialog grants for local file endpoints.

A page on another origin cannot read ``/api/health``, so it cannot send the
session header. A grant is issued only by ``/api/dialog`` and is consumed by
the next read or write of that exact path. Anything else must live under the
app data directory. Writes into an opened dataset's ``labels/`` tree or its
``data.yaml`` are refused even when a grant or the data directory would
otherwise allow the path.
"""

from __future__ import annotations

import secrets
from pathlib import Path

from trainer_studio.db import connect, data_dir
from trainer_studio.errors import StudioError

HEADER = "x-studio-session"
SESSION_TOKEN = secrets.token_urlsafe(32)

_grants: dict[str, Path] = {}


def session_token() -> str:
    return SESSION_TOKEN


def check_session(header: str | None) -> None:
    supplied = header or ""
    if len(supplied) != len(SESSION_TOKEN) or not secrets.compare_digest(supplied, SESSION_TOKEN):
        raise StudioError(code="local.session", status=403)


def issue_grant(path: str) -> str:
    token = secrets.token_urlsafe(24)
    _grants[token] = Path(path).expanduser().resolve()
    return token


def _inside(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
    except ValueError:
        return False
    return True


def opened_roots() -> list[Path]:
    conn = connect()
    try:
        rows = conn.execute("SELECT root FROM projects").fetchall()
    finally:
        conn.close()
    roots: list[Path] = []
    for row in rows:
        raw = str(row["root"] or "").strip()
        if raw:
            roots.append(Path(raw).expanduser().resolve())
    return roots


def dataset_write_blocked(target: Path) -> bool:
    """Opened datasets never accept a write into labels/ or data.yaml."""
    resolved = target.expanduser().resolve()
    name = resolved.name.lower()
    for root in opened_roots():
        if name in {"data.yaml", "data.yml"} and resolved.parent == root:
            return True
        if _inside(resolved, root / "labels"):
            return True
    return False


def _in_data_dir(target: Path) -> bool:
    return _inside(target, data_dir().resolve())


def authorize(path: str, grant: str | None, *, write: bool) -> Path:
    raw = str(path or "").strip()
    if not raw:
        raise StudioError(code="local.forbidden", status=403)
    target = Path(raw).expanduser().resolve()
    allowed = False
    token = str(grant or "").strip()
    if token:
        granted = _grants.pop(token, None)
        if granted is not None and granted == target:
            allowed = True
    if not allowed and _in_data_dir(target):
        allowed = True
    if not allowed:
        raise StudioError(code="local.forbidden", status=403)
    if write and dataset_write_blocked(target):
        raise StudioError(code="local.forbidden", status=403)
    return target
