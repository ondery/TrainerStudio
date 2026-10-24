"""Zip the product tree, skipping paths from .gitignore and .dockerignore.

Does not tag, push an image, or create a repository.
"""

from __future__ import annotations

import argparse
import hashlib
import os
import re
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

_REQUIRED = (
    "data/studio.db",
    ".ruff_cache/CACHEDIR.TAG",
    "src-tauri/gen/schemas/desktop-schema.json",
)


def _rules(path: Path) -> list[tuple[bool, bool, bool, str]]:
    if not path.is_file():
        return []
    parsed = []
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        negated = line.startswith("!")
        if negated:
            line = line[1:]
        dir_only = line.endswith("/")
        line = line.rstrip("/")
        if line.startswith("/"):
            anchored = True
            line = line[1:]
        elif line.startswith("**/"):
            anchored = False
            line = line[3:]
        else:
            anchored = "/" in line
        if line:
            parsed.append((negated, dir_only, anchored, line))
    return parsed


_GLOBS: dict[str, re.Pattern[str]] = {}


def _glob(path: str, pattern: str) -> bool:
    compiled = _GLOBS.get(pattern)
    if compiled is None:
        regex = ["^"]
        index = 0
        while index < len(pattern):
            if pattern.startswith("**/", index):
                regex.append("(?:.*/)?")
                index += 3
                continue
            if pattern.startswith("**", index):
                regex.append(".*")
                index += 2
                continue
            char = pattern[index]
            if char == "*":
                regex.append("[^/]*")
            elif char == "?":
                regex.append("[^/]")
            else:
                regex.append(re.escape(char))
            index += 1
        regex.append("$")
        compiled = re.compile("".join(regex))
        _GLOBS[pattern] = compiled
    return compiled.fullmatch(path) is not None


def _hits(path: str, is_dir: bool, dir_only: bool, anchored: bool, pattern: str) -> bool:
    parts = path.split("/")
    if anchored:
        targets = [(path, is_dir)]
        parent = path
        while "/" in parent:
            parent = parent.rsplit("/", 1)[0]
            targets.append((parent, True))
        for target, target_dir in targets:
            if dir_only and not target_dir:
                continue
            if _glob(target, pattern):
                return True
        return False
    for index, part in enumerate(parts):
        part_dir = is_dir if index == len(parts) - 1 else True
        if dir_only and not part_dir:
            continue
        if _glob(part, pattern):
            return True
    return False


def _ignored(rel: str, is_dir: bool, rules: list[tuple[bool, bool, bool, str]]) -> bool:
    matched = False
    for negated, dir_only, anchored, pattern in rules:
        if _hits(rel, is_dir, dir_only, anchored, pattern):
            matched = not negated
    return matched


def load_rules(root: Path) -> tuple[list, list]:
    return _rules(root / ".gitignore"), _rules(root / ".dockerignore")


def excluded(root: Path, rel: str, is_dir: bool = False, rules: tuple[list, list] | None = None) -> bool:
    """True when .gitignore or .dockerignore skips this path."""
    git_rules, docker_rules = rules if rules is not None else load_rules(root)
    rel = rel.replace("\\", "/").lstrip("/")
    if not rel:
        return False
    return _ignored(rel, is_dir, git_rules) or _ignored(rel, is_dir, docker_rules)


def iter_archive_names(root: Path) -> list[str]:
    """Files that belong in the release zip, relative posix, sorted."""
    rules = load_rules(root)
    names: list[str] = []
    for dirpath, dirnames, filenames in os.walk(root):
        rel_dir = Path(dirpath).relative_to(root).as_posix()
        if rel_dir == ".":
            rel_dir = ""
        kept = []
        for name in dirnames:
            rel = f"{rel_dir}/{name}" if rel_dir else name
            if excluded(root, rel, True, rules):
                continue
            kept.append(name)
        dirnames[:] = kept
        for name in filenames:
            rel = f"{rel_dir}/{name}" if rel_dir else name
            if excluded(root, rel, False, rules):
                continue
            names.append(rel)
    names.sort()
    return names


def archive_problems(root: Path) -> list[str]:
    """Ignored local files that would still be packed, plus missing ignore rules."""
    problems = []
    rules = load_rules(root)
    for sample in _REQUIRED:
        if not excluded(root, sample, False, rules):
            problems.append(sample)
    for name in iter_archive_names(root):
        if name == "data/studio.db" or name.startswith(".ruff_cache/") or name.startswith("src-tauri/gen/"):
            problems.append(name)
    return problems


def write_zip(root: Path, dest: Path) -> str:
    dest = dest.resolve()
    dest.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED) as archive:
        for name in iter_archive_names(root):
            path = root / name
            if path.resolve() == dest:
                continue
            archive.write(path, name)
    return hashlib.sha256(dest.read_bytes()).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("dest", type=Path)
    args = parser.parse_args()
    dest = args.dest
    digest = write_zip(ROOT, dest)
    sums = Path("SHA256SUMS")
    sums.write_text(f"{digest}  {dest.name}\n", encoding="utf-8")
    print(digest)


if __name__ == "__main__":
    main()
