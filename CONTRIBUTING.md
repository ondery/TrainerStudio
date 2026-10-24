# Contributing

Issues and pull requests are welcome on https://github.com/ondery/TrainerStudio. This repository is the open core. Do not add license private keys, customer data, or a private dataset.

Please report security issues through GitHub security advisories. See [SECURITY.md](SECURITY.md).

## Developer setup

Python 3.11 or newer, and Node.js 22 if you change the interface.

```bash
python -m pip install -r requirements-dev.txt
python -m pytest -q
python -m ruff check trainer_studio tests scripts
cd web && npm ci && npm run typecheck && npm run i18n && npm run build
python scripts/check_public_tree.py
```

`ruff` uses the settings in `pyproject.toml` (E, F, I; line length 110).

## Contributor License Agreement

The same text is in [docs/CLA.md](docs/CLA.md).

By submitting a contribution you agree that:

1. You wrote the contribution or you have the right to submit it.
2. You license the contribution under AGPL-3.0. You also grant the maintainers a perpetual license to use the same contribution in the commercial add-on.
3. You are not committing someone else's private keys, customer data, or non-public device tooling.

A pull request is the record of this agreement. If you cannot agree, please open an issue instead of a pull request.

## Code

Class indexes are resolved from `data.yaml` at write time. Do not persist a client-supplied class number. Opening a dataset must not rewrite label files. Keep Ultralytics and Transformers imports inside the functions that need them.
