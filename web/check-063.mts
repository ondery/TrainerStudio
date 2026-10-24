import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cursorFor, hitBox } from "./lib/hit.ts";
import { blendBox } from "./lib/track.ts";
import { linkPair } from "./lib/link.ts";
import { DEFAULT_SHORTCUTS, matchAction, type ShortcutAction } from "./lib/shortcuts.ts";
import { depthOf, movePanel, normalize, panelsIn, placeNode, preset, tabsNode, type FloatWin } from "./lib/grid.ts";
import { drawClassId } from "./lib/draw-class.ts";
import { openFrame } from "./lib/zoom-frame.ts";
import { guideFrame, guidePaint } from "./lib/guides.ts";
import { anchorAbove } from "./lib/anchor.ts";
import { treeGlyph } from "./lib/tree-glyph.ts";
import { pickerClass, shouldConfirmNext } from "./lib/save-next-rules.ts";
import { runStrokeWidth } from "./lib/run-width.ts";
import { hitEdge } from "./lib/dock-model.ts";

const legacy: Record<string, ShortcutAction> = {
  "1": "class.1",
  "2": "class.2",
  "3": "class.3",
  "4": "class.4",
  "5": "class.5",
  "6": "class.6",
  "7": "class.7",
  "8": "class.8",
  "9": "class.9",
  q: "class.10",
  w: "class.11",
  e: "class.12",
  r: "class.13",
  t: "class.14",
  y: "class.15",
  u: "class.16",
  i: "class.17",
  o: "class.18",
  p: "class.19",
  c: "copyPrev",
  "shift+c": "track",
  "\\": "skipTask",
  "alt+backspace": "reviewReject",
  "mod+shift+enter": "reviewFix",
  tab: "cycle",
  "shift+tab": "cycleBack",
  a: "acceptGhost",
  x: "rejectGhost",
  f1: "help",
  "mod+0": "zoom100",
  "mod+=": "zoomIn",
  "mod+-": "zoomOut",
  "mod+2": "zoom200",
  "shift+2": "zoomSelection",
  "mod+shift+f": "floatPanel",
  "mod+shift+v": "propagate",
  "shift+enter": "nextUnlabeled",
  "mod+p": "quickOpen",
  f7: "layers",
  f8: "navigator",
  "mod+shift+g": "filmstrip",
  "mod+enter": "confirmNext",
  enter: "confirm",
  delete: "delete",
  "mod+z": "undo",
  "mod+shift+z": "redo",
  "mod+a": "selectAll",
  "mod+d": "duplicate",
  "[": "bracketPrev",
  "]": "bracketNext",
  f: "fit",
  v: "tool.select",
  b: "tool.bbox",
  g: "tool.polygon",
  p: "tool.pose",
  o: "tool.obb",
  m: "tool.sam",
  h: "tool.pan",
  "mod+b": "sidebar",
};

const missing = Object.entries(legacy).filter(([combo, action]) => DEFAULT_SHORTCUTS[action] !== combo);
assert.equal(missing.length, 0, JSON.stringify(missing));
assert.notEqual(DEFAULT_SHORTCUTS.guides, "c");
assert.equal(DEFAULT_SHORTCUTS.copyPrev, "c");
assert.equal(DEFAULT_SHORTCUTS.track, "shift+c");
assert.equal(DEFAULT_SHORTCUTS.guides, "mod+;");
assert.equal(DEFAULT_SHORTCUTS.crossCursor, "mod+shift+;");

function press(key: string, extra: Partial<KeyboardEvent> = {}) {
  return matchAction({ key, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, ...extra } as KeyboardEvent);
}

assert.equal(press("c"), "copyPrev");
assert.equal(press("C", { shiftKey: true }), "track");
assert.equal(press("\\"), "skipTask");
assert.equal(press("Backspace", { altKey: true }), "reviewReject");
assert.equal(press("Enter", { ctrlKey: true, shiftKey: true }), "reviewFix");
assert.equal(press("Tab"), "cycle");
assert.equal(press("Tab", { shiftKey: true }), "cycleBack");
assert.equal(press("?"), "help");
assert.equal(press("=", { ctrlKey: true }), "zoomIn");
assert.equal(press("+", { ctrlKey: true, shiftKey: true }), "zoomIn");
assert.equal(press("1", { ctrlKey: true }), "zoom100");
assert.equal(press("p", { ctrlKey: true, shiftKey: true }), "palette");
assert.equal(press("F2"), null);

const app = readFileSync(new URL("../../trainer/web/src/App.tsx", import.meta.url), "utf8");
const explorerLegacy = readFileSync(new URL("../../trainer/web/src/explorer.tsx", import.meta.url), "utf8");
const explorer = readFileSync(new URL("./components/studio/explorer.tsx", import.meta.url), "utf8");
assert.match(app, /copyPrevious/);
assert.match(app, /blendKeyframes/);
assert.match(app, /\\\\/);
assert.match(explorerLegacy, /F2/);
assert.match(explorer, /F2/);
assert.match(explorer, /\/api\/fs\/reveal/);
assert.match(explorer, /\/rename/);

