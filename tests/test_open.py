"""Opening a dataset is read-only, remembered, and cheaper the second time."""

from tests.conftest import write_jpeg
from tests.test_safety import _dataset
from trainer_studio.envsetup import plan
from trainer_studio.importer import header_size, image_size
from trainer_studio.progress import begin, finish, snapshot, tick
from trainer_studio.service import last_dataset_path, open_dataset


def test_jpeg_header_matches_pillow(tmp_path):
    path = tmp_path / "frame.jpg"
    write_jpeg(path, 48)
    assert header_size(path) == (48, 48)
    assert image_size(path, None) == (48, 48)
    assert image_size(path, {"width": 10, "height": 12}) == (10, 12)


def test_second_open_skips_the_snapshot(tmp_path, data_home, monkeypatch):
    root = _dataset(tmp_path)
    project = open_dataset(str(root))
    assert last_dataset_path() == str(root.resolve())
    calls = {"n": 0}
    import trainer_studio.importer as importer

    real = importer.build_snapshot

    def wrapped(*args, **kwargs):
        calls["n"] += 1
        return real(*args, **kwargs)

    monkeypatch.setattr("trainer_studio.service.build_snapshot", wrapped)
    again = open_dataset(str(root))
    assert again["id"] == project["id"]
    assert calls["n"] == 0


def test_progress_snapshot_is_visible_while_active():
    begin("/tmp/dataset", 8)
    tick("read", 3, 8)
    body = snapshot()
    assert body["active"] is True
    assert body["done"] == 3
    assert body["total"] == 8
    finish()
    assert snapshot()["active"] is False


def test_requirements_plan_skips_unchanged_hashes():
    assert plan("abc", "abc", False, None, "win") == ("skip", "install")
    assert plan("abc", "abc", True, "old", "win") == ("skip", "ready")
    assert plan("old", "abc", False, "win", "win") == ("install", "install")
    assert plan(None, "abc", False, None, "") == ("install", "skip")
