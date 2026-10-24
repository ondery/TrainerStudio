# Security

Trainer Studio binds to `127.0.0.1` unless `STUDIO_HOST` is set. The Docker image sets `STUDIO_HOST=0.0.0.0` so the published port is reachable. Do not expose that port to a public network without your own authentication. The core has no accounts.

License keys are verified offline. Do not send private keys or customer datasets in an issue.

## Reporting

Please report vulnerabilities privately to the maintainer until a public security address is listed here. Include the version from `/api/health` and a description of the impact. Give the maintainers time to ship a fix before writing about the details in public.

There is no bug bounty yet.
