import json

from trainer_studio.plugins import HOST


def test_plugin_discovery_and_route(tmp_path, data_home, monkeypatch):
    folder = tmp_path / "sample-plugin"
    folder.mkdir()
    (folder / "manifest.json").write_text(
        json.dumps(
            {
                "id": "sample",
                "name": "Sample",
                "version": "0.1.0",
                "entry": "plugin.py",
                "frontend": "ui.js",
                "permissions": ["dataset"],
            }
        ),
        encoding="utf-8",
    )
    (folder / "plugin.py").write_text(
        "def register(ctx):\n"
        "    ctx.add_panel({'id': 'sample', 'title': 'Sample'})\n"
        "    ctx.add_route('GET', '/api/plugins/ext/sample/ping', lambda body, request: {'ok': True}, 'dataset')\n",
        encoding="utf-8",
    )
    (folder / "ui.js").write_text("/* sample */\n", encoding="utf-8")
    monkeypatch.setenv("STUDIO_PLUGIN_PATH", str(tmp_path))
    HOST.discover()
    rows = {row["id"]: row for row in HOST.public()}
    assert rows["sample"]["enabled"] is True
    assert rows["sample"]["panels"][0]["title"] == "Sample"
    assert HOST.file("sample", "ui.js").is_file()
    assert any(route["path"] == "/api/plugins/ext/sample/ping" for route in HOST.routes())
