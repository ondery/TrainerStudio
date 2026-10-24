"""SQLite metadata. The dataset folder is not the database."""

from __future__ import annotations

import os
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path

_LOCK = threading.RLock()
_SCHEMA = """
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  root TEXT NOT NULL UNIQUE,
  task TEXT NOT NULL,
  created_at TEXT NOT NULL,
  opened_at TEXT NOT NULL,
  schema_ready INTEGER NOT NULL DEFAULT 0,
  created_by_app INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS classes (
  project_id TEXT NOT NULL,
  key TEXT NOT NULL,
  yaml_index INTEGER NOT NULL,
  title TEXT NOT NULL,
  title_en TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  color TEXT NOT NULL,
  icon TEXT NOT NULL,
  sort_index INTEGER NOT NULL,
  visible INTEGER NOT NULL DEFAULT 1,
  hotkey TEXT NOT NULL DEFAULT '',
  parent_key TEXT NOT NULL DEFAULT '',
  attrs TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (project_id, key)
);
CREATE TABLE IF NOT EXISTS images (
  id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  stem TEXT NOT NULL,
  rel_path TEXT NOT NULL,
  name TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  split TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  attributes TEXT NOT NULL,
  meta TEXT NOT NULL,
  label_rel TEXT,
  label_sha TEXT NOT NULL DEFAULT '',
  sort_index INTEGER NOT NULL,
  PRIMARY KEY (project_id, id)
);
CREATE TABLE IF NOT EXISTS annotations (
  id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  image_id TEXT NOT NULL,
  class_key TEXT NOT NULL,
  geometry TEXT NOT NULL,
  attributes TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  PRIMARY KEY (project_id, id)
);
CREATE TABLE IF NOT EXISTS fields (
  project_id TEXT NOT NULL,
  field_id TEXT NOT NULL,
  payload TEXT NOT NULL,
  sort_index INTEGER NOT NULL,
  PRIMARY KEY (project_id, field_id)
);
CREATE TABLE IF NOT EXISTS versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL,
  image_id TEXT,
  kind TEXT NOT NULL,
  note TEXT NOT NULL,
  backup_path TEXT,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  project_id TEXT,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  progress REAL NOT NULL DEFAULT 0,
  message TEXT NOT NULL DEFAULT '',
  payload TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS plugin_state (
  id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS kv (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
"""


def data_dir() -> Path:
    override = os.environ.get("STUDIO_DATA_DIR") or os.environ.get("STUDIO_DATA")
    path = Path(override) if override else Path(__file__).resolve().parents[1] / "data"
    path.mkdir(parents=True, exist_ok=True)
    return path


