import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { migrateAppearance, DEFAULT_APPEARANCE } from "./lib/appearance.ts";
import { renderedStroke } from "./lib/canvas-style.ts";
import { cursorFor, hitBox, resizeBox } from "./lib/hit.ts";
import { insertPanel, pixelSize } from "./lib/dock-model.ts";
import { displayTitle, nextClassId } from "./lib/titles.ts";
import { liveLine, linkLabelLines } from "./lib/raw-view.ts";
import { DEFAULT_SHORTCUTS } from "./lib/shortcuts.ts";

for (const scale of [0.25, 1, 8]) {
  assert.equal(renderedStroke(1.5, scale, false), 1.5);
  assert.equal(renderedStroke(1.5, scale, true), 1.5 * scale);
}

const box = { x: 10, y: 10, width: 40, height: 20 };
assert.equal(hitBox({ x: 10, y: 10 }, box, 8, true).kind, "handle");
assert.equal(hitBox({ x: 30, y: 20 }, box, 8, true).kind, "body");
assert.equal(hitBox({ x: 0, y: 0 }, box, 8, false).kind, "empty");
const resized = resizeBox(box, "e", { x: 80, y: 10 });
assert.equal(resized.width, 70);

assert.equal(cursorFor({ tool: "select", hit: { kind: "handle", id: "n", cursor: "ns-resize" }, space: false, dragging: false, crosshairCursor: true, drawing: true, nearClose: false }), "ns-resize");
assert.equal(cursorFor({ tool: "select", hit: { kind: "empty", cursor: "crosshair" }, space: false, dragging: false, crosshairCursor: true, drawing: true, nearClose: false }), "crosshair");
assert.equal(cursorFor({ tool: "pan", hit: null, space: false, dragging: true, crosshairCursor: true, drawing: false, nearClose: false }), "grabbing");

const both = migrateAppearance({});
assert.equal(both.guideLines, true);
assert.equal(both.crosshairCursor, true);
assert.equal(migrateAppearance({ crossMode: "off" }).guideLines, false);
assert.equal(migrateAppearance({ crossMode: "off" }).crosshairCursor, false);
assert.equal(migrateAppearance({ crossMode: "cursor" }).guideLines, false);
assert.equal(migrateAppearance({ crossMode: "cursor" }).crosshairCursor, true);
assert.equal(migrateAppearance({ crossMode: "full" }).guideLines, true);
assert.equal(migrateAppearance({ crossMode: "full" }).crosshairCursor, true);
assert.equal(migrateAppearance({ guideLines: false, crosshairCursor: true, crossMode: "off" }).guideLines, false);
assert.equal(DEFAULT_APPEARANCE.snapPanels, false);
assert.equal(DEFAULT_APPEARANCE.snapDock, false);
assert.equal(DEFAULT_APPEARANCE.rawEdit, false);
assert.equal(liveLine(0, { type: "bbox", x: 40, y: 30, width: 80, height: 60 }, 640, 480), "0 0.125000 0.125000 0.125000 0.125000");
assert.deepEqual(linkLabelLines([{ n: 1, text: "a" }, { n: 2, text: "  " }, { n: 3, text: "b" }], [{ id: "a" }, { id: "b" }]), { 1: "a", 3: "b" });

assert.equal(displayTitle({ id: "speed_60", title: "Hız sınırı", titleEn: "Speed Limit" }, "tr"), "Hız sınırı 60 km/h");
assert.equal(displayTitle({ id: "end_speed_80", title: "Hız sonu", titleEn: "End of limit" }, "en"), "End of 80 km/h limit");
assert.equal(nextClassId(["a", "b"], "b"), null);
assert.equal(nextClassId(["a", "b"], "a"), "b");

const columns = insertPanel([], "layers", 0, 0, "center");
const stacked = insertPanel(columns, "stats", 0, 0, "bottom");
assert.equal(stacked[0].bands.length, 2);
const beside = insertPanel(columns, "stats", 0, 0, "right");
assert.equal(beside.length, 2);
assert.equal(pixelSize(13, false, 8), 13);
assert.equal(pixelSize(13, true, 8), 16);

const legacy = readFileSync(new URL("../../trainer/web/src/labelmath.ts", import.meta.url), "utf8");
const hotkeys = legacy.match(/CLASS_HOTKEYS = \[([^\]]+)\]/);
assert.ok(hotkeys);
const keys = [...hotkeys[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]);
keys.forEach((key, index) => {
  const action = `class.${index + 1}`;
  if (action in DEFAULT_SHORTCUTS) assert.equal(DEFAULT_SHORTCUTS[action], key);
});
assert.equal(DEFAULT_SHORTCUTS.confirmNext, "mod+enter");
assert.equal(DEFAULT_SHORTCUTS.selectAll, "mod+a");
assert.equal(DEFAULT_SHORTCUTS.duplicate, "mod+d");
assert.equal(DEFAULT_SHORTCUTS.bracketPrev, "[");
assert.equal(DEFAULT_SHORTCUTS.bracketNext, "]");
assert.equal(DEFAULT_SHORTCUTS.confirm, "enter");
assert.equal(DEFAULT_SHORTCUTS.delete, "delete");
assert.equal(DEFAULT_SHORTCUTS.undo, "mod+z");
assert.equal(DEFAULT_SHORTCUTS["tool.polygon"], "g");
assert.equal(DEFAULT_SHORTCUTS["tool.select"], "v");

console.log("check-062 ok");
