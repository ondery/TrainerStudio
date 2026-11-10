"""Example command plugin. It does not label images."""


def register(context):
    context.add_menu({"id": "example", "title": "Example"})
    context.add_command(
        {
            "id": "example.run",
            "title": "Run example",
            "path": "/api/plugins/ext/example/run",
        }
    )

    def run(body, request):
        return {"ok": True, "id": body.get("id") or "example.run"}

    context.add_route("POST", "/api/plugins/ext/example/run", run, "tools")
