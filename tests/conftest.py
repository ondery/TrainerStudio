import json
from pathlib import Path

import pytest
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture
def data_home(tmp_path, monkeypatch):
    home = tmp_path / "studio-data"
    monkeypatch.setenv("STUDIO_DATA", str(home))
    monkeypatch.delenv("STUDIO_LICENSE", raising=False)
    return home


def signlens_names() -> list[str]:
    payload = json.loads((ROOT / "trainer_studio" / "templates" / "signlens.json").read_text(encoding="utf-8"))
    names = [row["id"] for row in payload["classes"]]
    assert len(names) == 79
    assert names[0] == "speed_5"
    assert names[2] == "speed_15"
    assert names[7] == "speed_60"
    assert names[68] == "speed_limit_panel_multi"
    assert names[78] == "no_horn"
    return names


def write_jpeg(path: Path, size: int = 32) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", (size, size), (20, 24, 28)).save(path, "JPEG")
