# Legacy parity

Trainer Studio Legacy lives in `trainer/`. This table is the Phase 4 audit. The new app is the labeling studio in `trainer-studio/`. Three Legacy details stay out on purpose: the decorative blue status line, hollow-circle icons, and the filmstrip in the default layout. Video, marketplace install, pop-out windows, multi-folder workspaces, the link tool, remote video, and dataset file cut/paste are working Enterprise features in 0.6.3 (`docs/feature-matrix.md`). Without a license they return HTTP 402. Drawing notes for 0.6.2: polygon edges stay dashed until the shape closes; the first vertex turns `#2dd4bf` when the pointer is within `CANVAS.hit / scale`; selection uses eight square handles plus an OBB rotation handle; guide lines are dashed with a dark underlay and can be on together with the crosshair cursor.

| Legacy feature | New location | Status |
| --- | --- | --- |
| File → new project | File → New project | Present |
| File → open folder | File → Open dataset | Present. Path field with native Browse folder and Browse file, a recent-projects list, and drag-and-drop of a folder or file onto the window. |
| File → recent workspaces | File → Recent projects | Present. Eight paths by default. Settings → Advanced changes the length. |
| File → close | File → Close project | Present |
| File → export | File → Export (YOLO, COCO, VOC) | Present. Import of COCO or Pascal VOC does not rewrite data.yaml. |
| File → preferences | File → Settings | Present |
| File → workspace create / save as / add folder / remove folder | File → Project wizard, Enterprise → extra folder | Present. Core creates one dataset. Extra folders are Enterprise and do not rewrite data.yaml. |
| Edit → undo | Edit → Undo, History panel | Present |
| Edit → redo, copy, paste, delete | Edit menu and canvas context menu | Present. Legacy's menu model only listed undo; the rest was on the canvas. |
| View → command palette | Edit → Command palette | Present |
| View → panels (explorer, layers, classes, properties, history, info, health, bottom) | View → Panels and Window → Panels | Present as Images, Annotations, Classes, Properties, Attributes, History, Quality, Filmstrip, Filters, Model, Minimap, Console |
| View → dark / light / comfortable / compact | View menu and Settings → Appearance | Present |
| View → ribbon / classic / extra color themes / system theme | View menu and Settings → Appearance | Present. Ribbon or classic chrome, plus dark, light, and system theme. No extra theme packs. |
| View → guides | View → Crosshair and Show layout grid | Present. The layout guide stays off until that command. Dragging a panel does not cover the window. |
| Image → zoom | Image menu, tool rail zoom, status zoom | Present |
| Image → previous / next / fit | Image menu and options bar | Present |
| Label → select, box, polygon, pose, OBB, SAM | Annotation menu and left tool rail | Present |
| Label → class editor | Classes menu, Classes panel, Add class | Present |
| Label → link tool | Tool rail, after the Enterprise gate | Present. Two clicks store the relation and draw a line. |
| Data screen | Dataset menu (split, snapshot, quality, stats) | Present for the operations this server implements. |
| Train screen | AI/Model → Model jobs, Model panel, Settings → Training | Present. Jobs dialog runs train and auto-label. |
| Detect screen | AI/Model → Smart select, Jobs | Present for SAM and auto-label. |
| Detect → video / camera | Enterprise menu | Present. Frames are extracted from a GIF or WebP. A missing camera returns video.nocamera. |
| Plugins → marketplace | Settings → Plugins and Enterprise menu | Present. Install copies a plugin folder. The id mobile-preview is refused. Enable and disable of local plugins stays Core. |
| Window presets (label, review, train, data, code, expert) | Window → Default, Labeling, Review, Training | Present for the four labeling layouts. Data and code presets are not separate screens. |
| Window → float, collapse, close, redock, resize | Panel title bar | Present. Floating windows stay inside the app. |
| Window → pop out to an OS window | Enterprise menu | Present. Opens `/?popout=` for one panel. Floating panels inside the app stay Core. |
| Help → shortcuts, preferences, about | Help menu, Settings | Present |
| Docking with saved layout | `trainer-studio.layout` | Present. See `docs/layout-grid.md`. |
| Preferences search, reset section, import, export | Settings window | Present |
| Language, including Arabic RTL | Settings → Language | Present. Dock start/end follows direction. |
| Crosshair | Canvas and Settings → Canvas | Present. Guide lines and the crosshair cursor are independent and both on by default. |
| Status: index, filter, zoom, cursor, selection, class, save, AI, build | Status bar | Present. No decorative blue line. |
| Class catalog and attribute schema | Classes, Attributes, schema dialog | Present. SignLens is an optional template, not the default. |
| Class id equals data.yaml order | Open and class edit | Present. Add appends. Rename, merge, delete, and reorder stay explicit. |
| Explorer and filmstrip | Images panel and Filmstrip panel | Present |
| Image and class context menus | Right-click those rows | Present. Canvas context menu still assigns a class and edits the selection. |
| Undo history | History panel and History dialog | Present |
| Quality / dataset health | Quality panel and Quality dialog | Present |
| Export YOLO, COCO, VOC, split, snapshot | File and Dataset menus, Export dialog | Present |
| SAM points, class popup, install | Annotation → Smart select, options bar | Present. Points clear on commit, tool change, and image change. |
| Legacy labeling.json import | Settings → Classes and schema, Dataset → Import Legacy schema | Present. Read-only source. |
| Keyboard shortcut editor | Tools → Shortcuts and Settings → Shortcuts | Present. Rebind with conflict marking. |
| Autosave | Status “Saving” / “Saved” | Present |
| Projects wizard and simple mode | File → Project wizard | Present. Name, folder, then template. The existing New project dialog stays. |
| Remote video import and device-only export flows | Enterprise menu | Present. HTTP(S) download with an 8 MB cap, then frame extract. |
| File explorer cut and paste of dataset files | Enterprise menu | Present. Copy, verify bytes, then remove the source. data.yaml is not a source and is not rewritten. |
| Multi-document image tabs | Tab strip above the canvas | Present. Up to eight open images. |

The new shell also has a 12-column grid, draggable settings, neutral class templates (empty, generic objects, COCO-80), and a cursor readout. Those were not in Legacy.
