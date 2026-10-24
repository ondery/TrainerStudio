# Contributing

Issues and pull requests are welcome on the public repository once it exists. This tree is the publishable product. Do not add private device integrations, license private keys, or datasets.

## Developer setup

```bash
python -m pip install -r requirements-dev.txt
python -m pytest -q
python -m ruff check trainer_studio ee tests scripts
cd web && npm ci && npm run typecheck && npm run i18n && npm run build
python scripts/check_public_tree.py
```

## Contributor License Agreement

The same text is in [docs/CLA.md](docs/CLA.md).

Trainer Studio is dual-licensed. The core is AGPL-3.0. The `ee/` package is source-available under `ee/LICENSE`.

By submitting a contribution you agree that:

1. You wrote the contribution or you have the right to submit it.
2. You license the contribution to the project under the AGPL-3.0 for the core, and you grant the maintainers a perpetual license to use the same contribution in `ee/` under `ee/LICENSE`.
3. You are not committing someone else's private keys, customer data, or non-public device tooling.

A pull request is the record of this agreement. If you cannot agree, please open an issue instead of a pull request.

## Code

Class indexes are resolved from `data.yaml` at write time. Do not persist a client-supplied class number. Opening a dataset must not rewrite label files. Keep Ultralytics and Transformers imports inside the functions that need them.