const box = { x: 0, y: 0, width: 40, height: 20 };
assert.equal(hitBox({ x: 20, y: -18 }, box, 8, true).cursor, "rotate");
assert.equal(cursorFor({ tool: "select", hit: { kind: "rotate", cursor: "rotate" }, space: false, dragging: false, crosshairCursor: true, drawing: false, nearClose: false }), "rotate");
assert.equal(cursorFor({ tool: "select", hit: { kind: "body", cursor: "move" }, space: false, dragging: false, crosshairCursor: true, drawing: false, nearClose: false, alt: true }), "copy");
assert.equal(cursorFor({ tool: "select", hit: { kind: "body", cursor: "move" }, space: false, dragging: false, crosshairCursor: true, drawing: false, nearClose: false, locked: true }), "not-allowed");
assert.equal(cursorFor({ tool: "select", hit: null, space: true, dragging: false, crosshairCursor: true, drawing: false, nearClose: false }), "grab");
assert.equal(cursorFor({ tool: "pan", hit: null, space: false, dragging: true, crosshairCursor: false, drawing: false, nearClose: false }), "grabbing");

const blended = blendBox({ x: 0, y: 0, width: 10, height: 10 }, { x: 10, y: 20, width: 30, height: 50 });
assert.equal(blended.x, 5);
assert.equal(blended.y, 10);
assert.equal(blended.width, 20);
assert.equal(blended.height, 30);
assert.deepEqual(linkPair("a", "b"), { from: "a", to: "b" });
assert.throws(() => linkPair("a", "a"));

let node = tabsNode(["layers"]);
node = placeNode(node, "stats", "", "right");
node = placeNode(node, "history", "1", "bottom");
assert.ok(depthOf(node) >= 3);
const nested = normalize(JSON.parse(JSON.stringify({ ...preset("default"), left: { ...preset("default").left, root: node, columns: [] } })));
assert.equal(nested.left.root && nested.left.root.kind, "split");
assert.ok(depthOf(nested.left.root) >= 3);

const migrated = normalize(JSON.parse(JSON.stringify({ ...preset("default"), left: { ...preset("default").left, root: null } })));
assert.ok(migrated.left.root);
assert.ok(panelsIn(migrated.left.root).includes("explorer"));

const win: FloatWin = {
  id: "float-layers",
  x: 8,
  y: 8,
  w: 320,
  h: 240,
  col: 1,
  row: 1,
  colSpan: 1,
  rowSpan: 1,
  columns: [],
  root: tabsNode(["layers"]),
};
const layout = { ...preset("review"), floating: [win] };
const kept = movePanel(layout, "layers", { zone: "float", floatId: win.id, path: "", edge: "center" });
assert.equal(kept.floating.length, 1);
assert.deepEqual(panelsIn(kept.floating[0].root), ["layers"]);
const beside = movePanel(kept, "stats", { zone: "float", floatId: win.id, path: "", edge: "right" });
assert.equal(beside.floating.length, 1);
assert.ok(panelsIn(beside.floating[0].root).includes("stats"));
assert.ok(panelsIn(beside.floating[0].root).includes("layers"));
assert.equal(beside.floating[0].root && beside.floating[0].root.kind, "split");
const tabbed = movePanel(kept, "stats", { zone: "float", floatId: win.id, path: "", edge: "center" });
assert.equal(tabbed.floating[0].root && tabbed.floating[0].root.kind, "tabs");
assert.ok(panelsIn(tabbed.floating[0].root).includes("stats"));
const stacked = placeNode(tabsNode(["layers"]), "stats", "", "bottom");
assert.equal(stacked.kind, "split");
const sided = placeNode(tabsNode(["layers"]), "stats", "", "right");
assert.equal(sided.kind, "split");

assert.equal(drawClassId("car", ["person", "car"], true), "car");
assert.equal(drawClassId("car", ["person", "car"], false), "car");
assert.equal(drawClassId(null, ["person", "car"], true), "person");
assert.equal(drawClassId("missing", ["person", "car"], true), "person");

const keptZoom = openFrame("keep", { w: 800, h: 600 }, { w: 200, h: 100 }, { scale: 2, panX: 10, panY: -4 });
assert.equal(keptZoom.scale, 2);
assert.equal(keptZoom.x, (800 - 400) / 2 + 10);
assert.equal(keptZoom.y, (600 - 200) / 2 - 4);
const fitted = openFrame("fit", { w: 800, h: 600 }, { w: 200, h: 100 }, null);
assert.ok(Math.abs(fitted.scale - Math.min(800 / 200, 600 / 100) * 0.94) < 1e-9);
const filled = openFrame("fill", { w: 800, h: 600 }, { w: 200, h: 100 }, null);
assert.equal(filled.scale, Math.max(800 / 200, 600 / 100));
const actual = openFrame("100", { w: 800, h: 600 }, { w: 200, h: 100 }, null);
assert.equal(actual.scale, 1);

