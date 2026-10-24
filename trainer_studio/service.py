"""Project open, label save, schema and export. Dataset reads stay read-only until a save."""

from __future__ import annotations

import hashlib
import json
import re
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path

from trainer_studio import classops
from trainer_studio import progress as import_progress
from trainer_studio.catalog import display_titles, style_for
from trainer_studio.db import connect, data_dir, transaction
from trainer_studio.errors import StudioError
from trainer_studio.importer import build_snapshot, file_token, now, scan_tree, tree_guard
from trainer_studio.installpath import default_projects_dir, inside_install
from trainer_studio.messages import text
from trainer_studio.schema import clean_fields, fields_from_labeling, template_fields
from trainer_studio.writer import write_if_changed
from trainer_studio.yamlids import index_for_key, lock_report, read_name_pairs
from trainer_studio.yolo import FORMAT_NOTES, render_text, signature, validate_geometry


def _project_row(conn, project_id: str):
    row = conn.execute("SELECT * FROM projects WHERE id = ?", (project_id,)).fetchone()
    if row is None:
        raise StudioError(code="project.missing", status=404)
    return row


def _pairs(root: Path):
    return read_name_pairs(root / "data.yaml")


def _catalog_keys(conn, project_id: str) -> list[str]:
    rows = conn.execute(
        "SELECT key FROM classes WHERE project_id = ? ORDER BY sort_index, yaml_index",
        (project_id,),
    ).fetchall()
    return [row["key"] for row in rows]


def project_lock(conn, project_id: str, root: Path) -> dict:
    return lock_report(_pairs(root), _catalog_keys(conn, project_id))


def _public_project(conn, row) -> dict:
    root = Path(row["root"])
    lock = project_lock(conn, row["id"], root)
    count = conn.execute("SELECT COUNT(*) AS n FROM images WHERE project_id = ?", (row["id"],)).fetchone()["n"]
    return {
        "id": row["id"],
        "name": row["name"],
        "root": row["root"],
        "task": row["task"],
        "openedAt": row["opened_at"],
        "imageCount": count,
        "labelLock": lock,
        "createdByApp": bool(row["created_by_app"]),
    }


def list_projects() -> list[dict]:
    with transaction():
        conn = connect()
        try:
            rows = conn.execute("SELECT * FROM projects ORDER BY opened_at DESC").fetchall()
            return [_public_project(conn, row) for row in rows]
        finally:
            conn.close()


def _insert_snapshot(conn, project_id: str, snap: dict, keep_styles: dict | None = None) -> None:
    conn.execute("DELETE FROM classes WHERE project_id = ?", (project_id,))
    conn.execute("DELETE FROM annotations WHERE project_id = ?", (project_id,))
    conn.execute("DELETE FROM images WHERE project_id = ?", (project_id,))
    class_rows = []
    for row in snap["classes"]:
        style = (keep_styles or {}).get(row["key"]) or {}
        icon = style.get("icon") or row["icon"]
        class_rows.append((
            project_id,
            row["key"],
            row["yaml_index"],
            style.get("title") or row["title"],
            style.get("title_en") or row["title_en"],
            style.get("detail") or row["detail"],
            style.get("color") or row["color"],
            json.dumps(icon),
            row["sort_index"],
            style.get("hotkey") or "",
            style.get("parent_key") or "",
            style.get("attrs") or "",
        ))
    if class_rows:
        conn.executemany(
            """INSERT INTO classes (project_id, key, yaml_index, title, title_en, detail, color, icon, sort_index, visible, hotkey, parent_key, attrs)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)""",
            class_rows,
        )
    image_rows = []
    ann_rows = []
    for image in snap["images"]:
        image_rows.append((
            image["id"], project_id, image["stem"], image["rel_path"], image["name"], image["width"], image["height"],
            image["split"], image["status"], json.dumps(image["attributes"], ensure_ascii=False),
            json.dumps(image["meta"], ensure_ascii=False), image["label_rel"], image["label_sha"], image["sort_index"],
        ))
        for ann in image["annotations"]:
            ann_rows.append((
                ann["id"], project_id, image["id"], ann["class_key"], json.dumps(ann["geometry"]),
                json.dumps(ann["attributes"], ensure_ascii=False), ann["created_at"], ann["updated_at"], ann["ordinal"],
            ))
    if image_rows:
        conn.executemany(
            """INSERT INTO images (id, project_id, stem, rel_path, name, width, height, split, status, attributes, meta, label_rel, label_sha, sort_index)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            image_rows,
        )
    if ann_rows:
        conn.executemany(
            """INSERT INTO annotations (id, project_id, image_id, class_key, geometry, attributes, created_at, updated_at, ordinal)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            ann_rows,
        )


def open_dataset(path: str, task: str | None = None) -> dict:
    root = Path(path).expanduser().resolve()
    if root.is_file():
        parent = root.parent
        if root.suffix.lower() in {".yaml", ".yml"} or (parent / "data.yaml").is_file():
            root = parent
    import_progress.begin(str(root), 0)
    try:
        if not root.is_dir():
            raise StudioError(code="path.missing", status=404)
        if not (root / "data.yaml").is_file():
            raise StudioError(code="yaml.missing")
        scanned = scan_tree(root)
        before = scanned.guard
        fingerprint = _fingerprint(before)
        with transaction():
            conn = connect()
            try:
                existing = conn.execute("SELECT * FROM projects WHERE root = ?", (str(root),)).fetchone()
                if existing is not None and (not task or task == existing["task"]):
                    stored = conn.execute("SELECT value FROM kv WHERE key = ?", (f"fp:{existing['id']}",)).fetchone()
                    if stored and stored["value"] == fingerprint:
                        stamp = now()
                        conn.execute("UPDATE projects SET opened_at = ? WHERE id = ?", (stamp, existing["id"]))
                        _remember(conn, existing["id"], root, fingerprint)
                        conn.commit()
                        return _public_project(conn, _project_row(conn, existing["id"]))
            finally:
                conn.close()
        snap = build_snapshot(root, task, report=True, scanned=scanned)
        import_progress.tick("save", len(snap["images"]), len(snap["images"]))
        with transaction():
            conn = connect()
            try:
                existing = conn.execute("SELECT * FROM projects WHERE root = ?", (str(root),)).fetchone()
                stamp = now()
                if existing is None:
                    project_id = uuid.uuid4().hex
                    conn.execute(
                        "INSERT INTO projects (id, name, root, task, created_at, opened_at, schema_ready) VALUES (?, ?, ?, ?, ?, ?, ?)",
                        (project_id, snap["name"], str(root), snap["task"], stamp, stamp, 1 if snap["fields"] else 0),
                    )
                    _insert_snapshot(conn, project_id, snap)
                    if snap["fields"]:
                        _replace_fields(conn, project_id, snap["fields"])
                    elif snap["class_undo"] is not None:
                        _version(conn, project_id, None, "import", text("version.undo"), {"classUndo": snap["class_undo"]})
                else:
                    project_id = existing["id"]
                    styles = _styles(conn, project_id)
                    previous = _previous_images(conn, project_id)
                    _insert_snapshot(conn, project_id, snap, styles)
                    _restore_unchanged(conn, project_id, snap, previous)
                    conn.execute(
                        "UPDATE projects SET opened_at = ?, name = ? WHERE id = ?",
                        (stamp, snap["name"], project_id),
                    )
                    if not existing["schema_ready"] and snap["fields"]:
                        _replace_fields(conn, project_id, snap["fields"])
                        conn.execute("UPDATE projects SET schema_ready = 1 WHERE id = ?", (project_id,))
                if _guard(root) != before:
                    conn.rollback()
                    raise StudioError(code="import.dirty")
                _remember(conn, project_id, root, fingerprint)
                conn.commit()
                row = _project_row(conn, project_id)
                return _public_project(conn, row)
            finally:
                conn.close()
    finally:
        import_progress.finish()


