"""Native dialog helpers stay headless. The GUI itself is not opened here."""

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from tests.test_safety import _dataset
from trainer_studio.dialogs import file_types, pick, read_local_text, write_local_text
from trainer_studio.errors import StudioError
from trainer_studio.service import import_legacy_schema, open_dataset, studio_dataset_problem


def test_file_types_normalize_extensions():
    rows = file_types([{"name": "Weights", "extensions": [".pt", "onnx", "pt"]}])
    assert rows == [("Weights", "*.pt *.onnx")]
    assert file_types([]) == [("All", "*.*")]


def test_pick_stub_skips_the_window(monkeypatch):
    monkeypatch.setenv("STUDIO_DIALOG_PATH", "/data/set")
    body = pick("folder", [], "Open", "")
    assert body["path"] == "/data/set"
    assert body["cancelled"] is False
    assert body["grant"]
    monkeypatch.setenv("STUDIO_DIALOG_PATH", "")
    empty = pick("file", [{"name": "YAML", "extensions": ["yaml"]}], "YAML", "")
    assert empty["cancelled"] is True
    assert empty["path"] == ""
    assert "grant" not in empty


def test_pick_off_does_not_open_a_dialog(monkeypatch):
    monkeypatch.delenv("STUDIO_DIALOG_PATH", raising=False)
    monkeypatch.setenv("STUDIO_DIALOG", "off")
    body = pick("file", [], "", "")
    assert body["cancelled"] is True
    assert body["code"] == "dialog.unavailable"


def _session_client():
    from trainer_studio.api import create_app

    client = TestClient(create_app())
    health = client.get("/api/health")
    assert health.status_code == 200
    token = health.json()["session"]
    assert token
    return client, {"x-studio-session": token}


