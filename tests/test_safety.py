"""data.yaml is the class id. Opening a dataset does not rewrite it."""

import json
from pathlib import Path

import yaml

from tests.conftest import signlens_names, write_jpeg
from trainer_studio.db import connect
from trainer_studio.nav import next_id
from trainer_studio.service import class_apply, class_preview, get_image, open_dataset, save_image
from trainer_studio.writer import atomic_write_text


def _dataset(tmp_path: Path) -> Path:
    names = signlens_names()
    root = tmp_path / "dataset"
    (root / "images").mkdir(parents=True)
    (root / "labels").mkdir(parents=True)
    (root / "data.yaml").write_text(
        yaml.safe_dump(
            {"path": ".", "train": "images", "val": "images", "names": {index: name for index, name in enumerate(names)}},
            allow_unicode=True,
            sort_keys=False,
        ),
        encoding="utf-8",
    )
    kept = "7 0.5 0.5 0.2 0.2\n"
    shifted = "5 0.400000 0.400000 0.200000 0.200000\n"
    (root / "labels" / "kept.txt").write_text(kept, encoding="utf-8")
    (root / "labels" / "shifted.txt").write_text(shifted, encoding="utf-8")
    write_jpeg(root / "images" / "kept.jpg")
    write_jpeg(root / "images" / "shifted.jpg")
    (root / "meta.json").write_text(json.dumps({
        "version": 1,
        "images": [
            {
                "id": "kept",
                "file": "images/kept.jpg",
                "name": "kept.jpg",
                "width": 32,
                "height": 32,
                "split": "train",
                "comment": "keep-me",
                "customNote": "özel",
                "boxes": [{
                    "id": "b1",
                    "cls": 7,
                    "cx": 0.5,
                    "cy": 0.5,
                    "w": 0.2,
                    "h": 0.2,
                    "attributes": {"vehicle": ["vehicle_car"]},
                    "lane": "left",
                }],
            },
            {
                "id": "shifted",
                "file": "images/shifted.jpg",
                "name": "shifted.jpg",
                "width": 32,
                "height": 32,
                "boxes": [{"id": "b2", "cls": 5, "cx": 0.4, "cy": 0.4, "w": 0.2, "h": 0.2}],
            },
        ],
    }, ensure_ascii=False), encoding="utf-8")
    (root / "labeling.json").write_text(json.dumps({"schemaVersion": 1, "fields": [
        {"id": "lane", "scope": "annotation", "type": "text", "label": "Şerit"},
    ]}), encoding="utf-8")
    (root / "class-undo.json").write_text("{}", encoding="utf-8")
    return root


def _bytes(root: Path) -> dict[str, bytes]:
    wanted = ["data.yaml", "meta.json", "labeling.json", "class-undo.json", "labels/kept.txt", "labels/shifted.txt"]
    return {name: (root / name).read_bytes() for name in wanted}


def test_open_is_readonly_and_speed60_uses_yaml_index(tmp_path, data_home):
    root = _dataset(tmp_path)
    before = _bytes(root)
    project = open_dataset(str(root))
    assert _bytes(root) == before
    assert project["labelLock"]["ok"] is True

    kept = get_image(project["id"], "kept")
    assert kept["meta"]["customNote"] == "özel"
    assert kept["attributes"]["comment"] == "keep-me"
    box = kept["annotations"][0]
    assert box["classId"] == "speed_60"
    assert box["attributes"]["vehicle"] == ["vehicle_car"]
    assert box["attributes"]["lane"] == "left"
    assert box["attributes"]["_sourceId"] == "b1"

    conn = connect()
    conn.execute("DELETE FROM classes WHERE project_id = ? AND key IN ('speed_5', 'speed_15')", (project["id"],))
    conn.execute("UPDATE classes SET yaml_index = 5 WHERE project_id = ? AND key = 'speed_60'", (project["id"],))
    conn.commit()
    conn.close()

    again = open_dataset(str(root))
    # Re-open rebuilds the catalog from data.yaml, so heal it back to the broken catalog.
    conn = connect()
    conn.execute("DELETE FROM classes WHERE project_id = ? AND key IN ('speed_5', 'speed_15')", (project["id"],))
    conn.execute("UPDATE classes SET yaml_index = 5, sort_index = 5 WHERE project_id = ? AND key = 'speed_60'", (project["id"],))
    conn.commit()
    conn.close()
    assert again["id"] == project["id"]
    assert _bytes(root) == before

    from trainer_studio.service import get_project

    locked = get_project(project["id"])
    assert locked["labelLock"]["ok"] is False
    assert "speed_5" in locked["labelLock"]["missing"]
    assert "data.yaml" in locked["labelLock"]["message"]

    try:
        class_preview(project["id"], {"op": "reorder", "keys": ["speed_60"]})
        raised = False
    except Exception as exc:
        raised = True
        assert "data.yaml" in str(exc)
    assert raised
    assert _bytes(root) == before

    kept_now = get_image(project["id"], "kept")
    saved = save_image(project["id"], "kept", [{
        **kept_now["annotations"][0],
        "classId": "speed_60",
        "cls": 5,
    }], None, None)
    assert saved["resolved"][0]["index"] == 7
    assert (root / "labels" / "kept.txt").read_bytes() == before["labels/kept.txt"]
    assert (root / "data.yaml").read_bytes() == before["data.yaml"]

    shifted = save_image(project["id"], "shifted", [{
        "id": "b2",
        "classId": "speed_60",
        "cls": 5,
        "geometry": {"type": "bbox", "x": 9.6, "y": 9.6, "width": 6.4, "height": 6.4},
        "attributes": {},
    }], None, None)
    assert shifted["resolved"][0]["index"] == 7
    assert (root / "labels" / "shifted.txt").read_text(encoding="utf-8").split()[0] == "7"
    assert (root / "labels" / "kept.txt").read_bytes() == before["labels/kept.txt"]
    assert (root / "meta.json").read_bytes() == before["meta.json"]
    backups = list((data_home / "backups").rglob("*.txt"))
    assert backups


