"""Plugin host.

Plugins are discovered from the public plugins directory, the data directory,
``STUDIO_PLUGIN_PATH``, and a sibling ``private-plugins`` folder when one exists.
The core works with none of them enabled.
"""

from __future__ import annotations

import importlib.util
import json
import logging
import os
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

from trainer_studio.errors import StudioError
from trainer_studio.messages import text

log = logging.getLogger("trainer_studio.plugins")
_SKIP_DIR = re.compile(r"\.(?:old|bak)", re.IGNORECASE)

PERMISSIONS = {"dataset", "export", "network", "jobs", "files", "settings", "tools"}


@dataclass
class PluginContext:
    plugin_id: str
    folder: Path
    permissions: set[str]
    routes: list = field(default_factory=list)
    panels: list = field(default_factory=list)
    menus: list = field(default_factory=list)
    commands: list = field(default_factory=list)
    settings: list = field(default_factory=list)
    exporters: list = field(default_factory=list)
    jobs: list = field(default_factory=list)

    def _check(self, permission: str) -> None:
        if permission not in self.permissions:
            raise StudioError(code="plugin.permission", params={"permission": permission})

    def add_route(self, method: str, path: str, fn: Callable, permission: str) -> None:
        self._check(permission)
        if not path.startswith(f"/api/plugins/ext/{self.plugin_id}/"):
            raise StudioError(code="plugin.path")
        self.routes.append({"method": method.upper(), "path": path, "fn": fn, "permission": permission})

    def add_panel(self, spec: dict) -> None:
        self.panels.append({"plugin": self.plugin_id, **spec})

    def add_menu(self, spec: dict) -> None:
        self.menus.append({"plugin": self.plugin_id, **spec})

    def add_command(self, spec: dict) -> None:
        self.commands.append({"plugin": self.plugin_id, **spec})

    def add_settings(self, spec: dict) -> None:
        self.settings.append({"plugin": self.plugin_id, **spec})

    def add_exporter(self, export_id: str, title: str) -> None:
        self._check("export")
        self.exporters.append({"plugin": self.plugin_id, "id": export_id, "title": title})

    def add_job(self, kind: str, title: str) -> None:
        self._check("jobs")
        self.jobs.append({"plugin": self.plugin_id, "kind": kind, "title": title})

    def log(self, message: str) -> None:
        return None


