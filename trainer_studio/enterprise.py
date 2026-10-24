"""Core rename and forget. Paid work is loaded from the optional ``ee`` package.

When ``ee`` is not installed every paid call returns HTTP 402. Nothing in this
module can verify a license or run a paid feature.
"""

from __future__ import annotations

import shutil
from pathlib import Path

from trainer_studio.db import connect, transaction
from trainer_studio.errors import StudioError
from trainer_studio.service import _project_row

_PAID = {
    "add_folder",
    "assign_review",
    "audit",
    "audit_lines",
    "camera_status",
    "claim_job",
    "class_counts",
    "current_role",
    "cut_files",
    "enqueue",
    "extract_frames",
    "import_remote",
    "install_plugin",
    "link_shapes",
    "next_active",
    "open_store",
    "paste_files",
    "popout",
    "put_object",
    "queue_snapshot",
    "record_audit",
    "review_for",
    "set_role",
    "sso_login",
    "support_bundle",
}


def _runtime():
    try:
        import ee.runtime as runtime
    except ImportError:
        return None
    return runtime


def _locked() -> None:
    raise StudioError(code="ee.locked", status=402)


def license_status() -> dict:
    runtime = _runtime()
    if runtime is None:
        return {"ok": False, "features": [], "reason": "missing"}
    return runtime.license_status()


def save_license(token: str) -> dict:
    runtime = _runtime()
    if runtime is None:
        _locked()
    return runtime.save_license(token)


def require_feature(feature: str) -> dict:
    runtime = _runtime()
    if runtime is None:
        _locked()
    return runtime.require_feature(feature)


def addon_path() -> Path | None:
    runtime = _runtime()
    if runtime is None:
        return None
    path = Path(runtime.__file__).resolve().parent / "addon" / "ee-addon.js"
    return path if path.is_file() else None


def extra_roots(project_id: str) -> list[Path]:
    runtime = _runtime()
    if runtime is None:
        return []
    return runtime.extra_roots(project_id)


def may_delete() -> bool:
    runtime = _runtime()
    if runtime is None:
        return True
    return bool(runtime.may_delete())


def _yaml_bytes(root: Path) -> bytes:
    path = root / "data.yaml"
    return path.read_bytes() if path.is_file() else b""


def _copy_verified(source: Path, target: Path) -> None:
    if target.exists():
        raise StudioError(code="path.busy")
    shutil.copy2(source, target)
    if target.read_bytes() != source.read_bytes():
        target.unlink(missing_ok=True)
        raise StudioError(code="move.verify")


def delete_project(project_id: str) -> dict:
    if not may_delete():
        raise StudioError(code="rbac.denied", status=403)
    with transaction():
        conn = connect()
        try:
            row = _project_row(conn, project_id)
            root = str(Path(row["root"]).resolve())
            conn.execute("DELETE FROM annotations WHERE project_id = ?", (project_id,))
            conn.execute("DELETE FROM images WHERE project_id = ?", (project_id,))
            conn.execute("DELETE FROM classes WHERE project_id = ?", (project_id,))
            conn.execute("DELETE FROM projects WHERE id = ?", (project_id,))
            conn.commit()
        finally:
            conn.close()
    if not Path(root).is_dir():
        raise StudioError(code="import.dirty")
    return {"ready": True, "id": project_id, "root": root}


def rename_entry(project_id: str, relative: str, name: str) -> dict:
    """Rename one file inside the project. Class ids in data.yaml stay put."""
    new_name = Path(str(name or "")).name
    if not new_name or new_name in {".", ".."} or "/" in str(name) or "\\" in str(name):
        raise StudioError(code="local.forbidden", status=403)
    with transaction():
        conn = connect()
        try:
            row = _project_row(conn, project_id)
            root = Path(row["root"]).resolve()
            before = _yaml_bytes(root)
            source = (root / str(relative).lstrip("/")).resolve()
            if not source.is_file() or not source.is_relative_to(root):
                raise StudioError(code="fs.missing", status=404)
            if source.name in {"data.yaml", "data.yml"}:
                raise StudioError(code="project.foreign")
            target = source.with_name(new_name)
            if target != source:
                _copy_verified(source, target)
                source.unlink()
            label = root / "labels" / f"{source.stem}.txt"
            if label.is_file() and label.is_relative_to(root):
                renamed = label.with_name(f"{target.stem}.txt")
                if renamed != label:
                    _copy_verified(label, renamed)
                    label.unlink()
                conn.execute(
                    "UPDATE images SET label_rel = ? WHERE project_id = ? AND label_rel = ?",
                    (renamed.relative_to(root).as_posix(), project_id, label.relative_to(root).as_posix()),
                )
            rel = target.relative_to(root).as_posix()
            conn.execute(
                "UPDATE images SET rel_path = ?, name = ?, stem = ? WHERE project_id = ? AND rel_path = ?",
                (rel, target.name, target.stem, project_id, source.relative_to(root).as_posix()),
            )
            if _yaml_bytes(root) != before:
                raise StudioError(code="import.dirty")
            conn.commit()
        finally:
            conn.close()
    return {"ready": True, "path": rel}


def __getattr__(name: str):
    if name not in _PAID:
        raise AttributeError(name)
    runtime = _runtime()
    if runtime is None:
        def _missing(*_args, **_kwargs):
            _locked()

        return _missing
    return getattr(runtime, name)
