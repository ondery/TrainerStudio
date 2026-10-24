# Changelog

## 0.6.4.3

- A click on a panel tab activates that tab. The docking highlight starts only after the pointer moves 5px with the button held. A smaller move is still a click, and no drop overlay appears on pointer down. Escape, a cancelled pointer, and leaving the window drop the gesture without moving the panel. The landing mark is one soft rectangle, not a grid of drop tiles.
- Ctrl+Enter no longer replaces a shape's class with the highlighted picker row. The class changes only after a click, Enter on a row, or that class's hotkey during this picker session. Otherwise the picker closes and the shape keeps its class. A shape with no class does not advance: the toast says “Sınıfsız şekil var” and the picker is focused. Auto-label and SAM proposals are accepted with their proposed class. Next class only changes the active class for the next shape. A hotkey does not apply while the filter or a select is focused, and the wheel does not change a class.
- Dev-live mode runs a `studio-live` checkout with a reloading API and a Next dev server on one browser address. `STUDIO_DATA_DIR` selects the existing data folder. `tools/live-pull.ps1` fast-forwards `origin/studio-live` every 30 seconds and reinstalls dependencies only when requirements or the package lock change.
- The canvas gear opens above its button, with a gap, so the button stays visible and can close it. Escape, a click outside, and the close button dismiss it and return focus to the gear. A click inside a nested menu, slider, or portal does not. Panel menus and dialogs follow the same dismiss rules.
- The navigator is one panel. Docking moves the frame with its contents, and a saved layout that still has an empty frame drops that frame on startup. The preview keeps the image aspect ratio at any size. Lock aspect (on by default) keeps that ratio while the window is resized. The panel menu and the Window menu can return the navigator to its default place. Window → Reset layout restores the workspace.
- The class name on a shape is black by default. The color is a setting. The chip behind the name stays the class color.

## 0.6.4.2

- A class style edit writes one Legacy override: the edited class, and only the fields that changed. `labeling.json` with `"classes": []` stays a fallback to the built-in catalog. The other classes are not written, and `classIcons` is not filled for them. The timestamped backup and byte-identical undo stay.

## 0.6.4.1

- Image ids are unique per project. Opening a second dataset that reuses the same file names no longer fails with `UNIQUE constraint failed: images.id`. An existing `studio.db` is copied to `data/backups` before that migration, and the stored ids stay the file stems.
- Class style edits still update `labeling.json` for Legacy, but only the fields Legacy reads. Unknown keys, key order, and the file's indent stay. Each write is atomic and keeps a timestamped backup. Undo restores that file. The class table lists the files a style edit will update.
- The class table is a virtualized data table. Headers stay visible. Color, icon, and hotkey edit in popovers. Row actions sit in a compact menu; only Remove is red, and only inside that menu. Enter commits an inline edit, Escape restores it, and a changed row shows a mark.
- Dock drop zones, including “drop a panel here”, appear only while a panel is being dragged. Dragging a dock title does not select text in the table.
- Open-zoom uses short labels (Fit / Fill / 100% / Keep) with the long phrase as a tooltip. The guide pattern label is “Kılavuz çizgisi biçimi”.
- The canvas pill sizes to the save button and its Ctrl+Enter badge. Zoom out, the percent, zoom in, and fit stay in that same pill.

## 0.6.4

- Quick settings and the Settings dialog group view, guide, and save-border options. Segmented controls show a check and a filled selection. Sliders show the value. Search and reset stay on both surfaces.
- Guide lines default to the Legacy dash (4px on, 4px off) in `#2dd4bf` at 0.95 opacity, with a 0.5px black shadow. Pattern, dash, gap, color, thickness, and opacity are settings. The line still moves with `translate3d`.
- The save outline is a thin marching border, 1.5 screen pixels by default, and it does not grow with zoom. Thickness and color are settings.
- Zoom, fit, brightness, contrast, fullscreen, and “Kaydet ve devam et” sit in a pill inside the canvas.
- Ctrl+Enter saves and advances while the class picker is open, after auto-label, and while a field is focused. It stays quiet in Monaco edit mode. An open picker commits the highlighted class first.
- Navigator is a floating dock panel: drag it, resize the edges and corners, dock it, and keep the viewport rectangle, jump, zoom, fit, and shape overlay.
- Drop targets are five zones on a group plus dock and screen edges, with a preview of the split. A group that holds only the dragged panel can split itself. The panel menu can split right, split down, or move the panel.
- The class panel is an editable table: id, name, title, color, icon, hotkey, group, attributes, and annotation count. Ekle opens the new-class dialog. Title, color, icon, and hotkey write in place. Delete hides the class. Removing, reordering, or merging shows the files and boxes, requires confirmation, backs up `labels/` and `data.yaml`, remaps, verifies, and can be undone.
- Explorer keeps the 0.6.3.1 folder and file icons.