def last_dataset_path() -> str:
    with transaction():
        conn = connect()
        try:
            row = conn.execute("SELECT value FROM kv WHERE key = 'last-dataset'").fetchone()
            return row["value"] if row else ""
        finally:
            conn.close()


def _remember(conn, project_id: str, root: Path, fingerprint: str) -> None:
    conn.execute("INSERT OR REPLACE INTO kv (key, value) VALUES ('last-dataset', ?)", (str(root),))
    conn.execute("INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)", (f"fp:{project_id}", fingerprint))


def _fingerprint(guard: tuple) -> str:
    return hashlib.sha256(repr(guard).encode("utf-8")).hexdigest()


def _guard(root: Path) -> tuple:
    """Change token for data.yaml, sidecars, labels and image files. Size and mtime only."""
    return tree_guard(root)


def studio_dataset_problem(raw: str) -> str:
    """Message when STUDIO_DATASET is set but is not a dataset folder. Empty if it can be opened."""
    path = Path(raw).expanduser()
    if path.is_file() and path.suffix.lower() in {".yaml", ".yml"}:
        path = path.parent
    if path.is_dir() and (path / "data.yaml").is_file():
        return ""
    return text("dataset.missing", path=str(path))


def _template_keys(template: str) -> list[str]:
    """Class names for a new project. Blank starts empty. SignLens is optional."""
    if template == "blank":
        return []
    if template == "signlens":
        from trainer_studio.catalog import signlens_template

        return [row["id"] for row in signlens_template()["classes"]]
    path = Path(__file__).resolve().parent / "templates" / f"{template}.json"
    if path.is_file():
        payload = json.loads(path.read_text(encoding="utf-8"))
        if isinstance(payload, list):
            return [str(item) for item in payload]
        if isinstance(payload, dict) and isinstance(payload.get("names"), list):
            return [str(item) for item in payload["names"]]
    raise StudioError(code="template.missing")


def create_project(path: str, name: str, template: str) -> dict:
    root = Path(path).expanduser().resolve()
    if inside_install(root):
        raise StudioError(code="project.install")
    if root.exists() and any(root.iterdir()):
        raise StudioError(code="path.busy")
    root.mkdir(parents=True, exist_ok=True)
    (root / "images").mkdir(exist_ok=True)
    (root / "labels").mkdir(exist_ok=True)
    keys = _template_keys(template)
    payload = {"path": ".", "train": "images", "val": "images", "names": list(keys)}
    (root / "data.yaml").write_text(__import__("yaml").safe_dump(payload, allow_unicode=True, sort_keys=False), encoding="utf-8")
    project = open_dataset(str(root), "detect")
    if template == "signlens":
        apply_template(project["id"], "signlens")
    with transaction():
        conn = connect()
        try:
            conn.execute(
                "UPDATE projects SET created_by_app = 1, name = ? WHERE id = ?",
                ((name[:80] if name else project["name"]), project["id"]),
            )
            conn.commit()
        finally:
            conn.close()
    project["createdByApp"] = True
    if name:
        project["name"] = name[:80]
    return project


def project_places() -> dict:
    trapped = []
    root = None
    try:
        from trainer_studio.installpath import install_root

        root = install_root()
        for project in list_projects():
            if project.get("createdByApp") and inside_install(Path(project["root"])):
                trapped.append(project)
    except Exception:
        trapped = []
    return {
        "defaultDir": str(default_projects_dir()),
        "installRoot": str(root or ""),
        "trapped": trapped,
    }


def _digest(path: Path) -> str:
    hasher = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            hasher.update(chunk)
    return hasher.hexdigest()


def _tree_manifest(root: Path) -> dict[str, str]:
    found: dict[str, str] = {}
    for path in sorted(root.rglob("*")):
        rel = path.relative_to(root).as_posix()
        if path.is_symlink():
            found[rel] = "link:" + str(path.readlink())
            continue
        if path.is_file():
            found[rel] = _digest(path)
    return found


def _holds_dataset(folder: Path) -> bool:
    if (folder / "data.yaml").is_file() or (folder / "data.yml").is_file():
        return True
    return (folder / "labels").exists()


def _same_tree(origin: Path, target: Path) -> bool:
    if _tree_manifest(origin) != _tree_manifest(target):
        return False
    for name in ("data.yaml", "data.yml"):
        src = origin / name
        if src.is_file() and (target / name).read_bytes() != src.read_bytes():
            return False
    labels = origin / "labels"
    if labels.is_dir():
        for path in labels.rglob("*"):
            if path.is_symlink() or not path.is_file():
                continue
            dest = target / path.relative_to(origin)
            if not dest.is_file() or dest.read_bytes() != path.read_bytes():
                return False
    return True


def move_project(project_id: str, dest: str, *, source: str = "", confirm: bool = False) -> dict:
    """Copy a project the app created, verify the copy, then remove the source.

    Startup never calls this. A folder with data.yaml or labels that this app
    did not create is refused. shutil.move is not used.
    """
    target = Path(dest).expanduser().resolve()
    if inside_install(target):
        raise StudioError(code="project.install")
    with transaction():
        conn = connect()
        try:
            row = _project_row(conn, project_id)
            origin = Path(row["root"]).expanduser().resolve()
            created = bool(row["created_by_app"])
        finally:
            conn.close()
    paths = {"source": str(origin), "target": str(target), "dataset": "yes" if _holds_dataset(origin) else "no"}
    if not created:
        raise StudioError(code="project.foreign", params=paths)
    if not confirm or not str(source).strip():
        raise StudioError(code="move.confirm", params=paths)
    if Path(source).expanduser().resolve() != origin:
        raise StudioError(code="move.confirm", params=paths)
    if target == origin:
        with transaction():
            conn = connect()
            try:
                return _public_project(conn, _project_row(conn, project_id))
            finally:
                conn.close()
    if target.exists():
        raise StudioError(code="path.busy")
    target.parent.mkdir(parents=True, exist_ok=True)
    try:
        shutil.copytree(origin, target, symlinks=True, copy_function=shutil.copy2)
        if not _same_tree(origin, target):
            raise StudioError(code="move.verify", params=paths)
    except StudioError:
        shutil.rmtree(target, ignore_errors=True)
        raise
    except Exception:
        shutil.rmtree(target, ignore_errors=True)
        raise StudioError(code="move.verify", params=paths) from None
    with transaction():
        conn = connect()
        try:
            row = _project_row(conn, project_id)
            if Path(row["root"]).expanduser().resolve() != origin:
                raise StudioError(code="move.verify", params=paths)
            conn.execute("UPDATE projects SET root = ? WHERE id = ?", (str(target), project_id))
            conn.commit()
            public = _public_project(conn, _project_row(conn, project_id))
        except Exception:
            conn.rollback()
            shutil.rmtree(target, ignore_errors=True)
            raise
        finally:
            conn.close()
    shutil.rmtree(origin)
    return public


def make_folder(project_id: str, relative: str) -> dict:
    with transaction():
        conn = connect()
        try:
            row = _project_row(conn, project_id)
        finally:
            conn.close()
    root = Path(row["root"]).expanduser().resolve()
    raw = str(relative or "").strip().replace("\\", "/").strip("/")
    if not raw or ".." in raw.split("/"):
        raise StudioError(code="local.forbidden", status=403)
    dest = (root / raw).resolve()
    try:
        dest.relative_to(root)
    except ValueError:
        raise StudioError(code="local.forbidden", status=403) from None
    dest.mkdir(parents=True, exist_ok=True)
    return {"path": str(dest)}


def set_image_split(project_id: str, image_id: str, split: str) -> dict:
    name = str(split or "").strip().lower()
    if name not in {"train", "val", "test", ""}:
        raise StudioError(code="task.invalid")
    with transaction():
        conn = connect()
        try:
            _project_row(conn, project_id)
            found = conn.execute("SELECT id FROM images WHERE project_id = ? AND id = ?", (project_id, image_id)).fetchone()
            if found is None:
                raise StudioError(code="image.missing", status=404)
            conn.execute("UPDATE images SET split = ? WHERE project_id = ? AND id = ?", (name or "train", project_id, image_id))
            conn.commit()
            return {"id": image_id, "split": name or "train"}
        finally:
            conn.close()


