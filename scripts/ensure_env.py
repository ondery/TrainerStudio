"""Launcher helper. Pip runs only when requirements change."""

from trainer_studio.envsetup import main

if __name__ == "__main__":
    raise SystemExit(main())