def test_reorder_is_a_previewed_remap(tmp_path, data_home):
    root = tmp_path / "small"
    (root / "images").mkdir(parents=True)
    (root / "labels").mkdir(parents=True)
    names = ["alpha", "beta", "gamma"]
    (root / "data.yaml").write_text(yaml.safe_dump({"names": names}, sort_keys=False), encoding="utf-8")
    (root / "labels" / "a.txt").write_text("0 0.5 0.5 0.2 0.2\n2 0.2 0.2 0.1 0.1\n", encoding="utf-8")
    write_jpeg(root / "images" / "a.jpg")
    before = (root / "labels" / "a.txt").read_bytes()
    project = open_dataset(str(root))
    preview = class_preview(project["id"], {"op": "reorder", "keys": ["gamma", "alpha", "beta"]})
    assert preview["files"] == 1
    assert (root / "labels" / "a.txt").read_bytes() == before
    applied = class_apply(project["id"], {"op": "reorder", "keys": ["gamma", "alpha", "beta"]})
    assert "labels/a.txt" in applied["written"]
    text = (root / "labels" / "a.txt").read_text(encoding="utf-8")
    # alpha was 0 and is now 1; gamma was 2 and is now 0.
    assert text.splitlines()[0].startswith("1 ")
    assert text.splitlines()[1].startswith("0 ")
    assert (data_home / "backups").exists()


def test_atomic_write_replaces_and_cleans_temp(tmp_path):
    path = tmp_path / "labels" / "a.txt"
    atomic_write_text(path, "1 0.1 0.1 0.1 0.1\n")
    atomic_write_text(path, "2 0.2 0.2 0.2 0.2\n")
    assert path.read_text(encoding="utf-8").startswith("2 ")
    assert not list(path.parent.glob("*.tmp"))


def test_pending_review_does_not_touch_labels(tmp_path, data_home):
    root = _dataset(tmp_path)
    before = _bytes(root)
    project = open_dataset(str(root))
    kept = get_image(project["id"], "kept")
    original = kept["annotations"][0]
    saved = save_image(project["id"], "kept", [
        original,
        {
            "id": "proposal-1",
            "classId": "speed_60",
            "cls": 0,
            "geometry": {"type": "bbox", "x": 1, "y": 1, "width": 4, "height": 4},
            "attributes": {"source": "auto", "review": "pending", "score": 0.4},
        },
    ], None, "labeled")
    assert saved["status"] == "review"
    assert len(saved["annotations"]) == 2
    assert saved["resolved"][-1]["index"] == 7
    assert (root / "labels" / "kept.txt").read_bytes() == before["labels/kept.txt"]
    assert (root / "data.yaml").read_bytes() == before["data.yaml"]
    assert (root / "meta.json").read_bytes() == before["meta.json"]
    assert (root / "labeling.json").read_bytes() == before["labeling.json"]


def test_legacy_schema_import_leaves_labeling_json(tmp_path, data_home):
    root = _dataset(tmp_path)
    before = (root / "labeling.json").read_bytes()
    project = open_dataset(str(root))
    from trainer_studio.service import get_schema, import_legacy_schema, put_schema

    put_schema(project["id"], [])
    assert get_schema(project["id"])["fields"] == []
    imported = import_legacy_schema(project["id"])
    assert imported["bytesIdentical"] is True
    assert any(field["id"] == "lane" for field in imported["fields"])
    assert (root / "labeling.json").read_bytes() == before
    assert (root / "data.yaml").read_bytes() == _bytes(root)["data.yaml"]


def test_merge_and_rename_preview_do_not_write(tmp_path, data_home):
    root = tmp_path / "small"
    (root / "images").mkdir(parents=True)
    (root / "labels").mkdir(parents=True)
    names = ["alpha", "beta"]
    (root / "data.yaml").write_text(yaml.safe_dump({"names": names}, sort_keys=False), encoding="utf-8")
    (root / "labels" / "a.txt").write_text("1 0.5 0.5 0.2 0.2\n", encoding="utf-8")
    write_jpeg(root / "images" / "a.jpg")
    project = open_dataset(str(root))
    before_yaml = (root / "data.yaml").read_bytes()
    before_label = (root / "labels" / "a.txt").read_bytes()
    renamed = class_preview(project["id"], {"op": "rename", "key": "alpha", "next": "alpha_2"})
    assert "Label indexes" in renamed["note"]
    merged = class_preview(project["id"], {"op": "merge", "source": "alpha", "target": "beta"})
    assert merged["files"] == 1
    assert merged["rewrittenBoxes"] == 1
    assert (root / "data.yaml").read_bytes() == before_yaml
    assert (root / "labels" / "a.txt").read_bytes() == before_label
    applied = class_apply(project["id"], {"op": "merge", "source": "alpha", "target": "beta"})
    assert "data.yaml" in applied["written"]
    assert (root / "labels" / "a.txt").read_text(encoding="utf-8").startswith("0 ")
    assert (data_home / "backups").exists()


def test_navigation_survives_filter_drop():
    assert next_id(["a", "b", "c", "d"], "b", 1, 1) == "c"
    assert next_id(["a", "c", "d"], "b", 1, 1) == "c"
    assert next_id(["a", "c", "d"], "b", 1, -1) == "a"
    assert next_id(["a", "b", "c"], "a", 0, -1) is None