def _previous_images(conn, project_id: str) -> dict:
    found = {}
    rows = conn.execute("SELECT * FROM images WHERE project_id = ?", (project_id,)).fetchall()
    for row in rows:
        found[row["id"]] = {
            "sha": row["label_sha"],
            "status": row["status"],
            "attributes": row["attributes"],
            "annotations": conn.execute(
                "SELECT * FROM annotations WHERE project_id = ? AND image_id = ? ORDER BY ordinal",
                (project_id, row["id"]),
            ).fetchall(),
        }
    return found


def _restore_unchanged(conn, project_id: str, snap: dict, previous: dict) -> None:
    drop: list[tuple[str, str]] = []
    ann_rows = []
    image_rows = []
    for image in snap["images"]:
        old = previous.get(image["id"])
        if not old or old["sha"] != image["label_sha"]:
            continue
        drop.append((project_id, image["id"]))
        for ann in old["annotations"]:
            ann_rows.append((
                ann["id"], project_id, image["id"], ann["class_key"], ann["geometry"], ann["attributes"],
                ann["created_at"], ann["updated_at"], ann["ordinal"],
            ))
        image_rows.append((old["status"], old["attributes"], project_id, image["id"]))
    if drop:
        conn.executemany("DELETE FROM annotations WHERE project_id = ? AND image_id = ?", drop)
    if ann_rows:
        conn.executemany(
            """INSERT INTO annotations (id, project_id, image_id, class_key, geometry, attributes, created_at, updated_at, ordinal)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            ann_rows,
        )
    if image_rows:
        conn.executemany("UPDATE images SET status = ?, attributes = ? WHERE project_id = ? AND id = ?", image_rows)


def _styles(conn, project_id: str) -> dict:
    rows = conn.execute("SELECT * FROM classes WHERE project_id = ?", (project_id,)).fetchall()
    found = {}
    for row in rows:
        found[row["key"]] = {
            "title": row["title"],
            "title_en": row["title_en"],
            "detail": row["detail"],
            "color": row["color"],
            "icon": json.loads(row["icon"]),
            "hotkey": row["hotkey"] if "hotkey" in row.keys() else "",
            "parent_key": row["parent_key"] if "parent_key" in row.keys() else "",
            "attrs": row["attrs"] if "attrs" in row.keys() else "",
        }
    return found


def _replace_fields(conn, project_id: str, fields: list[dict]) -> None:
    conn.execute("DELETE FROM fields WHERE project_id = ?", (project_id,))
    for index, field in enumerate(fields):
        conn.execute(
            "INSERT INTO fields (project_id, field_id, payload, sort_index) VALUES (?, ?, ?, ?)",
            (project_id, field["id"], json.dumps(field, ensure_ascii=False), index),
        )


def _version(conn, project_id: str, image_id: str | None, kind: str, note: str, payload: dict, backup: str | None = None) -> None:
    conn.execute(
        "INSERT INTO versions (project_id, image_id, kind, note, backup_path, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        (project_id, image_id, kind, note, backup, json.dumps(payload, ensure_ascii=False)[:20000], now()),
    )
    conn.execute(
        """DELETE FROM versions WHERE project_id = ? AND id NOT IN (
             SELECT id FROM versions WHERE project_id = ? ORDER BY id DESC LIMIT 200
           )""",
        (project_id, project_id),
    )


def get_project(project_id: str) -> dict:
    with transaction():
        conn = connect()
        try:
            return _public_project(conn, _project_row(conn, project_id))
        finally:
            conn.close()


def list_classes(project_id: str) -> dict:
    with transaction():
        conn = connect()
        try:
            row = _project_row(conn, project_id)
            root = Path(row["root"])
            pairs = _pairs(root) or []
            live = {name: index for index, name in pairs}
            rows = conn.execute(
                "SELECT * FROM classes WHERE project_id = ? ORDER BY sort_index",
                (project_id,),
            ).fetchall()
            counts = {
                item["class_key"]: item["n"]
                for item in conn.execute(
                    """SELECT a.class_key AS class_key, COUNT(*) AS n
                       FROM annotations a JOIN images i ON a.image_id = i.id AND a.project_id = i.project_id
                       WHERE i.project_id = ? GROUP BY a.class_key""",
                    (project_id,),
                )
            }
            classes = []
            for item in rows:
                title, title_en = display_titles(item["key"], item["title"], item["title_en"], item["detail"] or "")
                classes.append({
                    "id": item["key"],
                    "index": live.get(item["key"], item["yaml_index"]),
                    "title": title,
                    "titleEn": title_en,
                    "detail": item["detail"],
                    "color": item["color"],
                    "icon": json.loads(item["icon"]),
                    "visible": bool(item["visible"]),
                    "count": int(counts.get(item["key"], 0)),
                    "hotkey": item["hotkey"] if "hotkey" in item.keys() else "",
                    "parent": item["parent_key"] if "parent_key" in item.keys() else "",
                    "attrs": item["attrs"] if "attrs" in item.keys() else "",
                })
            present = [name for name in ("labeling.json", "catalog.json") if (root / name).is_file()]
            return {"classes": classes, "labelLock": project_lock(conn, project_id, root), "styleFiles": present}
        finally:
            conn.close()


def update_class_style(project_id: str, key: str, body: dict) -> dict:
    with transaction():
        conn = connect()
        try:
            project = _project_row(conn, project_id)
            row = conn.execute("SELECT * FROM classes WHERE project_id = ? AND key = ?", (project_id, key)).fetchone()
            if row is None:
                raise StudioError(code="class.missing", status=404, params={"key": key})
            before = _label_bytes(Path(project["root"]))
            yaml_before = (Path(project["root"]) / "data.yaml").read_bytes() if (Path(project["root"]) / "data.yaml").is_file() else b""
            title = str(body["title"])[:80] if "title" in body and str(body.get("title") or "").strip() else row["title"]
            title_en = str(body["titleEn"])[:80] if "titleEn" in body and str(body.get("titleEn") or "").strip() else row["title_en"]
            color = str(body.get("color") or row["color"])
            if not __import__("re").fullmatch(r"#[0-9a-fA-F]{6}", color):
                raise StudioError(code="color.invalid")
            icon = body.get("icon") or json.loads(row["icon"])
            from trainer_studio.schema import clean_icon

            cleaned = clean_icon(icon) or {"kind": "lucide", "name": "Tag"}
            hotkey = str(row["hotkey"] or "") if "hotkey" in row.keys() else ""
            if "hotkey" in body:
                hotkey = str(body.get("hotkey") or "")[:1].lower()
            parent = str(row["parent_key"] or "") if "parent_key" in row.keys() else ""
            if "parent" in body:
                parent = str(body.get("parent") or "")[:80]
            attrs = str(row["attrs"] or "") if "attrs" in row.keys() else ""
            if "attrs" in body:
                attrs = str(body.get("attrs") or "")[:240]
            visible = int(row["visible"])
            if "visible" in body:
                visible = 1 if body.get("visible") else 0
            if hotkey:
                taken = conn.execute(
                    "SELECT key FROM classes WHERE project_id = ? AND lower(hotkey) = ? AND key != ?",
                    (project_id, hotkey, key),
                ).fetchone()
                if taken is not None:
                    raise StudioError(code="class.hotkey")
            styles_before = _styles(conn, project_id)
            conn.execute(
                """UPDATE classes SET title = ?, title_en = ?, color = ?, icon = ?, hotkey = ?, parent_key = ?, attrs = ?, visible = ?
                   WHERE project_id = ? AND key = ?""",
                (title, title_en, color.lower(), json.dumps(cleaned), hotkey, parent, attrs, visible, project_id, key),
            )
            fields: dict = {}
            if "title" in body:
                fields["title"] = title
            if "titleEn" in body:
                fields["titleEn"] = title_en
            if "color" in body:
                fields["color"] = color.lower()
            if "hotkey" in body:
                fields["hotkey"] = hotkey
            if "parent" in body:
                fields["group"] = parent
            if "visible" in body:
                fields["deprecated"] = not bool(visible)
            if "icon" in body:
                fields["icon"] = cleaned
            root = Path(project["root"])
            edits = [{"id": key, "set": fields}] if fields else []
            mirrored = _mirror_class_files(conn, project_id, root, styles_before, edits)
            if _label_bytes(root) != before or ((root / "data.yaml").read_bytes() if (root / "data.yaml").is_file() else b"") != yaml_before:
                if mirrored["backup"]:
                    classops.restore_tree(Path(mirrored["backup"]), root)
                conn.rollback()
                raise StudioError(code="import.dirty")
            if mirrored["backup"]:
                _version(conn, project_id, None, "class_style", text("version.undo"), {"op": "style", "written": mirrored["written"]}, mirrored["backup"])
            conn.commit()
            return {
                "id": key,
                "title": title,
                "titleEn": title_en,
                "color": color.lower(),
                "icon": cleaned,
                "hotkey": hotkey,
                "parent": parent,
                "attrs": attrs,
                "visible": bool(visible),
                "files": mirrored["written"],
            }
        finally:
            conn.close()


def _mirror_class_files(conn, project_id: str, root: Path, styles_before: dict | None = None, edits: list[dict] | None = None) -> dict:
    """Patch labeling.json and catalog.json with one Legacy override per edit.

    ``edits`` is ``{"id", "set"}`` and ``set`` holds only the fields the
    caller changed. Other classes stay absent so Legacy keeps its defaults.
    Unknown keys and the file's indent stay. A timestamped backup is taken
    before each real write. data.yaml and label bytes are not touched.
    """
    from datetime import datetime, timezone

    from trainer_studio.labeling_sync import patch_labeling_text
    from trainer_studio.writer import atomic_write_text

    if not edits:
        return {"written": [], "backup": None}
    planned: list[tuple[Path, str]] = []
    for name in ("labeling.json", "catalog.json"):
        path = root / name
        if not path.is_file():
            continue
        original = path.read_text(encoding="utf-8")
        try:
            updated = patch_labeling_text(original, edits)
        except json.JSONDecodeError:
            continue
        if updated != original:
            planned.append((path, updated))
    if not planned:
        return {"written": [], "backup": None}
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    dest = data_dir() / "backups" / project_id / stamp
    dest.mkdir(parents=True, exist_ok=True)
    if styles_before is not None:
        (dest / "styles.json").write_text(json.dumps(styles_before), encoding="utf-8")
    written: list[str] = []
    try:
        for path, updated in planned:
            (dest / path.name).write_bytes(path.read_bytes())
            atomic_write_text(path, updated)
            written.append(path.name)
    except Exception:
        for path, _updated in planned:
            saved = dest / path.name
            if saved.is_file():
                path.write_bytes(saved.read_bytes())
        raise
    return {"written": written, "backup": str(dest)}


def _label_retarget(op: str, body: dict) -> tuple[dict[str, str], set[str]]:
    if op == "rename":
        old, new = str(body.get("key") or ""), str(body.get("next") or "")
        if old and new and old != new:
            return {old: new}, set()
    if op == "delete":
        key = str(body.get("key") or "")
        if key:
            return {}, {key}
    if op == "merge":
        source = str(body.get("source") or "")
        if source:
            return {}, {source}
    return {}, set()


def _retarget_class_files(root: Path, renames: dict[str, str], removed: set[str]) -> None:
    """Move or drop an override id. Never append the rest of the catalog."""
    if not renames and not removed:
        return
    from trainer_studio.labeling_sync import retarget_labeling_text
    from trainer_studio.writer import atomic_write_text

    for name in ("labeling.json", "catalog.json"):
        path = root / name
        if not path.is_file():
            continue
        original = path.read_text(encoding="utf-8")
        try:
            updated = retarget_labeling_text(original, renames, removed)
        except json.JSONDecodeError:
            continue
        if updated != original:
            atomic_write_text(path, updated)


def undo_class_change(project_id: str) -> dict:
    with transaction():
        conn = connect()
        try:
            row = _project_row(conn, project_id)
            root = Path(row["root"])
            version = conn.execute(
                """SELECT id, backup_path, payload FROM versions
                   WHERE project_id = ? AND kind IN ('class_op', 'class_style') AND backup_path IS NOT NULL
                   ORDER BY id DESC LIMIT 1""",
                (project_id,),
            ).fetchone()
            if version is None or not version["backup_path"]:
                raise StudioError(code="class.undo")
            try:
                payload = json.loads(version["payload"] or "{}")
            except json.JSONDecodeError:
                payload = {}
            if payload.get("undone"):
                raise StudioError(code="class.undo")
            backup = Path(version["backup_path"])
            if not backup.is_dir():
                raise StudioError(code="class.undo")
            classops.restore_tree(backup, root)
            styles = {}
            style_path = backup / "styles.json"
            if style_path.is_file():
                try:
                    loaded = json.loads(style_path.read_text(encoding="utf-8"))
                    if isinstance(loaded, dict):
                        styles = loaded
                except json.JSONDecodeError:
                    styles = _styles(conn, project_id)
            else:
                styles = _styles(conn, project_id)
            snap = build_snapshot(root, row["task"])
            _insert_snapshot(conn, project_id, snap, styles)
            payload["undone"] = True
            conn.execute("UPDATE versions SET payload = ? WHERE id = ?", (json.dumps(payload), version["id"]))
            conn.commit()
            return {"restored": True, "backup": str(backup)}
        finally:
            conn.close()


def list_images(project_id: str) -> list[dict]:
    with transaction():
        conn = connect()
        try:
            _project_row(conn, project_id)
            rows = conn.execute(
                """SELECT i.*, (SELECT COUNT(*) FROM annotations a WHERE a.project_id = i.project_id AND a.image_id = i.id) AS ann_count
                   FROM images i WHERE i.project_id = ? ORDER BY i.sort_index""",
                (project_id,),
            ).fetchall()
            class_ids: dict[str, set[str]] = {}
            for link in conn.execute(
                """SELECT a.image_id AS image_id, a.class_key AS class_key
                   FROM annotations a JOIN images i ON a.image_id = i.id AND a.project_id = i.project_id
                   WHERE i.project_id = ?""",
                (project_id,),
            ):
                class_ids.setdefault(link["image_id"], set()).add(link["class_key"])
            return [
                {
                    "id": row["id"],
                    "name": row["name"],
                    "relPath": row["rel_path"],
                    "width": row["width"],
                    "height": row["height"],
                    "status": row["status"],
                    "split": row["split"],
                    "annCount": row["ann_count"],
                    "sortIndex": row["sort_index"],
                    "classIds": sorted(class_ids.get(row["id"], set())),
                }
                for row in rows
            ]
        finally:
            conn.close()


def _annotations(conn, project_id: str, image_id: str) -> list[dict]:
    rows = conn.execute(
        "SELECT * FROM annotations WHERE project_id = ? AND image_id = ? ORDER BY ordinal, id",
        (project_id, image_id),
    ).fetchall()
    items = []
    for row in rows:
        items.append({
            "id": row["id"],
            "imageId": image_id,
            "classId": row["class_key"],
            "geometry": json.loads(row["geometry"]),
            "attributes": json.loads(row["attributes"]),
            "createdAt": row["created_at"],
            "updatedAt": row["updated_at"],
        })
    return items


def get_image(project_id: str, image_id: str) -> dict:
    with transaction():
        conn = connect()
        try:
            row = _image_row(conn, project_id, image_id)
            return _public_image(conn, row)
        finally:
            conn.close()


def _allowed_path(project_id: str, root: Path, raw: str) -> Path:
    """A project file, or a file under an Enterprise extra folder. `..` escapes stay forbidden."""
    from trainer_studio.enterprise import extra_roots

    roots = [root.resolve(), *extra_roots(project_id)]
    candidate = Path(str(raw or ""))
    path = candidate.resolve() if candidate.is_absolute() else (root / candidate).resolve()
    if not any(path == item or path.is_relative_to(item) for item in roots):
        raise StudioError(code="local.forbidden", status=403)
    return path


def image_raw(project_id: str, image_id: str) -> dict:
    """Read the label file and image metadata. Does not write labels or data.yaml."""
    from trainer_studio.rawview import annotate_lines, image_facts, label_facts

    conn = connect()
    try:
        project = _project_row(conn, project_id)
        row = _image_row(conn, project_id, image_id)
        root = Path(project["root"]).resolve()
        image_path = _allowed_path(project_id, root, row["rel_path"])
        if not image_path.is_file():
            raise StudioError(code="image.file", status=404)
        label_rel = row["label_rel"] or f"labels/{row['stem']}.txt"
        label_path = _allowed_path(project_id, root, label_rel)
        label_ok = label_path.is_file()
        label_text = label_path.read_text(encoding="utf-8") if label_ok else ""
        pairs = _pairs(root) or []
        titles: dict[str, str] = {}
        for item in conn.execute("SELECT key, title, title_en, detail FROM classes WHERE project_id = ?", (project_id,)):
            title, _title_en = display_titles(item["key"], item["title"] or "", item["title_en"] or "", item["detail"] or "")
            titles[item["key"]] = title
        by_index = {index: (key, titles.get(key) or key) for index, key in pairs}
        ordered = [by_index.get(index, ("", "")) for index in range(max(by_index) + 1)] if by_index else []
        label = label_facts(label_path) if label_ok else None
        yaml_path = root / "data.yaml"
        yaml_text = yaml_path.read_text(encoding="utf-8") if yaml_path.is_file() else ""
        return {
            "imagePath": str(image_path),
            "labelPath": str(label_path) if label_ok else "",
            "labelRel": label_rel if label_ok else "",
            "labelText": label_text,
            "yamlText": yaml_text,
            "label": label,
            "lines": annotate_lines(label_text, ordered),
            "image": image_facts(image_path),
        }
    finally:
        conn.close()


def _image_row(conn, project_id: str, image_id: str):
    row = conn.execute("SELECT * FROM images WHERE project_id = ? AND id = ?", (project_id, image_id)).fetchone()
    if row is None:
        raise StudioError(code="image.missing", status=404)
    return row


def _public_image(conn, row) -> dict:
    return {
        "id": row["id"],
        "projectId": row["project_id"],
        "name": row["name"],
        "width": row["width"],
        "height": row["height"],
        "status": row["status"],
        "split": row["split"],
        "attributes": json.loads(row["attributes"]),
        "meta": json.loads(row["meta"]),
        "annotations": _annotations(conn, row["project_id"], row["id"]),
        "fileUrl": f"/api/projects/{row['project_id']}/images/{row['id']}/file",
        "thumbUrl": f"/api/projects/{row['project_id']}/images/{row['id']}/thumb",
    }


def image_file(project_id: str, image_id: str) -> Path:
    with transaction():
        conn = connect()
        try:
            project = _project_row(conn, project_id)
            row = _image_row(conn, project_id, image_id)
            root = Path(project["root"]).resolve()
            path = _allowed_path(project_id, root, row["rel_path"])
            if not path.is_file():
                raise StudioError(code="image.file", status=404)
            return path
        finally:
            conn.close()


def save_image(project_id: str, image_id: str, annotations: list[dict], attributes: dict | None, status: str | None) -> dict:
    with transaction():
        conn = connect()
        try:
            project = _project_row(conn, project_id)
            row = _image_row(conn, project_id, image_id)
            root = Path(project["root"])
            pairs = _pairs(root)
            if not pairs:
                raise StudioError(code="yaml.missing")
            task = project["task"]
            rendered_rows = []
            clean = []
            stamp = now()
            for ordinal, ann in enumerate(annotations or []):
                if not isinstance(ann, dict):
                    continue
                key = str(ann.get("classId") or ann.get("classKey") or "").strip()
                geometry = ann.get("geometry") or {}
                attrs = ann.get("attributes") if isinstance(ann.get("attributes"), dict) else {}
                pending = attrs.get("review") == "pending"
                if not pending:
                    if geometry.get("type") == "raw":
                        index = attrs.get("_yamlIndex")
                        if not isinstance(index, int):
                            index = 0
                        rendered_rows.append((int(index), geometry))
                    else:
                        if not key:
                            raise StudioError(code="class.invalid")
                        index = index_for_key(pairs, key)
                        if index is None:
                            raise StudioError(code="class.missing", params={"key": key})
                        rendered_rows.append((index, geometry))
                elif key and geometry.get("type") != "raw" and index_for_key(pairs, key) is None:
                    raise StudioError(code="class.missing", params={"key": key})
                ann_id = str(ann.get("id") or uuid.uuid4().hex)
                if not __import__("re").fullmatch(r"[A-Za-z0-9_.:-]{1,80}", ann_id):
                    ann_id = uuid.uuid4().hex
                clean.append((ann_id, key, geometry, attrs, str(ann.get("createdAt") or stamp), stamp, ordinal))
            rendered = render_text(rendered_rows, int(row["width"]), int(row["height"]), task)
            label_rel = row["label_rel"] or f"labels/{row['stem']}.txt"
            label_path = root / label_rel
            current = label_path.read_text(encoding="utf-8") if label_path.is_file() else None
            touched = False
            backup = None
            unchanged = current is not None and signature(current) is not None and signature(current) == signature(rendered)
            same_text = current == rendered or (current is None and rendered == "")
            if not unchanged and not same_text:
                backup_root = data_dir() / "backups" / project_id
                result = write_if_changed(label_path, rendered, backup_root)
                touched = result["written"]
                backup = result["backup"]
            if label_path.is_file():
                st = label_path.stat()
                digest = file_token(st.st_size, st.st_mtime_ns)
            else:
                digest = file_token(0, 0)
            conn.execute("DELETE FROM annotations WHERE project_id = ? AND image_id = ?", (project_id, image_id))
            for ann_id, key, geometry, attrs, created, updated, ordinal in clean:
                conn.execute(
                    """INSERT INTO annotations (id, project_id, image_id, class_key, geometry, attributes, created_at, updated_at, ordinal)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                    (ann_id, project_id, image_id, key, json.dumps(geometry), json.dumps(attrs, ensure_ascii=False), created, updated, ordinal),
                )
            has_pending = any(item[3].get("review") == "pending" for item in clean)
            committed = any(item[3].get("review") != "pending" for item in clean)
            if has_pending:
                next_status = "review"
            elif status in {"unlabeled", "labeled", "review"}:
                next_status = status
            else:
                next_status = "labeled" if committed else "unlabeled"
            attr_json = json.dumps(attributes, ensure_ascii=False) if isinstance(attributes, dict) else row["attributes"]
            conn.execute(
                "UPDATE images SET status = ?, attributes = ?, label_rel = ?, label_sha = ? WHERE project_id = ? AND id = ?",
                (next_status, attr_json, label_rel if label_path.is_file() else row["label_rel"], digest, project_id, image_id),
            )
            _version(conn, project_id, image_id, "label_write", text("version.label"), {"written": touched, "bytesIdentical": not touched}, backup)
            conn.commit()
            fresh = _image_row(conn, project_id, image_id)
            payload = _public_image(conn, fresh)
            payload["written"] = touched
            payload["bytesIdentical"] = not touched
            payload["labelLock"] = project_lock(conn, project_id, root)
            # Resolved indexes for the regression test and the UI.
            payload["resolved"] = [
                {"classId": item["classId"], "index": index_for_key(pairs, item["classId"])}
                for item in payload["annotations"]
                if item["classId"]
            ]
            return payload
        finally:
            conn.close()


