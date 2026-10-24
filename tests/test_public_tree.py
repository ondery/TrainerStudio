import importlib.util
from pathlib import Path


def test_public_tree_has_no_private_device_code():
    path = Path(__file__).resolve().parents[1] / "scripts" / "check_public_tree.py"
    spec = importlib.util.spec_from_file_location("check_public_tree", path)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    assert module.scan() == []
