"""0.6.2: plugin copies, install location, and speed titles."""

import json
import logging
import shutil
from pathlib import Path

import pytest

from tests.conftest import write_jpeg
from trainer_studio.catalog import display_titles, signlens_template
from trainer_studio.errors import StudioError
from trainer_studio.installpath import default_projects_dir, inside_install, install_root, install_root_for
from trainer_studio.plugins import HOST
from trainer_studio.service import create_project, list_projects, move_project, open_dataset, project_places


def test_duplicate_plugins_keep_the_highest_version(tmp_path, data_home, monkeypatch, caplog):
    low = tmp_path / "mobile-preview"
    high = tmp_path / "mobile-preview-copy"
    old = tmp_path / "mobile-preview.old"
    bak = tmp_path / "notes.bak"
    for folder, version, title in ((low, "0.5.1", "Old"), (high, "0.9.0", "New")):
        folder.mkdir()
        (folder / "manifest.json").write_text(
            json.dumps({"id": "sample-dedupe", "name": title, "version": version, "entry": "plugin.py", "permissions": []}),
            encoding="utf-8",
        )
        (folder / "plugin.py").write_text(
            f"def register(ctx):\n    ctx.add_panel({{'id': 'mobile', 'title': '{title}'}})\n",
            encoding="utf-8",
        )
    old.mkdir()
    (old / "manifest.json").write_text(json.dumps({"id": "sample-dedupe", "name": "Stale", "version": "9.9.9", "entry": "plugin.py"}), encoding="utf-8")
    (old / "plugin.py").write_text("def register(ctx):\n    raise RuntimeError('old copy must not load')\n", encoding="utf-8")
    bak.mkdir()
    (bak / "manifest.json").write_text(json.dumps({"id": "notes", "name": "Bak", "version": "1.0.0", "entry": "plugin.py"}), encoding="utf-8")
    monkeypatch.setenv("STUDIO_PLUGIN_PATH", str(tmp_path))
    with caplog.at_level(logging.WARNING, logger="trainer_studio.plugins"):
        HOST.discover()
    rows = {row["id"]: row for row in HOST.public()}
    assert rows["sample-dedupe"]["version"] == "0.9.0"
    assert rows["sample-dedupe"]["panels"][0]["title"] == "New"
    assert "notes" not in rows
    assert "Duplicate plugin id" in caplog.text
    assert "Ignoring plugin folder" in caplog.text


def test_projects_cannot_be_created_inside_the_install(tmp_path, data_home, monkeypatch):
    install = tmp_path / "TrainerStudio"
    install.mkdir()
    (install / "start-trainer-studio.bat").write_text("@echo off\n", encoding="utf-8")
    monkeypatch.setattr("trainer_studio.installpath.install_root", lambda: install.resolve())
    with pytest.raises(StudioError) as raised:
        create_project(str(install / "lost"), "Lost", "blank")
    assert raised.value.code == "project.install"
    outside = tmp_path / "Documents" / "Trainer Studio Projects" / "kept"
    project = create_project(str(outside), "Kept", "blank")
    assert Path(project["root"]) == outside.resolve()
    assert not inside_install(outside)
    planted = install / "trapped"
    shutil.copytree(outside, planted)
    from trainer_studio.db import connect

    conn = connect()
    try:
        conn.execute("UPDATE projects SET root = ? WHERE id = ?", (str(planted.resolve()), project["id"]))
        conn.commit()
    finally:
        conn.close()
    before = (planted / "data.yaml").read_bytes()
    places = project_places()
    assert any(row["id"] == project["id"] for row in places["trapped"])
    dest = tmp_path / "Documents" / "Trainer Studio Projects" / "moved"
    moved = move_project(project["id"], str(dest), source=str(planted.resolve()), confirm=True)
    assert Path(moved["root"]) == dest.resolve()
    assert (dest / "data.yaml").read_bytes() == before
    assert default_projects_dir().name == "Trainer Studio Projects"
    from trainer_studio import installpath

    assert installpath.install_root() == install.resolve()