const placed = guideFrame({ x: 12, y: 34, show: true, stamp: 100, now: 108.4 });
assert.equal(placed.horizontal, "translate3d(0px, 34px, 0px)");
assert.equal(placed.vertical, "translate3d(12px, 0px, 0px)");
assert.equal(placed.lag, 8);
const hiddenGuide = guideFrame({ x: 1, y: 2, show: false, stamp: 0, now: 5 });
assert.match(hiddenGuide.horizontal, /-10000/);

assert.equal(treeGlyph("folder", true), "folder-open");
assert.equal(treeGlyph("folder", false), "folder");
assert.equal(treeGlyph("images", true), "images");
assert.equal(treeGlyph("file-code", false), "file-code");
assert.equal(treeGlyph("flask-conical", true), "flask-conical");
assert.equal(treeGlyph(undefined, true), "folder-open");

const flipped = anchorAbove({ left: 1000, top: 40, right: 1028, bottom: 68 }, { w: 256, h: 320 }, { w: 1440, h: 900 });
assert.equal(flipped.top, 74);
const above = anchorAbove({ left: 400, top: 700, right: 428, bottom: 728 }, { w: 256, h: 320 }, { w: 1440, h: 900 });
assert.equal(above.top, 700 - 320 - 6);
assert.equal(above.left, 428 - 256);

const dashed = guidePaint({ axis: "h", pattern: "dashed", color: "#2dd4bf", opacity: 0.95, thickness: 1, dash: 4, gap: 4, shadow: true });
assert.equal(dashed.background, "repeating-linear-gradient(90deg, rgba(45, 212, 191, 0.95) 0 4px, transparent 4px 8px)");
assert.equal(dashed.boxShadow, "0 0 0 0.5px rgba(0, 0, 0, 0.35)");
assert.equal(dashed.height, "1px");
assert.equal(dashed.opacity, 1);
const solid = guidePaint({ axis: "v", pattern: "solid", color: "#2dd4bf", opacity: 1, thickness: 2, dash: 4, gap: 4, shadow: false });
assert.equal(solid.boxShadow, "none");
assert.equal(solid.background, "rgba(45, 212, 191, 1)");
assert.equal(solid.width, "2px");

assert.equal(runStrokeWidth(1.5, 2), 0.75);
assert.equal(runStrokeWidth(1.5, 0.5), 3);
assert.equal(runStrokeWidth(0, 2), 0.75);

assert.equal(shouldConfirmNext({ combo: "mod+enter", monacoEdit: false }), true);
assert.equal(shouldConfirmNext({ combo: "mod+enter", monacoEdit: true }), false);
assert.equal(shouldConfirmNext({ combo: "enter", monacoEdit: false }), false);
assert.equal(shouldConfirmNext({ combo: "mod+shift+enter", monacoEdit: false }), false);
assert.equal(pickerClass([{ classId: "speed_5", selected: false }, { classId: "speed_60", selected: true }]), "speed_60");
assert.equal(pickerClass([{ classId: "speed_5", selected: false }, { classId: "speed_60", selected: false }]), "speed_5");
assert.equal(pickerClass([]), null);

const selfRight = placeNode(tabsNode(["classes"]), "classes", "", "right");
assert.equal(selfRight.kind, "split");
if (selfRight.kind === "split") assert.equal(selfRight.axis, "x");
assert.deepEqual(panelsIn(selfRight), ["classes"]);
const selfDown = placeNode(tabsNode(["classes"]), "classes", "", "bottom");
assert.equal(selfDown.kind, "split");
if (selfDown.kind === "split") assert.equal(selfDown.axis, "y");
assert.deepEqual(panelsIn(selfDown), ["classes"]);
const keptSplit = normalize(JSON.parse(JSON.stringify({
  ...preset("default"),
  left: { ...preset("default").left, root: selfRight, columns: [] },
})));
assert.equal(keptSplit.left.root && keptSplit.left.root.kind, "split");
assert.deepEqual(panelsIn(keptSplit.left.root), ["classes"]);
const alone = normalize(JSON.parse(JSON.stringify({
  ...preset("default"),
  left: { ...preset("default").left, root: tabsNode(["explorer"]), columns: [] },
  right: { ...preset("default").right, root: null, columns: [] },
  bottom: { ...preset("default").bottom, root: null, columns: [] },
  floating: [],
})));
const splitSelf = normalize(movePanel(alone, "explorer", { zone: "left", path: "", edge: "right" }));
assert.equal(splitSelf.left.root && splitSelf.left.root.kind, "split");
assert.deepEqual(panelsIn(splitSelf.left.root), ["explorer"]);

assert.equal(hitEdge(10, 150, 400, 300), "left");
assert.equal(hitEdge(390, 150, 400, 300), "right");
assert.equal(hitEdge(200, 10, 400, 300), "top");
assert.equal(hitEdge(200, 290, 400, 300), "bottom");
assert.equal(hitEdge(200, 150, 400, 300), "center");

console.log("check-063 ok", missing.length);