class PluginHost:
    def __init__(self) -> None:
        self.records: list[dict] = []

    def roots(self) -> list[Path]:
        product = Path(__file__).resolve().parents[1]
        found = [product / "plugins"]
        from trainer_studio.db import data_dir

        found.append(data_dir() / "plugins")
        extra = os.environ.get("STUDIO_PLUGIN_PATH") or ""
        for part in extra.split(os.pathsep):
            if part:
                found.append(Path(part))
        private = product.parent / "private-plugins"
        if private.is_dir():
            found.append(private)
        unique = []
        seen = set()
        for path in found:
            resolved = path.resolve()
            if resolved in seen:
                continue
            seen.add(resolved)
            unique.append(path)
        return unique

    def discover(self) -> None:
        self.records = []
        found: list[dict] = []
        for root in self.roots():
            if not root.is_dir():
                continue
            for folder in sorted(path for path in root.iterdir() if path.is_dir()):
                if _SKIP_DIR.search(folder.name):
                    log.warning("Ignoring plugin folder %s", folder)
                    continue
                manifest_path = folder / "manifest.json"
                if manifest_path.is_file():
                    parsed = self._parse(folder, manifest_path)
                    if parsed:
                        found.append(parsed)
        winners: dict[str, dict] = {}
        for record in found:
            current = winners.get(record["id"])
            if current is None:
                winners[record["id"]] = record
                continue
            keep_new = _version_key(record["version"]) >= _version_key(current["version"])
            dropped = current if keep_new else record
            kept = record if keep_new else current
            log.warning(
                "Duplicate plugin id %s: skipping %s (%s), keeping %s (%s)",
                record["id"],
                dropped["folder"],
                dropped["version"],
                kept["folder"],
                kept["version"],
            )
            winners[record["id"]] = kept
        for record in winners.values():
            self._activate(record)

    def _enabled(self, plugin_id: str) -> bool:
        from trainer_studio.db import connect

        conn = connect()
        try:
            row = conn.execute("SELECT enabled FROM plugin_state WHERE id = ?", (plugin_id,)).fetchone()
            if row is None:
                return True
            return bool(row["enabled"])
        finally:
            conn.close()

    def set_enabled(self, plugin_id: str, enabled: bool) -> None:
        from trainer_studio.db import connect, transaction

        with transaction():
            conn = connect()
            try:
                conn.execute(
                    "INSERT INTO plugin_state (id, enabled) VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET enabled = excluded.enabled",
                    (plugin_id, 1 if enabled else 0),
                )
                conn.commit()
            finally:
                conn.close()
        self.discover()

    def _parse(self, folder: Path, manifest_path: Path) -> dict | None:
        try:
            manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return None
        plugin_id = str(manifest.get("id") or "")
        if not plugin_id or not manifest.get("name") or not manifest.get("version"):
            return None
        permissions = set(manifest.get("permissions") or [])
        return {
            "id": plugin_id,
            "name": manifest.get("name"),
            "version": str(manifest.get("version")),
            "description": manifest.get("description") or "",
            "permissions": sorted(permissions),
            "unknown": permissions - PERMISSIONS,
            "frontend": manifest.get("frontend") or "",
            "entry": str(manifest.get("entry") or "plugin.py"),
            "folder": folder,
            "enabled": False,
            "error": "",
            "context": None,
        }

    def _activate(self, record: dict) -> None:
        folder = Path(record["folder"])
        permissions = set(record["permissions"])
        unknown = record.pop("unknown", set())
        plugin_id = record["id"]
        if unknown:
            record["error"] = text("plugin.permission", permission=", ".join(sorted(unknown)))
            self.records.append(record)
            return
        if not self._enabled(plugin_id):
            self.records.append(record)
            return
        entry = folder / str(record.get("entry") or "plugin.py")
        if not entry.is_file():
            record["error"] = text("plugin.file")
            self.records.append(record)
            return
        context = PluginContext(plugin_id, folder, permissions)
        try:
            spec = importlib.util.spec_from_file_location(f"trainer_plugin_{plugin_id}", entry)
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            module.register(context)
        except Exception as exc:  # noqa: BLE001 - a bad plugin must not stop the core
            record["error"] = str(exc)[:300]
            self.records.append(record)
            return
        record["enabled"] = True
        record["context"] = context
        self.records.append(record)

    def public(self) -> list[dict]:
        rows = []
        for record in self.records:
            context: PluginContext | None = record.get("context")
            rows.append({
                "id": record["id"],
                "name": record["name"],
                "version": record["version"],
                "description": record["description"],
                "permissions": record["permissions"],
                "enabled": record["enabled"],
                "error": record["error"],
                "frontend": f"/api/plugins/file/{record['id']}/{record['frontend']}" if record.get("frontend") and record["enabled"] else "",
                "panels": context.panels if context else [],
                "menus": context.menus if context else [],
                "commands": context.commands if context else [],
                "settings": context.settings if context else [],
                "exporters": context.exporters if context else [],
                "jobs": context.jobs if context else [],
            })
        return rows

    def file(self, plugin_id: str, relative: str) -> Path:
        for record in self.records:
            if record["id"] != plugin_id or not record["enabled"]:
                continue
            folder = Path(record["folder"]).resolve()
            path = (folder / relative).resolve()
            if not path.is_relative_to(folder) or not path.is_file():
                break
            return path
        raise StudioError(code="plugin.file", status=404)

    def routes(self) -> list[dict]:
        found = []
        for record in self.records:
            context = record.get("context")
            if context:
                found.extend(context.routes)
        return found


def _version_key(value: str) -> tuple[int, ...]:
    nums = [int(part) for part in re.findall(r"\d+", str(value or ""))]
    return tuple(nums) or (0,)


HOST = PluginHost()
