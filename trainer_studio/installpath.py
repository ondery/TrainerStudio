"""Project folders must live outside the app folder so an upgrade does not delete them."""

from __future__ import annotations

from pathlib import Path


def install_root_for(product: Path) -> Path:
    """Resolved app folder only.

    The launcher and private plugins often sit in the parent checkout, next to
    a Legacy dataset. That parent is not the install root.
    """
    return product.expanduser().resolve()


def install_root() -> Path:
    return install_root_for(Path(__file__).resolve().parents[1])


def inside_install(path: Path) -> bool:
    resolved = path.expanduser().resolve()
    root = install_root()
    try:
        resolved.relative_to(root)
    except ValueError:
        return False
    return True


def default_projects_dir() -> Path:
    return Path.home() / "Documents" / "Trainer Studio Projects"
