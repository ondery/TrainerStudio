"""Class table edits on a copy dataset. Ids never move unless the caller confirms."""

import json

import yaml
from fastapi.testclient import TestClient

from tests.conftest import write_jpeg
from trainer_studio.api import create_app
from trainer_studio.service import (
    class_apply,
    list_classes,
    open_dataset,
    undo_class_change,
    update_class_style,
)


def _copy(tmp_path):
    root = tmp_path / "copy-set"
    (root / "images").mkdir(parents=True)
    (root / "labels").mkdir(parents=True)
    names = ["alpha", "beta", "gamma"]
    (root / "data.yaml").write_text(yaml.safe_dump({"path": ".", "names": names}, sort_keys=False), encoding="utf-8")
    (root / "labels" / "frame.txt").write_text("0 0.5 0.5 0.2 0.2\n1 0.2 0.2 0.1 0.1\n2 0.8 0.8 0.1 0.1\n", encoding="utf-8")
    (root / "labeling.json").write_text(json.dumps({"fields": [{"id": "lane"}], "classes": []}, ensure_ascii=False) + "\n", encoding="utf-8")
    write_jpeg(root / "images" / "frame.jpg")
    project = open_dataset(str(root))
    return root, project


def test_style_edit_does_not_shift_ids_or_labels(tmp_path, data_home):
    root, project = _copy(tmp_path)
    before_yaml = (root / "data.yaml").read_bytes()
    before_label = (root / "labels" / "frame.txt").read_bytes()
    styled = update_class_style(project["id"], "alpha", {
        "title": "Alpha başlık",
        "color": "#112233",
        "hotkey": "Q",
        "attrs": "speed",
        "icon": {"kind": "lucide", "name": "Star"},
        "parent": "beta",
    })
    assert styled["title"] == "Alpha başlık"
    assert styled["color"] == "#112233"
    assert styled["hotkey"] == "q"
    assert styled["parent"] == "beta"
    assert styled["visible"] is True
    assert (root / "data.yaml").read_bytes() == before_yaml
    assert (root / "labels" / "frame.txt").read_bytes() == before_label
    catalog = json.loads((root / "labeling.json").read_text(encoding="utf-8"))
    assert catalog["fields"] == [{"id": "lane"}]
    assert [row["id"] for row in catalog["classes"]] == ["alpha"]
    alpha = catalog["classes"][0]
    assert alpha == {
        "id": "alpha",
        "tr": {"title": "Alpha başlık"},
        "color": "#112233",
        "hotkey": "q",
        "group": "beta",
    }
    assert list(catalog["classIcons"]) == ["alpha"]
    assert catalog["classIcons"]["alpha"] == {"kind": "lucide", "name": "Star"}
    rows = list_classes(project["id"])["classes"]
    assert [row["id"] for row in rows] == ["alpha", "beta", "gamma"]
    assert [row["index"] for row in rows] == [0, 1, 2]
    assert rows[0]["count"] == 1
    assert rows[1]["count"] == 1
    assert rows[2]["count"] == 1


def test_duplicate_hotkey_is_refused(tmp_path, data_home):
    root, project = _copy(tmp_path)
    update_class_style(project["id"], "alpha", {"hotkey": "q"})
    client = TestClient(create_app())
    denied = client.patch(f"/api/projects/{project['id']}/classes/beta", json={"hotkey": "q"})
    assert denied.status_code == 400
    assert denied.json()["code"] == "class.hotkey"
    assert (root / "labels" / "frame.txt").read_text(encoding="utf-8").splitlines()[0].startswith("0 ")


def test_rename_keeps_the_yaml_index(tmp_path, data_home):
    root, project = _copy(tmp_path)
    before_label = (root / "labels" / "frame.txt").read_bytes()
    applied = class_apply(project["id"], {"op": "rename", "key": "beta", "next": "beta_renamed"})
    assert applied["verified"] is True
    assert applied["backup"]
    payload = yaml.safe_load((root / "data.yaml").read_text(encoding="utf-8"))
    names = payload["names"]
    assert names == ["alpha", "beta_renamed", "gamma"]
    assert (root / "labels" / "frame.txt").read_bytes() == before_label
    rows = list_classes(project["id"])["classes"]
    assert [row["id"] for row in rows] == ["alpha", "beta_renamed", "gamma"]
    assert [row["index"] for row in rows] == [0, 1, 2]
    assert rows[1]["count"] == 1