def get_schema(project_id: str) -> dict:
    with transaction():
        conn = connect()
        try:
            _project_row(conn, project_id)
            rows = conn.execute("SELECT payload FROM fields WHERE project_id = ? ORDER BY sort_index", (project_id,)).fetchall()
            return {"fields": [json.loads(row["payload"]) for row in rows]}
        finally:
            conn.close()


def put_schema(project_id: str, fields: list) -> dict:
    cleaned = clean_fields(fields)
    with transaction():
        conn = connect()
        try:
            _project_row(conn, project_id)
            _replace_fields(conn, project_id, cleaned)
            conn.execute("UPDATE projects SET schema_ready = 1 WHERE id = ?", (project_id,))
            conn.commit()
            return {"fields": cleaned}
        finally:
            conn.close()


def import_legacy_schema(project_id: str, source: str | None = None) -> dict:
    """Copy Trainer Studio Legacy labeling.json fields and attributes into SQLite. The file stays untouched."""
    with transaction():
        conn = connect()
        try:
            row = _project_row(conn, project_id)
            if source:
                path = Path(source).expanduser().resolve()
            else:
                path = Path(row["root"]) / "labeling.json"
            if path.suffix.lower() != ".json" or not path.is_file():
                raise StudioError(code="legacy.missing")
            before = path.read_bytes()
            try:
                payload = json.loads(before.decode("utf-8"))
            except json.JSONDecodeError as exc:
                raise StudioError(code="legacy.invalid") from exc
            document = payload if isinstance(payload, dict) else {}
            fields = fields_from_labeling(document)
            copied = _legacy_attributes(conn, project_id, document)
            if not fields and copied == 0:
                raise StudioError(code="legacy.empty")
            if fields:
                _replace_fields(conn, project_id, fields)
                conn.execute("UPDATE projects SET schema_ready = 1 WHERE id = ?", (project_id,))
            conn.commit()
            if path.read_bytes() != before:
                raise StudioError(code="legacy.wrote")
            return {"fields": fields, "attributes": copied, "source": "labeling.json", "bytesIdentical": True}
        finally:
            conn.close()


