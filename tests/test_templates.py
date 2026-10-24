"""New projects are generic. Opening a dataset does not rewrite class ids."""

import subprocess

import yaml

from tests.conftest import ROOT
from trainer_studio.service import class_apply, create_project, list_classes, open_dataset
from trainer_studio.yamlids import lock_report, read_name_pairs


def test_blank_project_has_zero_classes(tmp_path, data_home):
    root = tmp_path / "blank"
    project = create_project(str(root), "Empty", "blank")
    payload = yaml.safe_load((root / "data.yaml").read_text(encoding="utf-8"))
    assert payload["names"] == []
    assert project["labelLock"]["ok"] is True
    assert list_classes(project["id"])["classes"] == []
    text = (root / "data.yaml").read_text(encoding="utf-8")
    assert "speed_" not in text
    assert "traffic" not in text.lower()


def test_neutral_templates_keep_declared_order(tmp_path, data_home):
    objects = tmp_path / "objects"
    create_project(str(objects), "Objects", "objects")
    names = yaml.safe_load((objects / "data.yaml").read_text(encoding="utf-8"))["names"]
    assert names == ["person", "vehicle", "animal", "object"]
    coco = tmp_path / "coco"
    create_project(str(coco), "Coco", "coco")
    coco_names = yaml.safe_load((coco / "data.yaml").read_text(encoding="utf-8"))["names"]
    assert len(coco_names) == 80
    assert coco_names[0] == "person"
    assert coco_names[9] == "traffic light"


def test_add_appends_and_open_does_not_reorder(tmp_path, data_home):
    root = tmp_path / "keep"
    project = create_project(str(root), "Keep", "objects")
    before = (root / "data.yaml").read_bytes()
    again = open_dataset(str(root))
    assert (root / "data.yaml").read_bytes() == before
    assert again["labelLock"]["ok"] is True
    result = class_apply(project["id"], {"op": "add", "key": "widget"})
    names = yaml.safe_load((root / "data.yaml").read_text(encoding="utf-8"))["names"]
    assert names == ["person", "vehicle", "animal", "object", "widget"]
    assert result["labelLock"]["ok"] is True


def test_layout_roundtrip():
    subprocess.check_call(["node", "--experimental-strip-types", str(ROOT / "scripts" / "check_layout.mjs")], cwd=ROOT)


def test_empty_names_list_is_a_valid_catalog(tmp_path):
    path = tmp_path / "data.yaml"
    path.write_text("names: []\n", encoding="utf-8")
    assert read_name_pairs(path) == []
    assert lock_report([], [])["ok"] is True
    assert lock_report(None, [])["ok"] is False