def test_deprecate_hides_without_removing(tmp_path, data_home):
    root, project = _copy(tmp_path)
    before_yaml = (root / "data.yaml").read_bytes()
    before_label = (root / "labels" / "frame.txt").read_bytes()
    applied = class_apply(project["id"], {"op": "deprecate", "key": "gamma"})
    assert applied["op"] == "deprecate"
    assert applied["verified"] is True
    assert (root / "data.yaml").read_bytes() == before_yaml
    assert (root / "labels" / "frame.txt").read_bytes() == before_label
    rows = list_classes(project["id"])["classes"]
    assert [row["id"] for row in rows] == ["alpha", "beta", "gamma"]
    assert rows[2]["visible"] is False
    catalog = json.loads((root / "labeling.json").read_text(encoding="utf-8"))
    assert catalog["classes"] == [{"id": "gamma", "deprecated": True}]
    assert "classIcons" not in catalog
    assert catalog["fields"] == [{"id": "lane"}]


def test_delete_reorder_merge_need_confirm_and_undo(tmp_path, data_home):
    root, project = _copy(tmp_path)
    before_yaml = (root / "data.yaml").read_bytes()
    before_label = (root / "labels" / "frame.txt").read_bytes()
    client = TestClient(create_app())
    base = f"/api/projects/{project['id']}/classes"
    blocked = client.post(f"{base}/apply", json={"op": "delete", "key": "gamma"})
    assert blocked.status_code == 200
    body = blocked.json()
    assert body["needsConfirm"] is True
    assert body["applied"] is False
    assert body["files"] == 1
    assert body["droppedBoxes"] == 1
    assert (root / "data.yaml").read_bytes() == before_yaml
    assert (root / "labels" / "frame.txt").read_bytes() == before_label
    reorder = client.post(f"{base}/apply", json={"op": "reorder", "keys": ["gamma", "alpha", "beta"]})
    assert reorder.json()["needsConfirm"] is True
    assert reorder.json()["applied"] is False
    assert (root / "labels" / "frame.txt").read_bytes() == before_label
    merged = client.post(f"{base}/apply", json={"op": "merge", "source": "alpha", "target": "beta"})
    assert merged.json()["needsConfirm"] is True
    assert merged.json()["rewrittenBoxes"] >= 1
    assert (root / "data.yaml").read_bytes() == before_yaml

    applied = client.post(f"{base}/apply", json={"op": "delete", "key": "gamma", "confirm": True})
    assert applied.status_code == 200
    done = applied.json()
    assert done["verified"] is True
    assert done["backup"]
    payload = yaml.safe_load((root / "data.yaml").read_text(encoding="utf-8"))
    assert payload["names"] == ["alpha", "beta"]
    text = (root / "labels" / "frame.txt").read_text(encoding="utf-8")
    assert text.splitlines() == ["0 0.5 0.5 0.2 0.2", "1 0.2 0.2 0.1 0.1"]
    rows = list_classes(project["id"])["classes"]
    assert [row["id"] for row in rows] == ["alpha", "beta"]
    assert [row["index"] for row in rows] == [0, 1]

    restored = undo_class_change(project["id"])
    assert restored["restored"] is True
    payload = yaml.safe_load((root / "data.yaml").read_text(encoding="utf-8"))
    assert payload["names"] == ["alpha", "beta", "gamma"]
    assert (root / "labels" / "frame.txt").read_bytes() == before_label
    rows = list_classes(project["id"])["classes"]
    assert [row["id"] for row in rows] == ["alpha", "beta", "gamma"]
    assert [row["index"] for row in rows] == [0, 1, 2]
    assert rows[2]["count"] == 1
