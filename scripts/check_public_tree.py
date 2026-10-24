"""Fail if private device or legacy naming leaks into the publishable tree."""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SKIP = {
    "node_modules",
    ".next",
    "out",
    "static",
    "data",
    "__pycache__",
    ".venv",
    "target",
    ".pytest_cache",
    ".mypy_cache",
    ".ruff_cache",
    "gen",
}
# Pieces are split so this file does not contain the terms it searches for.
_TERMS = (
    "ip" + "hone",
    "core" + "ml",
    "code" + "magic",
    "ml" + "package",
    "side" + "loadly",
    "signlens\\s+" + "ios",
    "ios/" + "signlens",
    "studio\\s*" + "2",
    "trainer studio " + "2",
)
BANNED = re.compile("|".join(_TERMS), re.IGNORECASE)
TEXT = {
    ".py",
    ".ts",
    ".tsx",
    ".js",
    ".mjs",
    ".json",
    ".md",
    ".yml",
    ".yaml",
    ".toml",
    ".txt",
    ".css",
    ".html",
    ".bat",
    ".rs",
    ".svg",
}


def scan(root: Path = ROOT) -> list[str]:
    hits = []
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        if any(part in SKIP for part in path.parts):
            continue
        if path.suffix.lower() not in TEXT:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        if BANNED.search(text):
            hits.append(str(path.relative_to(root)))
    return hits


def main() -> int:
    hits = scan()
    if hits:
        print("public tree check failed:")
        for hit in hits:
            print(f"  {hit}")
        return 1
    print("public tree check passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