def _legacy_title(row: dict) -> str:
    """Port of trainer/web/src/names.ts classTitle for the Turkish catalog."""
    title = (row.get("tr") or {}).get("title") or row["id"]
    detail = (row.get("tr") or {}).get("detail") or ""
    match = __import__("re").search(r"(\d+)\s*km", detail, __import__("re").I)
    if str(row["id"]).startswith("speed_") and match:
        return f"{match.group(1)} km/s"
    return title


def test_speed_titles_keep_ids_and_show_the_value():
    rows = signlens_template()["classes"]
    assert len(rows) == 79
    seen = {}
    for row in rows:
        title, title_en = display_titles(row["id"], row["tr"]["title"], row["en"]["title"], row["tr"].get("detail") or "")
        seen[row["id"]] = (title, title_en)
    assert seen["speed_60"] == ("Hız sınırı 60 km/h", "Speed limit 60 km/h")
    assert seen["speed_5"] == ("Hız sınırı 5 km/h", "Speed limit 5 km/h")
    assert seen["end_speed_80"] == ("Hız sonu 80 km/h", "End of 80 km/h limit")
    assert "km/h" not in seen["speed_limit_panel_multi"][0]
    assert seen["no_horn"][0] == rows[-1]["tr"]["title"]
    # Legacy names.ts returns only the unit for speed_* and drops the category.
    # The numeric token still has to appear in both titles.
    for key, (title, title_en) in seen.items():
        if key.startswith("speed_") and key.split("_")[-1].isdigit() and not key.startswith("end_"):
            number = key.split("_")[-1]
            assert number in title and number in title_en
            assert title != title_en or number in title
    speed_titles = {title for key, (title, _en) in seen.items() if key.startswith("speed_") and key[6:].isdigit()}
    assert len(speed_titles) == len({key for key in seen if key.startswith("speed_") and key[6:].isdigit()})
    for row in rows:
        legacy = _legacy_title(row)
        title = seen[row["id"]][0]
        if row["id"].startswith("speed_") and row["id"][6:].isdigit():
            assert legacy.endswith("km/s")
            assert legacy.split()[0] in title
            assert title.startswith("Hız sınırı ")
        elif row["id"].startswith("end_speed_"):
            assert legacy == row["tr"]["title"]
            assert title.startswith("Hız sonu ")
        else:
            assert title == legacy or title.startswith(legacy)


def test_raw_view_matches_the_file_and_writes_nothing(tmp_path, data_home):
    import yaml
    from fastapi.testclient import TestClient

    from trainer_studio.api import create_app
    from trainer_studio.service import image_raw, open_dataset

    root = tmp_path / "rawset"
    (root / "images").mkdir(parents=True)
    (root / "labels").mkdir()
    (root / "data.yaml").write_text(
        yaml.safe_dump({"path": ".", "train": "images", "names": {0: "person", 1: "bicycle"}}, sort_keys=False),
        encoding="utf-8",
    )
    label = "0 0.125000 0.125000 0.125000 0.125000\n1 0.500000 0.500000 0.100000 0.100000\n\n"
    label_path = root / "labels" / "raw_frame.txt"
    label_path.write_text(label, encoding="utf-8")
    write_jpeg(root / "images" / "raw_frame.jpg", 64)
    yaml_before = (root / "data.yaml").read_bytes()
    label_before = label_path.read_bytes()
    yaml_mtime = (root / "data.yaml").stat().st_mtime_ns
    label_mtime = label_path.stat().st_mtime_ns
    project = open_dataset(str(root))
    body = image_raw(project["id"], "raw_frame")
    assert body["labelText"] == label
    assert body["lines"][0]["classId"] == "person" and body["lines"][0]["classIndex"] == 0
    assert body["lines"][1]["classId"] == "bicycle"
    assert body["lines"][2]["text"] == ""
    assert len(body["image"]["sha256"]) == 64
    assert len(body["label"]["sha256"]) == 64
    assert label_path.read_bytes() == label_before
    assert (root / "data.yaml").read_bytes() == yaml_before
    assert label_path.stat().st_mtime_ns == label_mtime
    assert (root / "data.yaml").stat().st_mtime_ns == yaml_mtime
    source = (Path(__file__).resolve().parents[1] / "trainer_studio" / "rawview.py").read_text(encoding="utf-8")
    assert "write_if_changed" not in source
    client = TestClient(create_app())
    got = client.get(f"/api/projects/{project['id']}/images/raw_frame/raw")
    assert got.status_code == 200
    assert got.json()["labelText"] == label
    denied = client.post(f"/api/projects/{project['id']}/images/raw_frame/raw")
    assert denied.status_code == 405


