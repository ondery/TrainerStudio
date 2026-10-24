# Feature matrix (0.6.3)

Core features ship with the AGPL app. Enterprise rows do real work after `ee.gate` allows the feature. Without a license they return HTTP 402. They are not placeholders.

| Legacy feature | Trainer Studio | Tier | Status |
| --- | --- | --- | --- |
| Class chip bar and next class | Bottom class bar arms the next class; a new shape uses it | Core | Present |
| New class dialog | Name, title, color, icon, hotkey, attributes, parent; appends to data.yaml | Core | Present |
| Explorer tree | Whole project tree with Legacy folder and file colors | Core | Present |
| Reveal in folder | Explorer context menu opens the OS file explorer | Core | Present |
| Select tool draws on empty canvas | Canvas select + box drag | Core | Present |
| Eight handles and OBB rotate handle | Canvas handles | Core | Present |
| Dashed polygon until close, green close point | Canvas preview | Core | Present |
| Guide lines and crosshair together | DOM overlay, translate3d, one animation frame, no Konva redraw per move | Core | Present |
| Zoom-invariant stroke | `strokeScaleEnabled` false / `renderedStroke` | Core | Present |
| Bottom zoom, fit, brightness, quick settings | Canvas chrome, keep/fit/fill/100, wheel and step | Core | Present |
| Save and continue | Bottom-right button with a Ctrl+Enter badge | Core | Present |
| Raw data panel | Monaco editor, offline, read-only, YOLO/JSON/YAML, line linking | Core | Present |
| Navigator | Top-right of the canvas: view rectangle, slider, percent, zoom buttons | Core | Present |
| Class popup | Closes on an outside click and Esc | Core | Present |
| Settings popover | Anchored to the gear button | Core | Present |
| Activity badges | Counts only for error and update notifications | Core | Present |
| Filmstrip | Window menu panel, hidden in every preset | Core | Optional |
| SAM on this computer | SAM tool | Core | Present |
| Local training and export | Train / export dialogs | Core | Present |
| QC basics | QC dialog | Core | Present |
| Settings and shortcuts | Settings window | Core | Present |
| Blue status line | — | — | Removed |
| Hollow-circle class icons | Lucide icons | — | Removed |
| Default filmstrip | Hidden until Window opens it | — | Removed |
| Video / camera | Enterprise menu extracts frames and probes the camera | Enterprise | Present |
| Plugin marketplace install | Enterprise menu copies a plugin folder and refreshes the host | Enterprise | Present |
| Pop-out OS window | Enterprise menu opens `/?popout=` | Enterprise | Present |
| Multi-folder workspace | Enterprise menu indexes an extra root without rewriting data.yaml | Enterprise | Present |
| Link tool | Tool rail, gated | Enterprise | Present |
| RBAC, SSO, audit, review assignment | Enterprise menu and `ee/features.py` | Enterprise | Present |
| Postgres / S3 / GPU queue / active learning | Enterprise menu | Enterprise | Present |
| File, edit, view, image, label, data, train, detect, help menus | Menu bar | Core | Present |
| Ribbon and system theme | View menu and Settings → Appearance | Core | Present |
| Project wizard | File → Project wizard | Core | Present |
| Multi-document image tabs | Tab strip above the canvas, up to eight images | Core | Present |
| Nested Photoshop dock | A drop becomes a tab or a vertical or horizontal split | Core | Present |
| Saved layout and pixel resize | Dock | Core | Present |
| Language and Arabic RTL | Settings | Core | Present |
| Class ids follow data.yaml | Open and class edit | Core | Present |
| Legacy labeling.json import | Dataset menu | Core | Present |
| Shortcut editor | Settings | Core | Present |
| Autosave | Status bar | Core | Present |
| Welcome screen | File → New / Open | Core | Present |
| Raw label file, annotation JSON, image info | Raw data panel | Core | Present |
| Editing the label file from the raw panel | Advanced flag, off; the panel does not write | Core | Present |
| Select all, duplicate, bracket image step | Ctrl+A, Ctrl+D, `[` and `]` | Core | Present |
| Legacy shortcut parity, including C | `docs/legacy-shortcuts.md` | Core | Present |
| Remote video import | Enterprise menu downloads and extracts frames | Enterprise | Present |
| Dataset file cut and paste | Enterprise menu copies, verifies, then removes the source | Enterprise | Present |

No row is partial. Removed on purpose: blue status line, hollow-circle icons, default filmstrip. Enterprise rows stay closed until a license allows them.