def _legacy_attributes(conn, project_id: str, payload: dict) -> int:
    copied = 0
    for entry in _legacy_entries(payload):
        image = _legacy_image(conn, project_id, entry)
        if image is None:
            continue
        extra = entry.get("attributes") if isinstance(entry.get("attributes"), dict) else {}
        if extra:
            current = json.loads(image["attributes"])
            merged = _merge_attr(current, extra)
            if merged != current:
                conn.execute("UPDATE images SET attributes = ? WHERE project_id = ? AND id = ?", (json.dumps(merged, ensure_ascii=False), project_id, image["id"]))
                copied += 1
        boxes = entry.get("boxes") if isinstance(entry.get("boxes"), list) else entry.get("annotations")
        if not isinstance(boxes, list):
            continue
        anns = _annotations(conn, project_id, image["id"])
        for ordinal, box in enumerate(boxes):
            if not isinstance(box, dict):
                continue
            attrs = box.get("attributes") if isinstance(box.get("attributes"), dict) else {}
            loose = {key: value for key, value in box.items() if key not in {"id", "cls", "classId", "attributes", "geometry", "bbox", "x", "y", "w", "h", "cx", "cy", "width", "height"}}
            merged_box = _merge_attr(attrs, loose)
            if not merged_box:
                continue
            match = None
            wanted = str(box.get("id") or "")
            for ann in anns:
                source = str((ann.get("attributes") or {}).get("_sourceId") or "")
                if wanted and (source == wanted or ann["id"] == wanted):
                    match = ann
                    break
            if match is None and ordinal < len(anns):
                match = anns[ordinal]
            if match is None:
                continue
            current = dict(match["attributes"])
            merged = _merge_attr(current, merged_box)
            if merged == current:
                continue
            conn.execute(
                "UPDATE annotations SET attributes = ? WHERE project_id = ? AND id = ?",
                (json.dumps(merged, ensure_ascii=False), project_id, match["id"]),
            )
            match["attributes"] = merged
            copied += 1
    return copied


