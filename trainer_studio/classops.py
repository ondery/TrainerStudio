"""Class rename, merge, delete and reorder.

These are explicit remaps. They preview first, then back up and rewrite
``data.yaml`` and the label files whose class indexes change.
"""

from __future__ import annotations

from pathlib import Path

import yaml

from trainer_studio.errors import LockError, StudioError
from trainer_studio.messages import text
from trainer_studio.writer import write_if_changed
from trainer_studio.yamlids import contiguous, index_for_key, names_list, read_name_pairs


def _load(root: Path) -> tuple[dict, list[tuple[int, str]]]:
    path = root / "data.yaml"
    pairs = read_name_pairs(path)
    if pairs is None:
        raise StudioError(code="yaml.missing")
    if not contiguous(pairs):
        raise StudioError(code="yaml.gaps")
    payload = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    if not isinstance(payload, dict):
        raise StudioError(code="yaml.invalid")
    return payload, pairs


def _plan(root: Path, new_names: list[str], key_map: dict[str, str | None]) -> dict:
    """``key_map`` maps an old key to a new key, or None to drop its boxes."""
    _payload, pairs = _load(root)
    old_names = names_list(pairs)
    old_index = {name: index for index, name in pairs}
    new_index = {name: index for index, name in enumerate(new_names)}
    files = []
    dropped = 0
    rewritten = 0
    labels = root / "labels"
    paths = sorted(labels.rglob("*.txt")) if labels.is_dir() else []
    for path in paths:
        original = path.read_text(encoding="utf-8")
        lines_out = []
        changed = False
        for line in original.splitlines():
            parts = line.split()
            if not parts:
                lines_out.append(line)
                continue
            try:
                index = int(float(parts[0]))
            except ValueError:
                lines_out.append(line)
                continue
            if index < 0 or index >= len(old_names) or not old_names[index]:
                raise StudioError(code="yaml.unknown", params={"file": path.name, "index": index})
            key = old_names[index]
            mapped = key_map.get(key, key)
            if mapped is None:
                dropped += 1
                changed = True
                continue
            if mapped not in new_index:
                raise StudioError(code="yaml.missing", params={"key": mapped})
            updated = str(new_index[mapped])
            if updated != str(index):
                changed = True
                rewritten += 1
            parts[0] = updated
            lines_out.append(" ".join(parts))
        if not changed:
            continue
        text = ("\n".join(lines_out) + "\n") if lines_out else ""
        files.append({"path": path, "text": text, "rel": path.relative_to(root).as_posix()})
    return {
        "oldNames": old_names,
        "newNames": new_names,
        "files": files,
        "droppedBoxes": dropped,
        "rewrittenBoxes": rewritten,
        "oldIndex": old_index,
        "newIndex": new_index,
    }


def preview_op(root: Path, op: str, body: dict) -> dict:
    new_names, key_map, note = _interpret(root, op, body)
    plan = _plan(root, new_names, key_map)
    return {
        "op": op,
        "note": note,
        "files": len(plan["files"]),
        "fileNames": [item["rel"] for item in plan["files"][:30]],
        "droppedBoxes": plan["droppedBoxes"],
        "rewrittenBoxes": plan["rewrittenBoxes"],
        "oldNames": plan["oldNames"],
        "newNames": plan["newNames"],
        "yaml": True,
    }


def apply_op(root: Path, op: str, body: dict, backup_root: Path) -> dict:
    new_names, key_map, note = _interpret(root, op, body)
    plan = _plan(root, new_names, key_map)
    payload, _pairs = _load(root)
    names_value = payload.get("names")
    if isinstance(names_value, list):
        payload["names"] = list(new_names)
    else:
        payload["names"] = {index: name for index, name in enumerate(new_names)}
    yaml_text = yaml.safe_dump(payload, allow_unicode=True, sort_keys=False)
    backup = snapshot_tree(root, backup_root)
    written = []
    try:
        yaml_path = root / "data.yaml"
        result = write_if_changed(yaml_path, yaml_text, backup_root)
        if result["written"]:
            written.append("data.yaml")
        for item in plan["files"]:
            file_result = write_if_changed(item["path"], item["text"], backup_root)
            if file_result["written"]:
                written.append(item["rel"])
        _verify_names(root, new_names)
    except Exception:
        restore_tree(backup, root)
        raise
    return {
        "op": op,
        "note": note,
        "written": written,
        "newNames": new_names,
        "droppedBoxes": plan["droppedBoxes"],
        "rewrittenBoxes": plan["rewrittenBoxes"],
        "backup": str(backup),
        "verified": True,
    }