def test_dialog_route_returns_the_stub(monkeypatch, data_home):
    monkeypatch.setenv("STUDIO_DIALOG_PATH", str(data_home / "data.yaml"))
    client, headers = _session_client()
    refused = client.post("/api/dialog", json={"kind": "file"})
    assert refused.status_code == 403
    assert refused.json()["code"] == "local.session"
    response = client.post(
        "/api/dialog",
        headers=headers,
        json={"kind": "file", "filters": [{"name": "YAML", "extensions": ["yaml", "yml"]}]},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["path"].endswith("data.yaml")
    assert body["grant"]


def test_local_text_roundtrip_rejects_other_types(tmp_path):
    from trainer_studio.local_access import issue_grant

    path = tmp_path / "settings.json"
    grant = issue_grant(str(path))
    written = write_local_text(str(path), '{"ok": true}\n', grant)
    assert Path(written).read_text(encoding="utf-8").startswith("{")
    assert "ok" in read_local_text(str(path), issue_grant(str(path)))
    other = tmp_path / "weights.pt"
    other.write_bytes(b"not-text")
    with pytest.raises(StudioError) as raised:
        read_local_text(str(other), issue_grant(str(other)))
    assert raised.value.code == "dialog.file"
    key = tmp_path / "license.key"
    with pytest.raises(StudioError) as raised:
        write_local_text(str(key), "token", issue_grant(str(key)))
    assert raised.value.code == "dialog.file"


def test_local_paths_require_a_grant_or_the_data_dir(tmp_path, data_home, monkeypatch):
    outside = tmp_path / "labeling.json"
    outside.write_text("{}", encoding="utf-8")
    client, headers = _session_client()
    stolen = client.post("/api/local/read", headers=headers, json={"path": str(outside)})
    assert stolen.status_code == 403
    assert stolen.json()["code"] == "local.forbidden"
    bare = client.post("/api/local/write", json={"path": str(data_home / "note.json"), "text": "{}"})
    assert bare.status_code == 403
    assert bare.json()["code"] == "local.session"

    monkeypatch.setenv("STUDIO_DIALOG_PATH", str(outside))
    chosen = client.post("/api/dialog", headers=headers, json={"kind": "file"}).json()
    first = client.post("/api/local/read", headers=headers, json={"path": chosen["path"], "grant": chosen["grant"]})
    assert first.status_code == 200
    assert first.json()["text"] == "{}"
    again = client.post("/api/local/read", headers=headers, json={"path": chosen["path"], "grant": chosen["grant"]})
    assert again.status_code == 403

    inside = data_home / "settings.json"
    saved = client.post("/api/local/write", headers=headers, json={"path": str(inside), "text": '{"ok":1}\n'})
    assert saved.status_code == 200
    assert inside.read_text(encoding="utf-8").startswith("{")
    read_back = client.post("/api/local/read", headers=headers, json={"path": str(inside)})
    assert read_back.status_code == 200

    link = data_home / "escape.json"
    link.symlink_to(outside)
    escaped = client.post("/api/local/read", headers=headers, json={"path": str(link)})
    assert escaped.status_code == 403
    climbed = client.post("/api/local/read", headers=headers, json={"path": str(data_home / ".." / outside.name)})
    assert climbed.status_code == 403


def test_dataset_labels_and_yaml_cannot_be_written(tmp_path, data_home, monkeypatch):
    root = _dataset(tmp_path)
    project = open_dataset(str(root))
    assert project["id"]
    labels = root / "labels" / "meta.json"
    yaml_path = root / "data.yaml"
    labeling = root / "labeling.json"
    labeling.write_text("{}\n", encoding="utf-8")
    before_yaml = yaml_path.read_bytes()
    client, headers = _session_client()

    def granted(path: Path) -> dict:
        monkeypatch.setenv("STUDIO_DIALOG_PATH", str(path))
        return client.post("/api/dialog", headers=headers, json={"kind": "file"}).json()

    for target in (labels, yaml_path):
        choice = granted(target)
        response = client.post(
            "/api/local/write",
            headers=headers,
            json={"path": choice["path"], "grant": choice["grant"], "text": '{"pwn":true}\n'},
        )
        assert response.status_code == 403
        assert response.json()["code"] == "local.forbidden"
    assert yaml_path.read_bytes() == before_yaml
    assert not labels.exists()

    choice = granted(labeling)
    written = client.post(
        "/api/local/write",
        headers=headers,
        json={"path": choice["path"], "grant": choice["grant"], "text": '{"schemaVersion":1}\n'},
    )
    assert written.status_code == 200
    assert "schemaVersion" in labeling.read_text(encoding="utf-8")
    reused = client.post(
        "/api/local/write",
        headers=headers,
        json={"path": str(labeling), "grant": choice["grant"], "text": "{}\n"},
    )
    assert reused.status_code == 403


def test_plugin_extension_operation_ids_are_unique():
    import warnings

    from trainer_studio.api import create_app

    with warnings.catch_warnings(record=True) as caught:
        warnings.simplefilter("always")
        app = create_app()
        schema = app.openapi()
    duplicates = [str(item.message) for item in caught if "Duplicate Operation ID" in str(item.message)]
    assert duplicates == []
    ids: list[str] = []
    for methods in schema["paths"].values():
        for method, operation in methods.items():
            if method.startswith("x-") or not isinstance(operation, dict):
                continue
            ids.append(operation["operationId"])
    assert len(ids) == len(set(ids))
    assert {"plugin_ext_get", "plugin_ext_post", "plugin_ext_put", "plugin_ext_delete"} <= set(ids)


def test_open_data_yaml_file_uses_its_folder(tmp_path, data_home):
    root = _dataset(tmp_path)
    assert studio_dataset_problem(str(root / "data.yaml")) == ""
    project = open_dataset(str(root / "data.yaml"))
    assert Path(project["root"]) == root.resolve()
    assert (root / "data.yaml").read_bytes()  # opening a yaml path does not delete it


def test_legacy_import_from_a_chosen_file_is_read_only(tmp_path, data_home):
    root = _dataset(tmp_path)
    project = open_dataset(str(root))
    chosen = tmp_path / "labeling.json"
    chosen.write_text(json.dumps({"schemaVersion": 1, "fields": [
        {"id": "note", "scope": "image", "type": "text", "label": "Note"},
    ]}), encoding="utf-8")
    before = chosen.read_bytes()
    imported = import_legacy_schema(project["id"], str(chosen))
    assert imported["bytesIdentical"] is True
    assert chosen.read_bytes() == before
    assert any(field["id"] == "note" for field in imported["fields"])