def _legacy_entries(payload: dict) -> list[dict]:
    rows = []
    images = payload.get("images")
    if isinstance(images, list):
        rows.extend(item for item in images if isinstance(item, dict))
    elif isinstance(images, dict):
        for key, value in images.items():
            if isinstance(value, dict):
                rows.append({"id": key, **value})
    attributes = payload.get("attributes")
    if isinstance(attributes, dict):
        for key, value in attributes.items():
            if isinstance(value, dict):
                rows.append({"id": key, "name": key, "attributes": value})
    return rows


def _legacy_image(conn, project_id: str, entry: dict):
    wanted = {str(entry.get("id") or ""), str(entry.get("name") or ""), Path(str(entry.get("file") or "")).name}
    wanted.discard("")
    if not wanted:
        return None
    for row in conn.execute("SELECT * FROM images WHERE project_id = ?", (project_id,)).fetchall():
        names = {row["id"], row["name"], row["stem"], Path(row["rel_path"]).name}
        if wanted & names:
            return row
    return None


def _merge_attr(current: dict, extra: dict) -> dict:
    merged = dict(current)
    for key, value in extra.items():
        if str(key).startswith("_"):
            continue
        if isinstance(value, (str, int, float, bool)) or (
            isinstance(value, list) and all(isinstance(item, (str, int, float, bool)) for item in value)
        ):
            merged[str(key)] = value
    return merged


def apply_template(project_id: str, template: str) -> dict:
    with transaction():
        conn = connect()
        try:
            row = _project_row(conn, project_id)
            keys = _catalog_keys(conn, row["id"])
            fields = template_fields(template, keys)
            _replace_fields(conn, project_id, fields)
            conn.execute("UPDATE projects SET schema_ready = 1 WHERE id = ?", (project_id,))
            conn.commit()
            return {"fields": fields, "template": template}
        finally:
            conn.close()


def _new_class_style(body: dict, styles: dict) -> dict:
    key = str(body.get("key") or "").strip()
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_-]{0,63}", key):
        raise StudioError(code="class.invalid")
    hotkey = str(body.get("hotkey") or "").strip()[:1]
    if hotkey and any(str(item.get("hotkey") or "") == hotkey for item in styles.values()):
        raise StudioError(code="class.invalid")
    color = str(body.get("color") or "#3dd68c")
    if not re.fullmatch(r"#[0-9a-fA-F]{6}", color):
        color = "#3dd68c"
    title = str(body.get("title") or key).strip()[:80] or key
    title_en = str(body.get("titleEn") or title).strip()[:80] or title
    icon_name = "Tag"
    icon = body.get("icon")
    if isinstance(icon, str) and icon.strip():
        icon_name = icon.strip()[:40]
    elif isinstance(icon, dict) and icon.get("name"):
        icon_name = str(icon.get("name"))[:40]
    from trainer_studio.schema import clean_icon

    cleaned = clean_icon({"kind": "lucide", "name": icon_name}) or {"kind": "lucide", "name": "Tag"}
    return {
        "key": key,
        "style": {
            "title": title,
            "title_en": title_en,
            "detail": str(body.get("detail") or "").strip()[:240],
            "color": color.lower(),
            "icon": cleaned,
            "hotkey": hotkey,
            "parent_key": str(body.get("parent") or "").strip()[:80],
            "attrs": str(body.get("attrs") or "").strip()[:240],
        },
    }


