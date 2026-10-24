# Trainer Studio

Trainer Studio labels images on your computer and writes YOLO datasets. The open core runs in the browser and talks to a local Python server. No account and no telemetry.

The core is licensed under the GNU Affero General Public License v3.0. See [LICENSE](LICENSE).

## Open core

- Single-user labeling, undo, classes, and filters
- YOLO detect, segment, oriented boxes, and pose import and export
- Local SAM, auto-label, and training when the optional AI packages are installed
- An optional RT-DETR backend (Apache-2.0)
- Plugins
- The interface is localized in English, Turkish, German, Spanish, French, Italian, Brazilian Portuguese, Russian, Arabic, Japanese, Korean, and Simplified Chinese

## Enterprise

An optional commercial add-on provides multi-user roles, single sign-on, an audit log, review assignment, remote storage, a GPU job queue, active learning, and analytics. That add-on is not in this repository. Contact the project owner to license it. Without it, those items stay locked. Labeling, saving, and export do not need it.

## Windows

From this folder:

```bat
py -3 -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
.venv\Scripts\python -m trainer_studio
```

`start-trainer-studio.bat` does the same setup and start. The app opens in your browser at http://127.0.0.1:43150 .

## macOS and Linux

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python -m trainer_studio
```

The same address opens in your browser.

Optional SAM and training packages are listed in `requirements-ai.txt`.
