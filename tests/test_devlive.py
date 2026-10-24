"""Live checkout: data dir override and dependency reinstall decisions."""

from trainer_studio.db import data_dir
from trainer_studio.devlive import lock_action, reinstall_plan


def test_data_dir_prefers_studio_data_dir(tmp_path, monkeypatch):
    chosen = tmp_path / "live"
    other = tmp_path / "legacy"
    monkeypatch.setenv("STUDIO_DATA_DIR", str(chosen))
    monkeypatch.setenv("STUDIO_DATA", str(other))
    assert data_dir() == chosen
    assert chosen.is_dir()
    assert not other.exists()


def test_data_dir_still_honors_studio_data(tmp_path, monkeypatch):
    monkeypatch.delenv("STUDIO_DATA_DIR", raising=False)
    legacy = tmp_path / "legacy"
    monkeypatch.setenv("STUDIO_DATA", str(legacy))
    assert data_dir() == legacy


def test_lock_installs_only_when_the_lockfile_changes():
    assert lock_action("abc", "abc", True) == "skip"
    assert lock_action("abc", "def", True) == "ci"
    assert lock_action(None, "abc", False) == "ci"
    assert lock_action("abc", "abc", False) == "ci"


def test_pull_reinstalls_only_changed_deps():
    same = {"requirements.txt": "a", "requirements-window.txt": "b", "web/package-lock.json": "c"}
    assert reinstall_plan(same, dict(same)) == (False, False)
    moved_py = dict(same)
    moved_py["requirements.txt"] = "z"
    assert reinstall_plan(same, moved_py) == (True, False)
    moved_js = dict(same)
    moved_js["web/package-lock.json"] = "z"
    assert reinstall_plan(same, moved_js) == (False, True)