def test_install_root_is_the_app_folder_not_its_parent():
    from trainer_studio import installpath

    app = Path(installpath.__file__).resolve().parents[1]
    assert install_root() == app.resolve()
    parent = app.parent
    if (parent / "start-trainer-studio.bat").is_file() or (parent / "private-plugins").is_dir():
        assert install_root() != parent.resolve()
    assert not inside_install(parent / "trainer" / "data" / "dataset")
    assert inside_install(app / "TempPro")


def _plant_dataset(folder: Path, stem: str, label: str) -> None:
    (folder / "images").mkdir(parents=True, exist_ok=True)
    (folder / "labels").mkdir(parents=True, exist_ok=True)
    write_jpeg(folder / "images" / f"{stem}.jpg")
    (folder / "labels" / f"{stem}.txt").write_text(label, encoding="utf-8")
    (folder / "data.yaml").write_text("names:\n- person\n", encoding="utf-8")


def test_sibling_legacy_dataset_is_not_trapped(tmp_path, data_home, monkeypatch):
    """signlens/{trainer-studio, trainer/data/dataset, private-plugins, start-trainer-studio.bat}."""
    signlens = tmp_path / "signlens"
    app = signlens / "trainer-studio"
    app.mkdir(parents=True)
    (signlens / "start-trainer-studio.bat").write_text("@echo off\n", encoding="utf-8")
    (signlens / "private-plugins").mkdir()
    assert (signlens / "start-trainer-studio.bat").is_file()
    assert (signlens / "private-plugins").is_dir()
    assert install_root_for(app) == app.resolve()
    assert install_root_for(app) != signlens.resolve()

    elsewhere = tmp_path / "not-the-app"
    elsewhere.mkdir()
    monkeypatch.setattr("trainer_studio.installpath.install_root", lambda: install_root_for(elsewhere))
    temppro = create_project(str(app / "TempPro"), "TempPro", "blank")
    (app / "TempPro" / "labels" / "frame.txt").write_text("0 0.500000 0.500000 0.200000 0.200000\n", encoding="utf-8")
    assert temppro["createdByApp"] is True

    foreign = app / "foreign-inside"
    _plant_dataset(foreign, "frame_foreign", "0 0.100000 0.100000 0.200000 0.200000\n")
    opened_foreign = open_dataset(str(foreign))
    assert opened_foreign["createdByApp"] is False

    dataset = signlens / "trainer" / "data" / "dataset"
    _plant_dataset(dataset, "frame_legacy", "1 0.200000 0.200000 0.300000 0.300000\n")
    legacy = open_dataset(str(dataset))
    assert legacy["createdByApp"] is False
    from trainer_studio.db import connect

    conn = connect()
    try:
        conn.execute("UPDATE projects SET opened_at = ? WHERE id = ?", ("2099-01-01T00:00:00+00:00", legacy["id"]))
        conn.commit()
    finally:
        conn.close()
    assert list_projects()[0]["id"] == legacy["id"]

    monkeypatch.setattr("trainer_studio.installpath.install_root", lambda: install_root_for(app))

    def refuse_move(*_args, **_kwargs):
        raise AssertionError("shutil.move")

    monkeypatch.setattr(shutil, "move", refuse_move)
    dataset_yaml = (dataset / "data.yaml").read_bytes()
    dataset_label = (dataset / "labels" / "frame_legacy.txt").read_bytes()
    foreign_yaml = (foreign / "data.yaml").read_bytes()
    places = project_places()
    assert places["installRoot"] == str(app.resolve())
    assert [row["id"] for row in places["trapped"]] == [temppro["id"]]
    assert legacy["id"] not in {row["id"] for row in places["trapped"]}
    assert opened_foreign["id"] not in {row["id"] for row in places["trapped"]}
    assert (dataset / "data.yaml").read_bytes() == dataset_yaml

    with pytest.raises(StudioError) as raised:
        move_project(legacy["id"], str(tmp_path / "Documents" / "stolen"), source=str(dataset.resolve()), confirm=True)
    assert raised.value.code == "project.foreign"
    assert not (tmp_path / "Documents" / "stolen").exists()
    assert (dataset / "data.yaml").read_bytes() == dataset_yaml
    assert (dataset / "labels" / "frame_legacy.txt").read_bytes() == dataset_label

    with pytest.raises(StudioError) as raised:
        move_project(opened_foreign["id"], str(tmp_path / "Documents" / "foreign"), source=str(foreign.resolve()), confirm=True)
    assert raised.value.code == "project.foreign"
    assert (foreign / "data.yaml").read_bytes() == foreign_yaml

    with pytest.raises(StudioError) as raised:
        move_project(temppro["id"], str(tmp_path / "Documents" / "TempPro"))
    assert raised.value.code == "move.confirm"
    assert (app / "TempPro" / "data.yaml").is_file()

    with pytest.raises(StudioError) as raised:
        move_project(
            temppro["id"],
            str(tmp_path / "Documents" / "TempPro"),
            source=str(dataset.resolve()),
            confirm=True,
        )
    assert raised.value.code == "move.confirm"
    assert (app / "TempPro").is_dir()

    dest = tmp_path / "Documents" / "Trainer Studio Projects" / "TempPro"
    before = (app / "TempPro" / "data.yaml").read_bytes()
    label = (app / "TempPro" / "labels" / "frame.txt").read_bytes()
    moved = move_project(temppro["id"], str(dest), source=str((app / "TempPro").resolve()), confirm=True)
    assert Path(moved["root"]) == dest.resolve()
    assert moved["createdByApp"] is True
    assert (dest / "data.yaml").read_bytes() == before
    assert (dest / "labels" / "frame.txt").read_bytes() == label
    assert not (app / "TempPro").exists()
    assert (dataset / "data.yaml").read_bytes() == dataset_yaml
    assert (dataset / "labels" / "frame_legacy.txt").read_bytes() == dataset_label
    listed = {row["id"]: row for row in list_projects()}
    assert listed[legacy["id"]]["root"] == str(dataset.resolve())
    assert list_projects()[0]["id"] == legacy["id"]


