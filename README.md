# Trainer Studio — Open-Source YOLO Annotation & Dataset Labeling Tool

[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue.svg)](LICENSE)
[![Python 3.11+](https://img.shields.io/badge/python-3.11%2B-blue.svg)](pyproject.toml)
[![Node.js 22](https://img.shields.io/badge/node-22-green.svg)](web/package.json)

Trainer Studio is a local-first, open-source image annotation tool for people who build YOLO object-detection datasets. You label bounding boxes and polygons in a browser, on a server that runs only on your computer, and the files stay in the Ultralytics YOLO layout (`data.yaml`, `images/`, `labels/`). The workspace is a dockable panel layout in the style of VS Code. The interface ships in 12 languages and defaults to English. The open core is AGPL-3.0. There is no account and no telemetry.

![Trainer Studio workbench in the default dark theme: a synthetic street scene with labeled cars, a person polygon, and a sign, plus the class bar, project explorer, and navigator](docs/screenshots/workbench.png)

## Contents

- [Key facts](#key-facts)
- [Features](#features)
- [Screenshots](#screenshots)
- [Quick start](#quick-start)
- [Keyboard shortcuts](#keyboard-shortcuts)
- [Languages](#languages)
- [Architecture](#architecture)
- [Project layout](#project-layout)
- [Comparison](#comparison)
- [FAQ](#faq)
- [Open core and Enterprise](#open-core-and-enterprise)
- [How to cite](#how-to-cite)
- [Contributing](#contributing)
- [License](#license)

## Key facts

- **What it is:** an offline YOLO labeling tool and image annotation tool for object-detection datasets
- **License:** GNU Affero General Public License v3.0 (AGPL-3.0). See [LICENSE](LICENSE)
- **Platforms:** Windows, macOS, and Linux
- **Stack:** Next.js static UI, FastAPI, SQLite
- **Formats:** YOLO detect, segment, oriented boxes (OBB), and pose (`data.yaml` plus label text). Export can also write COCO JSON and Pascal VOC XML
- **Tools:** bounding boxes, polygons, vertex handles, guide lines, class hotkeys, save and next
- **Languages:** 12. A fresh install uses English until you choose another language
- **Offline:** yes. Labeling does not need a network, an account, or a GPU
- **Data:** images and labels stay in a folder you choose. The app database stays in the local data directory

## Features

### Labeling

- Bounding boxes and polygons, plus oriented boxes and pose when the dataset uses those YOLO tasks
- Selection handles for moving, resizing, and editing vertices. Guide lines and an optional crosshair follow the pointer
- Class hotkeys (`1`–`9`, then `Q`–`P`) and a class bar. Next class changes only the class used for the next shape
- Ctrl+Enter saves the image and opens the next one. It does not replace a shape's class on its own
- Suggestions from auto-label or SAM keep the class that was proposed. Accept or reject them without a silent class change
- Optional point prompts when the SAM packages are installed. Labeling still works if they are not

### Workspace

- VS Code-style dockable panels. A tab click activates the tab. Dragging starts only after the pointer moves, and the drop target is one soft highlight
- Project explorer for the dataset tree, an image list, and the class table
- Navigator (minimap) with the current view, and a filmstrip
- Raw data panel: the label file in a Monaco editor, plus JSON, `data.yaml`, and image facts
- Command palette (Ctrl+K) and quick open (Ctrl+P)

### Data

- Open a folder that already has `data.yaml`, `images/`, and `labels/`
- Class ids and their order come from `data.yaml` and are not renumbered on open
- Class names, colors, and hotkeys are edited in the class manager. Removing or merging classes asks for confirmation
- Import is the YOLO text you already have. Export writes a copy as YOLO, COCO, or Pascal VOC and does not overwrite the source dataset
- A small public-domain sample lives in [`samples/street`](samples/street/LICENSE.md)

### Training

Local training and auto-label are part of the open core. They stay idle until you install the optional packages in `requirements-ai.txt`.

- Ultralytics can train and auto-label with the YOLO11, YOLOv8, and YOLO26 model names listed in the app, or with weights you supply. Ultralytics is AGPL-3.0
- An optional RT-DETR backend uses Hugging Face Transformers (Apache-2.0) and does not import Ultralytics. Predictions whose names are not in `data.yaml` are skipped
- One local job runs at a time. A multi-job GPU queue is not part of the open core
- CPU is enough for labeling. A GPU is optional and is used only when the installed PyTorch build can see CUDA

## Screenshots

The pictures below use the default dark theme and the CC0 sample in `samples/street`. They are not photographs of a private dataset.

| | |
| --- | --- |
| ![Dark workbench with an image, several boxes, a polygon, the class bar, the explorer, and the navigator](docs/screenshots/workbench.png) | Main workbench. Class bar along the bottom, explorer on the left, navigator over the canvas. |
| ![A selected polygon with vertex handles and guide lines on the canvas](docs/screenshots/selection.png) | Selection handles and guide lines. |
| ![Class manager with the new-class dialog open](docs/screenshots/classes.png) | Class manager and the new-class dialog. |
| ![Settings window on a local install](docs/screenshots/settings.png) | Settings. Language, guides, and the locked commercial section. |
| ![A panel tab being dragged, with one soft dock highlight](docs/screenshots/dock.png) | Docking. One highlight follows the pointer. No drop grid. |
| ![Monaco editor showing the YOLO label text for the current image](docs/screenshots/raw-data.png) | Raw data panel. |
| ![Project explorer listing the sample images, labels, and data.yaml](docs/screenshots/explorer.png) | Project explorer and the dataset tree. |
| ![Keyboard shortcut list](docs/screenshots/shortcuts.png) | Keyboard shortcuts. |

## Quick start

You need Python 3.11 or newer. The app listens on `http://127.0.0.1:43150` and opens a browser window. Set `STUDIO_PORT` if that port is already in use, and `STUDIO_DATA_DIR` to choose the folder for the app database.

A sample dataset you can open is included at `samples/street`.

### Windows

From this folder:

```bat
py -3 -m venv .venv
.venv\Scripts\python -m pip install -r requirements.txt
.venv\Scripts\python -m trainer_studio
```

`start-trainer-studio.bat` creates the virtual environment if needed, runs the same install check, and starts the app.

### macOS and Linux

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python -m trainer_studio
```

### Optional AI packages

SAM, auto-label, and local training need extra packages. If you already have a CUDA build of PyTorch, install that first so pip does not replace it.

```bash
python -m pip install -r requirements-ai.txt
```

## Keyboard shortcuts

On macOS, the Ctrl shortcuts below that are chords (Ctrl+Enter, Ctrl+K, and the rest of the `mod` bindings) use Command instead of Ctrl. Letter tools such as `V` and `B` stay the same. The list matches the bindings in the open core.

| Shortcut | Action |
| --- | --- |
| `1`–`9`, `Q`–`P` | Choose a class |
| `V` `B` `G` `O` `P` `M` `H` | Select, box, polygon, oriented box, pose, SAM, pan |
| `C` | Copy annotations from the previous image |
| Shift+`C` | Track toward the next frame |
| Ctrl+Enter | Save and open the next image |
| Shift+Enter | Next unlabeled image |
| Enter | Confirm a polygon or a SAM prompt |
| Backspace | Remove the last draft point, or delete |
| Escape | Cancel the draft |
| Delete | Delete the selection |
| Tab / Shift+Tab | Cycle the selection |
| `A` / `X` | Accept or reject a suggestion |
| Alt+Backspace | Reject a pending box |
| Ctrl+Shift+Enter | Accept a pending box without stepping |
| Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y | Undo / redo |
| Ctrl+A / Ctrl+D | Select all / duplicate |
| `[` / `]` | Previous / next image |
| Arrow keys | Nudge the selection, or change image when nothing is selected |
| `F` | Fit the image |
| Ctrl+`0` or Ctrl+`1` | Zoom to 100% |
| Ctrl+`=` / Ctrl+`-` | Zoom in / out |
| Ctrl+`2` | Zoom to 200% |
| Shift+`2` | Zoom to the selection |
| Space, or the middle mouse button | Pan |
| Shift+click / Ctrl+click | Add to the selection / toggle a shape |
| Alt+drag | Copy the shape |
| Alt+click a vertex | Delete that vertex when the polygon has more than three |
| Ctrl+`;` | Guide lines |
| Ctrl+Shift+`;` | Crosshair cursor |
| `\` | Skip this image |
| F1 | Shortcut help |
| F2 | Rename the file selected in the explorer |
| F7 / F8 / Ctrl+Shift+G | Layers, navigator, filmstrip |
| Ctrl+Shift+F | Float the layers panel |
| Ctrl+Shift+V | Paste the selection onto the next image |
| Ctrl+B | Collapse the side bar |
| Ctrl+K | Command palette |
| Ctrl+P | Quick open |
| Ctrl+E | Export |
| Ctrl+`,` | Settings |
| Ctrl+`/` | This shortcut list |
| Ctrl+H | History |
| Ctrl+Q | Quality check |
| Alt+`1`–Alt+`8` | Vehicle attributes on speed classes |

## Languages

English, Turkish, German, Spanish, French, Italian, Brazilian Portuguese, Russian, Arabic, Japanese, Korean, and Simplified Chinese.

Codes: `en`, `tr`, `de`, `es`, `fr`, `it`, `pt-BR`, `ru`, `ar`, `ja`, `ko`, `zh-CN`.

A new browser profile with no saved language opens in English. A language you already chose stays in effect. Arabic uses a right-to-left layout.

## Architecture

The interface is a Next.js app built as a static export and served by FastAPI from the `static/` directory. API routes are registered first, then the files. Project state, classes, and annotations are stored in a SQLite database in the data directory (`STUDIO_DATA_DIR`, or `STUDIO_DATA`, or `data/` beside the app).

The process binds to `127.0.0.1` unless `STUDIO_HOST` is set. There is no account and no telemetry.

Local file routes require a session token. `GET /api/health` returns that token, and the page sends it back as the `X-Studio-Session` header on dialog, local-file, and filesystem routes. A page on another origin cannot read the token. A path outside the data directory is allowed only with a one-time grant issued by the folder dialog for that exact path. Anything else returns HTTP 403. The generic file writer will not write into an opened dataset's `labels/` tree or its `data.yaml`. Annotation saves go through the project API, which reads class indexes from `data.yaml` at write time and does not store a client-supplied class number.

## Project layout

```
trainer_studio/     FastAPI app, YOLO import and export, SQLite
web/                Next.js interface (source)
static/             Built interface served by the API
samples/street/     CC0 synthetic dataset used in the screenshots
docs/screenshots/   Interface pictures
docs/FAQ.md         Questions and answers
tests/              Pytest suite for the open core
```

A dataset folder looks like this:

```
your-dataset/
  data.yaml
  images/
  labels/
```

`names` in `data.yaml` is the class list. Index 0 is the first name. Opening the folder does not reorder those names and does not rewrite label files.

The app database is not stored inside the dataset. It lives in the data directory.

## Comparison

Figures below describe the public open core of Trainer Studio and the usual public offering of each other tool. Hosted products change, so the commercial column is only a pointer, not a review.

| | Trainer Studio | LabelImg | CVAT | Label Studio | Roboflow Annotate |
| --- | --- | --- | --- | --- | --- |
| License of the tool you run | AGPL-3.0 | MIT | MIT | Apache-2.0 for the open-source server | Commercial hosted product |
| Where it runs | Local Python process and a browser on the same machine | Desktop application | Self-hosted server, or CVAT's hosted service | Self-hosted server, or a cloud account | Cloud |
| Account required to label | No | No | No on a server you run yourself | No on a server you run yourself | Yes |
| Offline labeling | Yes, after the Python packages are installed | Yes | Yes on a private server you already installed | Yes on a private server you already installed | The hosted annotator needs a network connection |
| Bounding boxes | Yes | Yes | Yes | Yes | Yes |
| Polygons | Yes | The project draws rectangles | Yes | Yes | Yes |
| YOLO files | Detect, segment, OBB, and pose text, plus `data.yaml` | Detection text, and also Pascal VOC and CreateML | YOLO is one of the export formats | YOLO is one of the documented export formats, with COCO and VOC | YOLO export from the hosted project |
| Extra setup | A virtual environment and `pip install` | A Python/Qt install | A server install, often with Docker | A server install, or a cloud signup | An account on the hosted platform |

## FAQ

### Is Trainer Studio free?

The open core in this repository is free to run under AGPL-3.0. If you offer the software as a network service, the AGPL requires you to offer the corresponding source to users of that service. A separate commercial add-on is not in this repository. This page does not list prices. Contact the author for that add-on.

### Does it work offline?

Yes. After installation, labeling, saving, and YOLO export do not call an external service. There is no sign-in. Optional model downloads for SAM or training are the part that needs a network, and only when you choose to fetch weights.

### Which formats can it read and write?

It opens Ultralytics YOLO datasets: `data.yaml` with detect, segment, oriented-box, or pose label text. Export writes a new folder as YOLO, COCO JSON, or Pascal VOC XML. The source dataset is left as it is.

### How do I export to YOLO?

Save while you label. Each save writes the current image's `.txt` file under `labels/` using the class indexes in `data.yaml`. To make a separate copy, use Export (Ctrl+E) and choose the YOLO format and a destination folder. That copy can group images by train, val, and test. It does not modify the folder you have open.

### How is it different from LabelImg?

LabelImg is a desktop bounding-box annotator with YOLO detection text. Trainer Studio is a local browser workspace for boxes and polygons, with dockable panels, a class manager, 12 languages, and YOLO detect, segment, OBB, and pose. Both can run offline on one computer. Trainer Studio is AGPL-3.0. LabelImg is MIT.

### Does it need a GPU?

No. Drawing, saving, and export use the CPU. SAM and training can use a GPU when your PyTorch install sees CUDA, and they also run on CPU. A queue of GPU jobs is part of the commercial add-on, not the open core.

### Which operating systems are supported?

Windows, macOS, and Linux, with Python 3.11 or newer. The interface is tested as a static site served by the local API. Node.js 22 is needed only if you rebuild the web interface from `web/`.

### Can a team use it?

The open core is a single-user app on one machine. Roles, single sign-on, review assignment, and a shared job queue are available in the commercial add-on. Contact the author. They are not included here and they stay locked.

### Where is my data stored?

Images and label files stay in the dataset folder you opened. The SQLite database, thumbnails, and logs stay in the data directory on the same computer. Nothing in the open core uploads that folder.

### What if the page cannot open a folder?

The API must be the one that served the page, because the page has to send the session header. Start Trainer Studio and use the browser tab it opened. A path outside the data directory has to be chosen in the folder dialog so the app can grant that path. Writes into another location return HTTP 403.

More answers are in [docs/FAQ.md](docs/FAQ.md).

## Open core and Enterprise

This repository is the open core: labeling, classes, YOLO import and export, the dockable workspace, plugins, and optional local SAM and training.

The following are available in the commercial add-on. Contact the author. They are not shipped here, and the interface keeps them locked:

- Accounts, roles, and single sign-on
- An audit log and review assignment
- Postgres or S3 storage
- A GPU job queue, active learning, and analytics
- Priority support
- Video frame import and remote video
- Installing marketplace plugins, extra folders, and pop-out windows

No prices are listed in this repository.

## How to cite

Metadata for software citation is in [CITATION.cff](CITATION.cff).

BibTeX:

```bibtex
@software{trainerstudio,
  title = {Trainer Studio},
  author = {{ondery}},
  version = {0.6.4.3},
  year = {2026},
  url = {https://github.com/ondery/TrainerStudio},
  license = {AGPL-3.0}
}
```

Plain text:

> ondery. (2026). Trainer Studio (0.6.4.3) [Computer software]. https://github.com/ondery/TrainerStudio

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md). Please do not attach private datasets, license keys, or customer data.

Security reports go through [GitHub security advisories](https://github.com/ondery/TrainerStudio/security/advisories/new), not a public issue. See [SECURITY.md](SECURITY.md).

## License

The open core is licensed under the GNU Affero General Public License v3.0. See [LICENSE](LICENSE) and [LICENSING.md](LICENSING.md).

The drawings in `samples/street` are original works dedicated to the public domain under CC0 1.0. See [samples/street/LICENSE.md](samples/street/LICENSE.md).