def project_tree(project_id: str) -> dict:
    """List the project folder. Reads names and icon colors. Does not write data.yaml."""
    from trainer_studio.treeicons import file_style, folder_style

    with transaction():
        conn = connect()
        try:
            row = _project_row(conn, project_id)
            root = Path(row["root"]).resolve()
            images = {
                str(item["rel_path"]).replace("\\", "/"): item["id"]
                for item in conn.execute("SELECT id, rel_path FROM images WHERE project_id = ?", (project_id,))
            }
        finally:
            conn.close()
    skip = {".git", "node_modules", ".venv", "__pycache__", "trash"}
    entries: list[dict] = []

    def walk(folder: Path, rel: str, depth: int) -> None:
        if depth > 5 or len(entries) > 800:
            return
        try:
            children = sorted(folder.iterdir(), key=lambda item: (not item.is_dir(), item.name.lower()))
        except OSError:
            return
        for child in children:
            if child.name.startswith(".") or child.name in skip:
                continue
            path = f"{rel}/{child.name}" if rel else child.name
            if child.is_dir():
                style = folder_style(child.name)
                entries.append({"name": child.name, "path": path, "kind": "dir", "color": style["color"], "icon": style["icon"], "imageId": ""})
                walk(child, path, depth + 1)
            elif child.is_file():
                style = file_style(child.name)
                entries.append({
                    "name": child.name,
                    "path": path,
                    "kind": "file",
                    "color": style["color"],
                    "icon": style["icon"],
                    "imageId": images.get(path, ""),
                })

    walk(root, "", 0)
    return {"entries": entries}


def class_preview(project_id: str, body: dict) -> dict:
    with transaction():
        conn = connect()
        try:
            row = _project_row(conn, project_id)
            root = Path(row["root"])
            classops.refuse_if_locked(project_lock(conn, project_id, root))
            return classops.preview_op(root, str(body.get("op") or ""), body)
        finally:
            conn.close()


def class_apply(project_id: str, body: dict) -> dict:
    with transaction():
        conn = connect()
        try:
            row = _project_row(conn, project_id)
            root = Path(row["root"])
            classops.refuse_if_locked(project_lock(conn, project_id, root))
            before_labels = _label_bytes(root)
            styles = _styles(conn, project_id)
            added = _new_class_style(body, styles) if str(body.get("op") or "") == "add" else None
            op_name = str(body.get("op") or "")
            if op_name == "deprecate":
                key = str(body.get("key") or "")
                found = conn.execute("SELECT key FROM classes WHERE project_id = ? AND key = ?", (project_id, key)).fetchone()
                if found is None:
                    raise StudioError(code="class.missing", status=404, params={"key": key})
                conn.execute("UPDATE classes SET visible = 0 WHERE project_id = ? AND key = ?", (project_id, key))
                mirrored = _mirror_class_files(conn, project_id, root, styles, [{"id": key, "set": {"deprecated": True}}])
                if _label_bytes(root) != before_labels:
                    if mirrored["backup"]:
                        classops.restore_tree(Path(mirrored["backup"]), root)
                    conn.rollback()
                    raise StudioError(code="import.dirty")
                if mirrored["backup"]:
                    _version(conn, project_id, None, "class_style", text("version.undo"), {"op": "deprecate", "written": mirrored["written"]}, mirrored["backup"])
                conn.commit()
                return {"op": "deprecate", "written": mirrored["written"], "unchanged": True, "verified": True, "key": key, "files": mirrored["written"]}
            result = classops.apply_op(root, op_name, body, data_dir() / "backups" / project_id)
            backup = str(result.get("backup") or "")
            if backup:
                (Path(backup) / "styles.json").write_text(json.dumps(styles), encoding="utf-8")
            if added:
                styles[added["key"]] = added["style"]
            if op_name == "rename":
                old_key, new_key = str(body.get("key") or ""), str(body.get("next") or "")
                if old_key in styles and new_key:
                    styles[new_key] = styles[old_key]
            # Rebuild catalog order from the yaml just written. Styles follow the key.
            snap = build_snapshot(root, row["task"])
            # Keep annotations that were not label-driven: class ops rewrite files, so reimport is the source of truth.
            _insert_snapshot(conn, project_id, snap, styles)
            if body.get("op") == "rename":
                old, new = str(body.get("key") or ""), str(body.get("next") or "")
                if old in styles and new:
                    style = styles[old]
                    conn.execute(
                        "UPDATE classes SET title = ?, title_en = ?, detail = ?, color = ?, icon = ? WHERE project_id = ? AND key = ?",
                        (style["title"], style["title_en"], style["detail"], style["color"], json.dumps(style["icon"]), project_id, new),
                    )
            try:
                _retarget_class_files(root, *_label_retarget(op_name, body))
            except Exception:
                if backup:
                    classops.restore_tree(Path(backup), root)
                raise
            _version(conn, project_id, None, "class_op", result["note"], {"op": body.get("op"), "written": result["written"]}, backup or None)
            conn.commit()
            result["labelLock"] = project_lock(conn, project_id, root)
            result["unchanged"] = _label_bytes(root) == before_labels
            return result
        finally:
            conn.close()


def align_catalog(project_id: str) -> dict:
    """Make the sqlite catalog match data.yaml. Does not touch label files."""
    with transaction():
        conn = connect()
        try:
            row = _project_row(conn, project_id)
            root = Path(row["root"])
            before = _guard(root)
            styles = _styles(conn, project_id)
            pairs = _pairs(root) or []
            conn.execute("DELETE FROM classes WHERE project_id = ?", (project_id,))
            for position, (index, key) in enumerate(pairs):
                base = styles.get(key) or style_for(key, index)
                conn.execute(
                    """INSERT INTO classes (project_id, key, yaml_index, title, title_en, detail, color, icon, sort_index, visible, hotkey, parent_key, attrs)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)""",
                    (
                        project_id, key, index, base["title"], base.get("title_en") or base.get("title"),
                        base.get("detail") or "", base["color"], json.dumps(base["icon"]), position,
                        base.get("hotkey") or "", base.get("parent_key") or "", base.get("attrs") or "",
                    ),
                )
            if _guard(root) != before:
                conn.rollback()
                raise StudioError(code="import.dirty")
            conn.commit()
            return project_lock(conn, project_id, root)
        finally:
            conn.close()


def _label_bytes(root: Path) -> dict[str, bytes]:
    labels = root / "labels"
    if not labels.is_dir():
        return {}
    return {path.relative_to(root).as_posix(): path.read_bytes() for path in labels.rglob("*.txt")}


def set_task(project_id: str, task: str) -> dict:
    if task not in {"detect", "segment", "obb", "pose"}:
        raise StudioError(code="task.invalid")
    with transaction():
        conn = connect()
        try:
            _project_row(conn, project_id)
            conn.execute("UPDATE projects SET task = ? WHERE id = ?", (task, project_id))
            conn.commit()
            return get_project(project_id)
        finally:
            conn.close()


def export_project(project_id: str, task: str | None, dest: str | None, fmt: str | None = None, grouped: bool = False, precision: int = 6, skip_empty: bool = False) -> dict:
    from trainer_studio.exporting import write_export

    with transaction():
        conn = connect()
        try:
            project = _project_row(conn, project_id)
            root = Path(project["root"])
            before = _label_bytes(root)
            yaml_before = (root / "data.yaml").read_bytes() if (root / "data.yaml").is_file() else b""
            chosen = task or project["task"]
            if chosen not in {"detect", "segment", "obb", "pose"}:
                raise StudioError(code="task.invalid")
            kind = (fmt or "yolo").lower()
            pairs = _pairs(root) or []
            target = Path(dest).expanduser().resolve() if dest else data_dir() / "exports" / project_id / datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
            report = write_export(conn, project, pairs, chosen, target, kind, grouped, precision, skip_empty)
            if _label_bytes(root) != before or ((root / "data.yaml").read_bytes() if (root / "data.yaml").is_file() else b"") != yaml_before:
                raise StudioError(code="import.dirty")
            report["bytesIdentical"] = True
            return report
        finally:
            conn.close()


