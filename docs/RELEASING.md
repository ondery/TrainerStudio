# Releasing

The changelog keeps the 0.1.0 notes. The version in this tree is 0.6.4.3. Do not tag or push an image until you mean to publish. The release zip follows `.gitignore` and `.dockerignore`.

From the product folder:

```bash
python3 scripts/release_check.py /tmp/trainer-studio-public
docker build -f Dockerfile -t trainer-studio:cpu .
docker build -f Dockerfile.cuda -t trainer-studio:cuda .
```

`release_check.py` writes a public tree and fails if private plugins or the license key generator are inside it. It does not tag, push, or talk to a registry.

These commands publish. They are not part of the check:

```bash
git tag v0.6.4.3
git push origin v0.6.4.3
```

A `v*` tag runs `.github/workflows/release.yml`:

- tests, the public-tree check, and a zip of the app plus checksums
- a CPU image pushed to `ghcr.io/<owner>/trainer-studio` (the workflow file does this; do not push it by hand)
- a `windows-latest` job that builds the MSI and NSIS installers and attaches them to the GitHub release

The Windows installers are not built on a Linux machine. The workflow is the build.
