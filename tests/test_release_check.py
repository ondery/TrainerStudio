import importlib.util
import zipfile
from pathlib import Path


def _load():
    path = Path(__file__).resolve().parents[1] / "scripts" / "release_check.py"
    spec = importlib.util.spec_from_file_location("release_check", path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def test_release_archive_skips_ignored_local_files(tmp_path):
    module = _load()
    root = Path(__file__).resolve().parents[1]
    assert module.archive_problems(root) == []
    from package_zip import write_zip

    dest = tmp_path / "trainer-studio-release.zip"
    write_zip(root, dest)
    names = zipfile.ZipFile(dest).namelist()
    assert "data/studio.db" not in names
    assert not any(name.startswith(".ruff_cache/") for name in names)
    assert not any(name.startswith("src-tauri/gen/") for name in names)
    assert "trainer_studio/service.py" in names
    assert "static/index.html" in names


def test_release_check_flags_a_private_path(tmp_path):
    module = _load()
    folder = tmp_path / ("private-" + "plugins") / ("ip" + "hone")
    folder.mkdir(parents=True)
    (folder / "note.txt").write_text("local", encoding="utf-8")
    hits = module.path_problems(tmp_path)
    assert hits
    keygen = tmp_path / "tools" / "private"
    keygen.mkdir(parents=True, exist_ok=True)
    (keygen / ("generate_" + "license.py")).write_text("x = 1\n", encoding="utf-8")
    again = module.path_problems(tmp_path)
    assert any("tools/private" in hit for hit in again)
