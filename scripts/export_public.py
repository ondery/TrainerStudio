"""Copy the product folder to a repository root and refuse a dirty tree."""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path

from check_public_tree import scan

ROOT = Path(__file__).resolve().parents[1]
SKIP = {
    "node_modules",
    ".next",
    "out",
    "data",
    "__pycache__",
    ".venv",
    "target",
    ".pytest_cache",
    ".mypy_cache",
    ".ruff_cache",
    ".git",
    "gen",
}


def export(dest: Path) -> None:
    if dest.exists():
        raise SystemExit(f"destination exists: {dest}")
    dest.mkdir(parents=True)
    for path in ROOT.rglob("*"):
        relative = path.relative_to(ROOT)
        if any(part in SKIP for part in relative.parts):
            continue
        target = dest / relative
        if path.is_dir():
            target.mkdir(parents=True, exist_ok=True)
        elif path.is_file():
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(path, target)
    hits = scan(dest)
    if hits:
        raise SystemExit("exported tree failed the public check: " + ", ".join(hits))
    print(dest)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("dest", type=Path)
    args = parser.parse_args()
    export(args.dest.resolve())


if __name__ == "__main__":
    main()
