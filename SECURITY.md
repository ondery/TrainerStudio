# Security

Trainer Studio binds to `127.0.0.1` unless `STUDIO_HOST` is set. A Docker image that sets `STUDIO_HOST=0.0.0.0` exposes the port you publish. Do not put that port on a public network unless you add your own authentication. The open core has no accounts.

The page and the API share a session token from `/api/health`. Send it only to that local process. Do not include datasets, license keys, or session tokens in a public issue.

## Reporting

Report vulnerabilities privately through GitHub security advisories:

https://github.com/ondery/TrainerStudio/security/advisories/new

Include the version from `/api/health` and a description of the impact. Please give the maintainers time to ship a fix before writing about the details in public.

There is no bug bounty.