def snapshot_tree(root: Path, backup_root: Path) -> Path:
    """Copy data.yaml, labeling.json, catalog.json and labels/ before an id change."""
    from datetime import datetime, timezone

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    dest = backup_root / stamp
    dest.mkdir(parents=True, exist_ok=True)
    for name in ("data.yaml", "labeling.json", "catalog.json"):
        source = root / name
        if source.is_file():
            target = dest / name
            target.write_bytes(source.read_bytes())
    labels = root / "labels"
    if labels.is_dir():
        for path in labels.rglob("*.txt"):
            if not path.is_file():
                continue
            target = dest / path.relative_to(root)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(path.read_bytes())
    return dest


def restore_tree(backup: Path, root: Path) -> None:
    if not backup.is_dir():
        return
    for path in backup.rglob("*"):
        if not path.is_file() or path.name == "styles.json":
            continue
        dest = root / path.relative_to(backup)
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_bytes(path.read_bytes())


def _verify_names(root: Path, new_names: list[str]) -> None:
    _payload, pairs = _load(root)
    if names_list(pairs) != list(new_names):
        raise StudioError(code="class.verify")
    labels = root / "labels"
    if not labels.is_dir():
        return
    for path in labels.rglob("*.txt"):
        for line in path.read_text(encoding="utf-8").splitlines():
            parts = line.split()
            if not parts:
                continue
            try:
                index = int(float(parts[0]))
            except ValueError:
                continue
            if index < 0 or index >= len(new_names) or not new_names[index]:
                raise StudioError(code="class.verify", params={"file": path.name, "index": index})


def _interpret(root: Path, op: str, body: dict) -> tuple[list[str], dict[str, str | None], str]:
    _payload, pairs = _load(root)
    names = names_list(pairs)
    if op == "rename":
        key = str(body.get("key") or "")
        nxt = str(body.get("next") or "")
        if index_for_key(pairs, key) is None:
            raise StudioError(code="class.missing", params={"key": key})
        if not nxt or nxt in names:
            raise StudioError(code="class.invalid")
        new_names = [nxt if name == key else name for name in names]
        return new_names, {key: nxt}, text("rename.note")
    if op == "delete":
        key = str(body.get("key") or "")
        if key not in names:
            raise StudioError(code="class.missing", params={"key": key})
        new_names = [name for name in names if name != key]
        return new_names, {key: None}, text("delete.note")
    if op == "merge":
        source = str(body.get("source") or "")
        target = str(body.get("target") or "")
        if source not in names or target not in names or source == target:
            raise StudioError(code="class.invalid")
        new_names = [name for name in names if name != source]
        mapping: dict[str, str | None] = {source: target}
        return new_names, mapping, text("merge.note")
    if op == "add":
        key = str(body.get("key") or "").strip()
        if not key or key in names:
            raise StudioError(code="class.invalid")
        return [*names, key], {name: name for name in names}, text("class.added")
    if op == "reorder":
        keys = [str(item) for item in body.get("keys") or []]
        if sorted(keys) != sorted(names) or len(keys) != len(names):
            raise StudioError(code="class.remap")
        return keys, {name: name for name in names}, text("reorder.note")
    raise StudioError(code="class.op")


def refuse_if_locked(lock: dict) -> None:
    if not lock.get("ok"):
        raise LockError(str(lock.get("message") or text("catalog.lock")))
