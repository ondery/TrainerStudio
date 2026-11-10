# Layout grid

Trainer Studio is laid out on a CSS grid. The shell and the workspace dock are separate. Shell templates are stored with the layout under `trainer-studio.layout`. The spacing base is 8px.

## Shell

The live shell areas are `menu`, `palette`, `workspace`, and `status`. There is no `toolbar` grid area. The menu cell holds the menu bar, the optional ribbon, and the lock line. `palette` is the activity bar. `workspace` is the dock. `status` is the status bar.

Resizing the window selects one of four breakpoints: 1366, 1920, 2560, and 3354. Widths below 1920 stay on 1366.

| Width | Columns | What changes |
| --- | --- | --- |
| 1366 and 1920 | palette, then the rest | Menu, workspace, and status span the two columns. |
| 2560 | three columns | The workspace spans two columns. The palette track is 8px wider. |
| 3354 | four columns | The workspace spans three columns. The status track grows by 8px. |

`tracks.menu` and `tracks.toolbar` are stored. `buildTemplates` does not read them. Settings hides the toolbar field.

## Workspace

The dock inside `workspace` is a pixel grid, not the 12 by 12 track model:

```
"left canvas right"
"bottom bottom bottom"
```

`left`, `right`, and `bottom` sizes come from the saved band size in pixels, clamped to the viewport. `layout.spans` is stored per breakpoint and is not read by the dock.

`workspaceAreas(left, right, bottom, rtl)` still builds a 12 by 12 description. With `rtl` true, `right` is on the start side. The live dock does not call it. Arabic sets `dir=rtl` on the document, and CSS grid flips the first column to the start edge.

Named presets are Default, Labeling, Review, and Training. Save writes the current definition. Reset restores Default.

## Forms

Settings, property editors, class rows, and dialog bodies use the shared 12-column grid (`Grid` and `GridItem`). A label takes 4 columns and its control takes 8. The gap is 8px.

## Layout guide

View → Show layout grid draws a dashed outline on each shell area and a 12 by 12 guide on the dock. It is off by default. The control is `showGrid` in `trainer-studio.appearance`.

## Audit

`scripts/check_layout.mjs` checks breakpoints, presets, and the RTL `workspaceAreas` helper. `scripts/layout-audit.spec.mjs` opens the running app at 1280, 1366, 1920, 2560, and 3354 for English, Turkish, German, Japanese, and Arabic. It fails on horizontal overflow, a wrong breakpoint, a toolbar area, or a missing shell area. Arabic must set `dir=rtl`.