## 0.6.3.1

- Explorer rows use the Legacy folder, folder-open, and file glyphs (image, label text, YAML, JSON, model, run, export), tinted with the Legacy palette.

## 0.6.3

- Docking is a nested tree. A panel or a group, including a floating group, accepts top, bottom, left, right, and center drops. The tree is saved, and a 0.6.2 column layout migrates into it.
- Every Enterprise row in the feature matrix does real work behind the license gate. Without a key the response is HTTP 402. Core labeling does not require a key.
- Explorer “Reveal in folder” opens the OS file explorer. On Windows the command is `explorer /select,`.
- The remaining Legacy shortcuts are bound, including `\`, Alt+Backspace, Ctrl+Shift+Enter, Tab, Shift+Tab, and Explorer F2. C copies the previous annotation. Shift+C tracks the next frame. The parity check reports zero missing combos.
- Rotate, copy, not-allowed, and grab cursors follow the pointer.
- Ribbon, the system theme, the project wizard, and image tabs are present. The 0.6.2.1 install-root and copy-confirm rules stay.

## 0.6.2.1

- The install root is the Trainer Studio folder itself, resolved to its real path. The parent that holds `start-trainer-studio.bat` or `private-plugins` is not the install root, so a Legacy dataset beside the app is not treated as trapped.
- A project is offered for relocation only when this app created it (`created_by_app`) and that folder is still inside the install folder. Opening a dataset does not set the flag. Startup never moves a project.
- Relocation copies the folder, checks every file including `data.yaml` and `labels/` against the source, then removes the source only after the copy matches. The dialog shows the exact source and target and waits for an explicit confirm. A folder with `data.yaml` or `labels` that this app did not create is refused.

## 0.6.2

- Duplicate plugin folders and names ending in `.old` or `.bak` are skipped. The highest version of an id is the one that loads.
- A missing page session is `local.session` (still HTTP 403), distinct from an out-of-scope path.
- New projects default outside the install folder. Creating one inside the install folder is blocked, and startup can move a project that is already trapped there. Class ids in data.yaml are not rewritten.
- Panels move and resize by the pixel. Snap to the design grid is off unless Settings → Layout turns it on. The activity bar switches the side bar, including Explorer. The filmstrip stays closed until Window opens it.
- The class bar, next class, canvas zoom strip, and quick settings sit on the canvas. Speed titles include the limit, such as Hız sınırı 60 km/h.
- Select can draw a box on empty canvas. Handles, polygon ink, guide lines, and the crosshair cursor follow the Legacy canvas tokens, and guide lines and the cursor can both be on.
- Class lists virtualize instead of mounting every class on every annotation row. Dock columns stay inside the viewport. Releasing a floating panel on itself keeps its pixel position.
- Window and the activity bar open a Raw data panel for the current image: the label file as stored, annotation JSON, and image info. It is virtualized, read-only, and never writes `labels/` or `data.yaml`. A local scratch box stays off unless Advanced settings turns it on. Ctrl+A selects every shape, Ctrl+D duplicates the selection, and `[` / `]` change the image.

## 0.6.1

- Menus list every labeling action with a shortcut hint: open YOLO or a Legacy schema, save, revert, export variants, selection, image navigation, shape conversion, and class lock or hide. COCO and Pascal VOC are not rewritten into data.yaml.
- Settings in every category persist and take effect: theme, canvas, annotation, navigation, classes, SAM, training, export, performance, layout tracks, and advanced limits. The first run uses Turkish when no locale is stored.
- Image, class, annotation, minimap, quality, and history panels show search, filters, counts, lock, hide, and numeric geometry. The options bar shows zoom, fit, brightness, contrast, and save state.
- The whole window is a named CSS grid. Dock zones are tracks. Floating panels snap to the same units. An optional layout guide is off until View shows it. Dragging a panel does not cover the window with a grid overlay.
- Local read and write accept only a fresh dialog grant or a path inside the app data folder, and they refuse dataset labels and data.yaml. Those routes require the session token from health. Plugin routes use one operation id per method.
- While a shape is saving or a mask is running, a comet traces its outline and clears as soon as the result is ready. A failure flashes red and shows a toast. The comet color is in Settings, Canvas.

## 0.6.0

- The workspace is a menu bar plus docked panels. Every panel can sit on the start side, the end side, or the bottom, share a tab, resize, collapse, float, and dock again. Layouts are Default, Labeling, Review, and Training, and they are saved for this browser.
- A 12 by 12 grid snaps floating windows and dock sizes to an 8px module. The grid can show while a panel is dragged.
- Drawing tools follow the pointer with a crosshair and an optional magnifier. The status bar shows the image index, filter, zoom, cursor, selection, class, save state, AI status, and build id.
- Settings is a categorized window: appearance, language, canvas, shortcuts with conflict detection, classes, training defaults, export, plugins, license, and layout. Settings can be imported and exported as JSON.
- A new project starts with no classes. Generic objects and COCO-80 are optional templates. SignLens stays optional. Opening a dataset does not change data.yaml class ids. Adding a class appends it.
- Every folder or file path has Browse folder and Browse file beside an editable field. Tauri uses the dialog plugin. The browser window asks the local server, which opens a pywebview dialog or a tkinter dialog. Recent projects and a window drop target accept a folder or file when the system shares its path.

## 0.5.1

- The release zip follows `.gitignore` and `.dockerignore`. `data/studio.db`, `.ruff_cache/`, and `src-tauri/gen/` stay out of the archive.
- Opening a dataset walks each folder once per pass and keeps relative paths as strings. The extra walk between read and save is gone.

## 0.5.0

- Quality reports overlapping, duplicate, tiny, and out-of-bounds boxes, class distribution, missing labels, and a consistency summary. The review queue accepts or rejects proposals without rewriting rejected labels.
- Export writes YOLO detect, segment, OBB, and pose, plus COCO and Pascal VOC. Train / val / test is stratified in the project index. Dataset snapshots copy labels out and leave the source unchanged.
- The release workflow builds a Windows MSI and NSIS installer. The window icon is the existing logo.
- Keyboard shortcuts are customizable. Undo history lists edits and saved versions. Trainer Studio Legacy `labeling.json` imports schema and attributes and does not rewrite the file.
- Opening a dataset stats files by size and mtime, reads labels together, and inserts rows in one transaction.
- `STUDIO_DATASET` pointing at a missing folder reports `dataset.missing`. SAM without its package returns 424. Auto-label keeps the missing-package code. A failed pywebview install is retried on the next start.

## 0.4.0

- SAM family prompts (Mobile SAM, SAM, SAM 2) on CPU or CUDA, with removable points and a class popup that can be turned off.
- Auto-label proposals stay in review until accepted. Class ids remain the data.yaml index of the class name.
- Training jobs record logs and metrics, can be cancelled, and offer best.pt. Missing AI packages show an install action.
- Settings imports a Trainer Studio Legacy labeling.json schema without rewriting the file.
- The Windows launcher installs requirements only when their hash changes and still starts offline. Optional pywebview opens a window and falls back to the browser.
- The last dataset reopens on start. `STUDIO_DATASET` wins when it is set. Large opens show progress and skip a second full read when the folder is unchanged.
- API and console text is English with a stable code. The interface translates the code.

## 0.3.0

- Quality scan, review marks, and a Tauri shell that opens the local server.
- Twelve interface languages, including Arabic right-to-left. Canvas coordinates stay left-to-right.
- Plugin host. Public export and release archives omit private plugins.

## 0.2.0

- Optional SAM point prompts, YOLO auto-label, and local training jobs.
- Model list for YOLO11, YOLOv8, YOLO26, and an Apache-2.0 RT-DETR backend.
- Enterprise license gate. Locked features stay off without a key.

## 0.1.0

- Read-only YOLO import. `data.yaml` names are the only class ids.
- Bounding box, polygon, oriented box, and pose labeling.
- Schema editor, virtualized image list, filters, undo, and YOLO export.
