"""0.6.3 follow-ups: append-only classes and the full project tree."""

from pathlib import Path

from tests.conftest import write_jpeg
from trainer_studio.service import class_apply, image_raw, list_classes, open_dataset, project_tree
from trainer_studio.yamlids import read_name_pairs


def test_new_class_appends_and_tree_lists_the_project(tmp_path, data_home):
    root = tmp_path / "yard"
    (root / "images" / "train").mkdir(parents=True)
    (root / "labels").mkdir()
    (root / "models").mkdir()
    (root / "models" / "note.txt").write_text("keep\n", encoding="utf-8")
    (root / "data.yaml").write_text("path: .\nnames:\n  0: person\n  1: car\n", encoding="utf-8")
    write_jpeg(root / "images" / "train" / "frame.jpg")
    label = root / "labels" / "frame.txt"
    label.write_text("0 0.5 0.5 0.2 0.2\n", encoding="utf-8")
    project = open_dataset(str(root))
    yaml_before = (root / "data.yaml").read_bytes()
    label_before = label.read_bytes()
    before = read_name_pairs(root / "data.yaml")
    class_apply(project["id"], {
        "op": "add",
        "key": "bike",
        "title": "Bisiklet",
        "color": "#336699",
        "icon": "Car",
        "hotkey": "b",
        "parent": "vehicle",
        "attrs": "occluded",
    })
    after = read_name_pairs(root / "data.yaml")
    assert before == [(0, "person"), (1, "car")]
    assert after == [(0, "person"), (1, "car"), (2, "bike")]
    assert label.read_bytes() == label_before
    classes = list_classes(project["id"])["classes"]
    assert [row["id"] for row in classes] == ["person", "car", "bike"]
    assert [row["index"] for row in classes] == [0, 1, 2]
    bike = classes[-1]
    assert bike["hotkey"] == "b"
    assert bike["parent"] == "vehicle"
    assert bike["attrs"] == "occluded"
    assert bike["title"] == "Bisiklet"
    tree = project_tree(project["id"])
    paths = {item["path"]: item for item in tree["entries"]}
    assert "data.yaml" in paths
    assert paths["data.yaml"]["color"] == "#e8b931"
    assert paths["data.yaml"]["icon"] == "file-code"
    assert paths["models/note.txt"]["icon"] == "file-text"
    assert "models/note.txt" in paths
    train = next(item for item in tree["entries"] if item["kind"] == "dir" and item["name"] == "train")
    assert train["color"] == "#3dd68c"
    assert train["icon"] == "folder"
    assert paths["labels"]["icon"] == "tag"
    assert paths["labels"]["color"] == "#2ec4b6"
    assert paths["models"]["icon"] == "cpu"
    assert paths["images"]["icon"] == "images"
    image = next(row for row in tree["entries"] if row["imageId"])
    stamped = (root / "data.yaml").read_bytes()
    image_raw(project["id"], image["imageId"])
    assert stamped != yaml_before
    assert (root / "data.yaml").read_bytes() == stamped
    assert b"bike" in stamped
    assert label.read_bytes() == label_before
    assert "shutil.move" not in Path("trainer_studio/service.py").read_text(encoding="utf-8").split("def project_tree")[1].split("def class_preview")[0]
