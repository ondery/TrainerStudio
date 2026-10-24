# Legacy shortcut parity (0.6.3)

Legacy source: `trainer/web/src/App.tsx`, `trainer/web/src/explorer.tsx`, `trainer/web/src/labelmath.ts` (`CLASS_HOTKEYS`).

`web/check-063.mts` compares this table with `DEFAULT_SHORTCUTS` and reports zero missing combos. C copies the previous image's annotations. Shift+C tracks between the current frame and the next one. Guide lines are Ctrl+; and the crosshair cursor is Ctrl+Shift+;.

| Combo | Legacy behavior | Trainer Studio | Test |
| --- | --- | --- | --- |
| 1–9, q–p | Arm or relabel class in `CLASS_HOTKEYS` order | `class.1`–`class.19` | `check-062.mts` |
| C | Copy the previous image's annotations | `copyPrev` | `check-063.mts` |
| Shift+C | Track / blend toward the next frame | `track` | `check-063.mts` |
| Ctrl+; | Guide lines | `guides` | `check-063.mts` |
| Ctrl+Shift+; | Crosshair cursor | `crossCursor` | `check-063.mts` |
| \ | Skip this image locally and step | `skipTask` | `check-063.mts` |
| Alt+Backspace | Reject a pending box | `reviewReject` | `check-063.mts` |
| Ctrl+Shift+Enter | Accept pending without stepping | `reviewFix` | `check-063.mts` |
| Ctrl+Enter | Accept a proposed box, otherwise save and advance | `confirmNext` | `check-062.mts` |
| Tab / Shift+Tab | Cycle the selection when shapes exist | `cycle` / `cycleBack` | `check-063.mts` |
| A / X | Accept or reject suggested boxes | `acceptGhost` / `rejectGhost` | `check-063.mts` |
| F1 / ? | Shortcut help | `help` | `check-063.mts` |
| Ctrl+0 / Ctrl+1 | Zoom 100% | `zoom100` | `check-063.mts` |
| Ctrl+= / Ctrl++ | Zoom in | `zoomIn` | `check-063.mts` |
| Ctrl+- | Zoom out | `zoomOut` | `check-063.mts` |
| Ctrl+2 | Zoom 200% | `zoom200` | `check-063.mts` |
| Shift+2 | Zoom to the selection | `zoomSelection` | `check-063.mts` |
| Ctrl+Shift+F | Float the layers panel | `floatPanel` | `check-063.mts` |
| Ctrl+Shift+V | Paste the selection onto the next image | `propagate` | `check-063.mts` |
| Shift+Enter | Next unlabeled image | `nextUnlabeled` | `check-063.mts` |
| Ctrl+P / Ctrl+Shift+P | Quick open / command palette | `quickOpen` / `palette` | `check-063.mts` |
| F7 / F8 / Ctrl+Shift+G | Layers, navigator, filmstrip | `layers` / `navigator` / `filmstrip` | `check-063.mts` |
| F2 | Rename the current explorer file | Explorer inline rename | `check-063.mts` reads `explorer.tsx` |
| Enter | Close polygon / confirm SAM | `confirm` | `check-062.mts` |
| Backspace | Drop the last draft point, else delete | canvas, else delete | workspace key handler |
| Escape | Cancel the draft | `drawCommands.cancel` | workspace key handler |
| Delete | Delete selection | `delete` | `check-062.mts` |
| Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y | Undo / redo | `undo` / `redo` | `check-062.mts` |
| Ctrl+A / Ctrl+D / [ / ] | Select all, duplicate, step image | `selectAll` / `duplicate` / brackets | `check-062.mts` |
| Arrows | Nudge a selection, otherwise previous/next image | workspace key handler | workspace |
| V B G O P M H | Select, box, polygon, obb, pose, SAM, pan | `tool.*` | `check-062.mts` |
| F | Fit | `fit` | `check-063.mts` |
| Space / middle mouse | Pan | canvas pan drag | canvas |
| Shift / Ctrl click | Add / toggle selection | shape pointer handlers | canvas |
| Alt+drag | Copy the shape | canvas move with `copy` | cursor and canvas |
| Alt+vertex | Delete polygon vertex when more than 3 points | canvas vertex pointer | canvas |
| Ctrl+B | Collapse the primary side bar | `sidebar` | `check-063.mts` |
| Alt+1–8 | Vehicle attribute on speed classes | `vehicle.1`–`vehicle.8` | shortcuts map |

Ctrl+Shift+E stays the dataset split command. The activity bar opens Explorer without taking that binding.

Explorer “Reveal in folder” posts `/api/fs/reveal`. On Windows the command is `explorer /select,`. Copy path stays a separate menu row.