def test_copy_mismatch_leaves_the_source(tmp_path, data_home, monkeypatch):
    elsewhere = tmp_path / "not-the-app"
    elsewhere.mkdir()
    monkeypatch.setattr("trainer_studio.installpath.install_root", lambda: elsewhere.resolve())
    project = create_project(str(tmp_path / "made"), "Made", "blank")
    (tmp_path / "made" / "labels" / "a.txt").write_text("0 0.5 0.5 0.1 0.1\n", encoding="utf-8")
    before = (tmp_path / "made" / "data.yaml").read_bytes()
    real_copy = shutil.copytree

    def corrupt(src, dst, **kwargs):
        real_copy(src, dst, **kwargs)
        (Path(dst) / "data.yaml").write_bytes(b"names: [changed]\n")

    monkeypatch.setattr(shutil, "copytree", corrupt)
    monkeypatch.setattr(shutil, "move", lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("shutil.move")))
    dest = tmp_path / "elsewhere" / "Made"
    with pytest.raises(StudioError) as raised:
        move_project(project["id"], str(dest), source=str((tmp_path / "made").resolve()), confirm=True)
    assert raised.value.code == "move.verify"
    assert (tmp_path / "made" / "data.yaml").read_bytes() == before
    assert (tmp_path / "made" / "labels" / "a.txt").is_file()
    assert not dest.exists()
    assert list_projects()[0]["root"] == str((tmp_path / "made").resolve())