def connect() -> sqlite3.Connection:
    path = data_dir() / "studio.db"
    conn = sqlite3.connect(path, timeout=30, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.executescript(_SCHEMA)
    _migrate(conn)
    return conn


def _migrate(conn: sqlite3.Connection) -> None:
    columns = {row[1] for row in conn.execute("PRAGMA table_info(projects)")}
    if columns and "created_by_app" not in columns:
        conn.execute("ALTER TABLE projects ADD COLUMN created_by_app INTEGER NOT NULL DEFAULT 0")
    class_columns = {row[1] for row in conn.execute("PRAGMA table_info(classes)")}
    if class_columns and "hotkey" not in class_columns:
        conn.execute("ALTER TABLE classes ADD COLUMN hotkey TEXT NOT NULL DEFAULT ''")
    if class_columns and "parent_key" not in class_columns:
        conn.execute("ALTER TABLE classes ADD COLUMN parent_key TEXT NOT NULL DEFAULT ''")
    if class_columns and "attrs" not in class_columns:
        conn.execute("ALTER TABLE classes ADD COLUMN attrs TEXT NOT NULL DEFAULT ''")
    _migrate_image_scope(conn)
    tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
    if "annotations" in tables and "project_id" in {row[1] for row in conn.execute("PRAGMA table_info(annotations)")}:
        conn.execute("CREATE INDEX IF NOT EXISTS annotations_by_image ON annotations(project_id, image_id)")


def _pk_columns(conn: sqlite3.Connection, table: str) -> list[str]:
    ranked = [(int(row[5]), row[1]) for row in conn.execute(f"PRAGMA table_info({table})") if int(row[5]) > 0]
    ranked.sort()
    return [name for _order, name in ranked]


def _backup_studio_db(conn: sqlite3.Connection) -> Path:
    """Consistent copy of studio.db taken before the image-id migration."""
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    dest = data_dir() / "backups" / f"studio-db-{stamp}.db"
    dest.parent.mkdir(parents=True, exist_ok=True)
    target = sqlite3.connect(dest)
    try:
        conn.backup(target)
    finally:
        target.close()
    return dest


def _migrate_image_scope(conn: sqlite3.Connection) -> None:
    """Image and annotation ids are unique per project, not across the whole database.

    An existing studio.db is copied to data/backups before the tables are rebuilt.
    Image id values stay the file stem so tracked rows keep their identity.
    """
    tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
    if "images" not in tables:
        return
    image_pk = _pk_columns(conn, "images")
    ann_columns = {row[1] for row in conn.execute("PRAGMA table_info(annotations)")} if "annotations" in tables else set()
    if image_pk == ["project_id", "id"] and "project_id" in ann_columns:
        return
    _backup_studio_db(conn)
    conn.execute("PRAGMA foreign_keys=OFF")
    try:
        if "annotations" in tables and "project_id" not in ann_columns:
            conn.execute(
                """CREATE TABLE annotations_next (
                  id TEXT NOT NULL,
                  project_id TEXT NOT NULL,
                  image_id TEXT NOT NULL,
                  class_key TEXT NOT NULL,
                  geometry TEXT NOT NULL,
                  attributes TEXT NOT NULL,
                  created_at TEXT NOT NULL,
                  updated_at TEXT NOT NULL,
                  ordinal INTEGER NOT NULL,
                  PRIMARY KEY (project_id, id)
                )"""
            )
            conn.execute(
                """INSERT INTO annotations_next (id, project_id, image_id, class_key, geometry, attributes, created_at, updated_at, ordinal)
                   SELECT a.id, i.project_id, a.image_id, a.class_key, a.geometry, a.attributes, a.created_at, a.updated_at, a.ordinal
                   FROM annotations a
                   JOIN images i ON i.id = a.image_id"""
            )
            conn.execute("DROP TABLE annotations")
            conn.execute("ALTER TABLE annotations_next RENAME TO annotations")
        if image_pk != ["project_id", "id"]:
            conn.execute(
                """CREATE TABLE images_next (
                  id TEXT NOT NULL,
                  project_id TEXT NOT NULL,
                  stem TEXT NOT NULL,
                  rel_path TEXT NOT NULL,
                  name TEXT NOT NULL,
                  width INTEGER NOT NULL,
                  height INTEGER NOT NULL,
                  split TEXT NOT NULL DEFAULT '',
                  status TEXT NOT NULL,
                  attributes TEXT NOT NULL,
                  meta TEXT NOT NULL,
                  label_rel TEXT,
                  label_sha TEXT NOT NULL DEFAULT '',
                  sort_index INTEGER NOT NULL,
                  PRIMARY KEY (project_id, id)
                )"""
            )
            conn.execute(
                """INSERT INTO images_next (id, project_id, stem, rel_path, name, width, height, split, status, attributes, meta, label_rel, label_sha, sort_index)
                   SELECT id, project_id, stem, rel_path, name, width, height, split, status, attributes, meta, label_rel, label_sha, sort_index
                   FROM images"""
            )
            conn.execute("DROP TABLE images")
            conn.execute("ALTER TABLE images_next RENAME TO images")
        conn.execute("CREATE INDEX IF NOT EXISTS annotations_by_image ON annotations(project_id, image_id)")
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.execute("PRAGMA foreign_keys=ON")


def transaction():
    return _LOCK
