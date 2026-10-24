# Changelog

## 0.6.4.3

Status: early development. This public tree is a pre-1.0 preview, not a stable 1.0 release. Expect bugs and breaking changes. A later workbench revision (shared command registry, keybinding when-clauses, one overlay stack, layout audit) is not in this preview. There is no installable PWA, no macOS or Linux installer, and no tagged 1.0 release.

First public preview of the Trainer Studio open core.

- Label YOLO detect, segment, oriented boxes, and pose in a browser on your own computer
- Bounding boxes, polygons, selection handles, guide lines, class hotkeys, and Ctrl+Enter to save and open the next image
- Dockable panels. A tab click activates the tab. A drag starts only after the pointer moves, and the drop mark is one soft highlight
- Project explorer, navigator, class manager, and a Monaco raw-data panel
- English is the default language when none has been saved. Twelve languages remain available
- YOLO, COCO, and Pascal VOC export. Class indexes stay the order in `data.yaml`
- Optional local SAM, auto-label, and training are partial. They need extra packages and weights. A GPU is not required to label
- The documentation sample is seven CC0 street photographs. Outlines are polygons: rectangles, plus a sign and a bicycle. See `samples/street/LICENSE.md`
- Commercial team features and video import stay locked. They are not included in this repository

## Earlier builds

Versions before 0.6.4.3 were private development builds. They are not separate public releases. The notes above describe the tree published as the open core.