def validate_only(project_id: str, task: str | None) -> dict:
    with transaction():
        conn = connect()
        try:
            project = _project_row(conn, project_id)
            chosen = task or project["task"]
            report = validate_project(conn, project, chosen)
            report["formats"] = FORMAT_NOTES
            report["ok"] = not report["errors"]
            report["task"] = chosen
            return report
        finally:
            conn.close()


def validate_project(conn, project, task: str) -> dict:
    root = Path(project["root"])
    pairs = _pairs(root) or []
    errors = []
    warnings = []
    for image in conn.execute("SELECT * FROM images WHERE project_id = ?", (project["id"],)).fetchall():
        for ann in _annotations(conn, project["id"], image["id"]):
            if ann["classId"] and index_for_key(pairs, ann["classId"]) is None and ann["geometry"].get("type") != "raw":
                errors.append({"image": image["id"], "id": ann["id"], "issue": text("qc.unknownClass")})
            for issue in validate_geometry(ann["geometry"], image["width"], image["height"]):
                soft = issue.startswith("raw") or "outside" in issue or "zero" in issue
                bucket = warnings if soft else errors
                bucket.append({"image": image["id"], "id": ann["id"], "issue": issue})
    return {"errors": errors, "warnings": warnings}


def qc_scan(project_id: str) -> dict:
    from trainer_studio.qc import scan

    with transaction():
        conn = connect()
        try:
            project = _project_row(conn, project_id)
            return scan(conn, project)
        finally:
            conn.close()


def split_dataset(project_id: str, train: float = 0.8, val: float = 0.1, test: float = 0.1) -> dict:
    from trainer_studio.exporting import assign_splits

    ratios = {"train": float(train), "val": float(val), "test": float(test)}
    if any(value < 0 for value in ratios.values()) or abs(sum(ratios.values()) - 1) > 1e-3:
        raise StudioError(code="export.ratio")
    with transaction():
        conn = connect()
        try:
            project = _project_row(conn, project_id)
            root = Path(project["root"])
            before = _label_bytes(root)
            yaml_before = (root / "data.yaml").read_bytes() if (root / "data.yaml").is_file() else b""
            rows = []
            for image in conn.execute("SELECT * FROM images WHERE project_id = ? ORDER BY sort_index", (project_id,)).fetchall():
                keys = []
                for ann in _annotations(conn, project_id, image["id"]):
                    if (ann.get("attributes") or {}).get("review") == "pending":
                        continue
                    if ann["classId"]:
                        keys.append(ann["classId"])
                rows.append({"id": image["id"], "keys": keys})
            assignment = assign_splits(rows, ratios)
            updates = [(split, project_id, image_id) for image_id, split in assignment.items()]
            if updates:
                conn.executemany("UPDATE images SET split = ? WHERE project_id = ? AND id = ?", updates)
            if _label_bytes(root) != before or ((root / "data.yaml").read_bytes() if (root / "data.yaml").is_file() else b"") != yaml_before:
                conn.rollback()
                raise StudioError(code="import.dirty")
            conn.commit()
            counts = {"train": 0, "val": 0, "test": 0}
            for split in assignment.values():
                counts[split] = counts.get(split, 0) + 1
            return {"counts": counts, "bytesIdentical": True}
        finally:
            conn.close()


def create_snapshot(project_id: str) -> dict:
    import shutil

    with transaction():
        conn = connect()
        try:
            project = _project_row(conn, project_id)
            root = Path(project["root"])
            before = _label_bytes(root)
            yaml_before = (root / "data.yaml").read_bytes() if (root / "data.yaml").is_file() else b""
            stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
            dest = data_dir() / "snapshots" / project_id / stamp
            (dest / "labels").mkdir(parents=True, exist_ok=True)
            if (root / "data.yaml").is_file():
                shutil.copy2(root / "data.yaml", dest / "data.yaml")
            labels = root / "labels"
            copied = 0
            if labels.is_dir():
                for path in labels.rglob("*.txt"):
                    target = dest / "labels" / path.relative_to(labels)
                    target.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(path, target)
                    copied += 1
            manifest = {
                "source": str(root),
                "createdAt": stamp,
                "images": [
                    {"id": row["id"], "labelSha": row["label_sha"], "split": row["split"], "name": row["name"]}
                    for row in conn.execute("SELECT id, label_sha, split, name FROM images WHERE project_id = ? ORDER BY sort_index", (project_id,))
                ],
            }
            (dest / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
            _version(conn, project_id, None, "snapshot", text("snapshot.done", path=str(dest)), {"dest": str(dest), "files": copied})
            if _label_bytes(root) != before or ((root / "data.yaml").read_bytes() if (root / "data.yaml").is_file() else b"") != yaml_before:
                conn.rollback()
                raise StudioError(code="import.dirty")
            conn.commit()
            return {"dest": str(dest), "files": copied, "bytesIdentical": True}
        finally:
            conn.close()


def list_snapshots(project_id: str) -> dict:
    root = data_dir() / "snapshots" / project_id
    if not root.is_dir():
        return {"snapshots": []}
    rows = [{"id": path.name, "path": str(path)} for path in sorted(root.iterdir()) if path.is_dir()]
    rows.reverse()
    return {"snapshots": rows}


def list_versions(project_id: str) -> dict:
    with transaction():
        conn = connect()
        try:
            _project_row(conn, project_id)
            rows = conn.execute(
                "SELECT id, image_id, kind, note, created_at FROM versions WHERE project_id = ? ORDER BY id DESC LIMIT 200",
                (project_id,),
            ).fetchall()
            return {
                "versions": [
                    {"id": row["id"], "imageId": row["image_id"], "kind": row["kind"], "note": row["note"], "createdAt": row["created_at"]}
                    for row in rows
                ]
            }
        finally:
            conn.close()


def settle_review(project_id: str, accept: list[str], reject: list[str]) -> dict:
    accept_set = {str(item) for item in accept}
    reject_set = {str(item) for item in reject}
    if not accept_set and not reject_set:
        raise StudioError(code="review.empty")
    with transaction():
        conn = connect()
        try:
            _project_row(conn, project_id)
            ids = list(accept_set | reject_set)
            placeholders = ",".join("?" for _ in ids)
            found = conn.execute(
                f"""SELECT a.id, a.image_id FROM annotations a
                    JOIN images i ON i.id = a.image_id AND i.project_id = a.project_id
                    WHERE i.project_id = ? AND a.id IN ({placeholders})""",
                (project_id, *ids),
            ).fetchall()
            by_image: dict[str, list] = {}
            for image_id in {row["image_id"] for row in found}:
                row = _image_row(conn, project_id, image_id)
                by_image[image_id] = (json.loads(row["attributes"]), _annotations(conn, project_id, image_id))
        finally:
            conn.close()
    changed = 0
    images = []
    for image_id, (attributes, anns) in by_image.items():
        next_anns = []
        for ann in anns:
            if ann["id"] in reject_set:
                changed += 1
                continue
            if ann["id"] in accept_set:
                attrs = dict(ann["attributes"])
                attrs.pop("review", None)
                ann = {**ann, "attributes": attrs}
                changed += 1
            next_anns.append(ann)
        pending_left = any((item.get("attributes") or {}).get("review") == "pending" for item in next_anns)
        status = "review" if pending_left else ("labeled" if next_anns else "unlabeled")
        saved = save_image(project_id, image_id, next_anns, attributes, status)
        images.append({"imageId": image_id, "written": saved["written"], "bytesIdentical": saved["bytesIdentical"]})
    return {"changed": changed, "images": images}


def mark_review(project_id: str, image_ids: list[str]) -> dict:
    with transaction():
        conn = connect()
        try:
            _project_row(conn, project_id)
            for image_id in image_ids:
                conn.execute(
                    "UPDATE images SET status = 'review' WHERE project_id = ? AND id = ?",
                    (project_id, image_id),
                )
            conn.commit()
            return {"updated": len(image_ids)}
        finally:
            conn.close()
