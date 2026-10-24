# Plugin API

A plugin is a folder with `manifest.json` and a Python entry. The core discovers folders from:

- `plugins/` inside the product
- `<data directory>/plugins/`
- every directory on `STUDIO_PLUGIN_PATH`
- a sibling `private-plugins/` directory, when that directory exists

The core labeling workspace runs with no plugins installed. Plugins can be enabled or disabled in Settings. A new plugin is enabled until a row in `plugin_state` says otherwise.

## Manifest

```json
{
  "id": "sample",
  "name": "Sample",
  "version": "0.1.0",
  "entry": "plugin.py",
  "frontend": "ui.js",
  "permissions": ["dataset", "export", "network", "jobs", "files", "settings", "tools"],
  "description": "What the plugin does."
}
```

`id` must match the prefix of every route. Unknown permissions are rejected and the plugin stays disabled.

## Python

```python
def register(context):
    context.add_panel({"id": "main", "title": "Sample"})
    context.add_menu({"id": "main", "title": "Sample"})
    context.add_command({"id": "sample.run", "title": "Run sample"})
    context.add_settings({"id": "sample", "title": "Sample"})
    context.add_exporter("sample", "Sample export")
    context.add_job("sample", "Sample job")

    def ping(body, request):
        return {"ok": True}

    context.add_route("POST", "/api/plugins/ext/sample/ping", ping, "dataset")
```

Routes must start with `/api/plugins/ext/<id>/`. The host checks the permission before the route is stored. A failing `register` is recorded on the plugin and does not stop the server.

Frontend files are served at `/api/plugins/file/<id>/<path>` after a path-traversal check. The static shell does not need a rebuild.

## Frontend

The shell loads `frontend` as a script and calls:

```javascript
window.TrainerStudio.registerPlugin({
  id: "sample",
  mount(element) {
    element.textContent = "Sample";
  },
});
```

`mount` receives the panel element rendered for that plugin id. Talk to the core with `fetch("/api/plugins/ext/<id>/...")`.

## Public export

`scripts/export_public.py` copies this product folder to a repository root. It does not copy a sibling `private-plugins/` directory. `scripts/check_public_tree.py` fails the build if device-specific or retired product names appear in this tree. The optional SignLens class template is allowed.
