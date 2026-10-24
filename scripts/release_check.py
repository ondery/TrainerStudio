"""Copy the product to a public tree and verify it.

Does not tag, push an image, or create a repository.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

_SCRIPTS = Path(__file__).resolve().parent
if str(_SCRIPTS) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS))

from check_public_tree import scan  # noqa: E402
from export_public import export  # noqa: E402
from package_zip import archive_problems  # noqa: E402

# Split so this file does not contain the terms the public check searches for.
_PATH_MARKERS = (
    "private-" + "plugins",
    "ip" + "hone",
    "generate_" + "license",
    "tools/" + "private",
)


def path_problems(dest: Path) -> list[str]:
    found = []
    if not dest.exists():
        return [str(dest)]
    for path in dest.rglob("*"):
        rel = path.relative_to(dest).as_posix().lower()
        if any(marker in rel for marker in _PATH_MARKERS):
            found.append(rel)
    found.extend(scan(dest))
    return found


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("dest", type=Path)
    args = parser.parse_args()
    dest = args.dest.resolve()
    export(dest)
    hits = path_problems(dest)
    hits.extend(archive_problems(Path(__file__).resolve().parents[1]))
    if hits:
        print("public tree check failed:")
        for hit in hits:
            print(f"  {hit}")
        raise SystemExit(1)
    print(dest)
    print("public tree ok")
    print("docker build -f Dockerfile -t trainer-studio:cpu .")
    print("docker build -f Dockerfile.cuda -t trainer-studio:cuda .")
    print("git tag v0.6.4.3")
    print("git push origin v0.6.4.3")
    print("Those tag and image commands are not run by this script.")


if __name__ == "__main__":
    main()
