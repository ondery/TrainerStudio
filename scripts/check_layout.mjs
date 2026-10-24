import assert from "node:assert/strict";
import { BREAKPOINTS, PANELS, breakpointFor, buildTemplates, loadLayout, normalize, preset, saveLayout, snap, workspaceAreas } from "../web/lib/grid.ts";

assert.equal(snap(13, 8), 16);
assert.equal(snap(8, 8), 8);
assert.equal(snap(0, 8), 0);
assert.equal(breakpointFor(1366), "1366");
assert.equal(breakpointFor(1919), "1366");
assert.equal(breakpointFor(1920), "1920");
assert.equal(breakpointFor(2560), "2560");
assert.equal(breakpointFor(3354), "3354");

const areas = workspaceAreas(2, 2, 2, false);
assert.equal(areas.length, 12);
assert.ok(areas.every((row) => row.split(" ").length === 12));
assert.ok(areas[0].startsWith("left left"));
assert.ok(areas[11].split(" ").every((cell) => cell === "bottom"));
assert.equal(preset("default").showGrid, false);

for (const name of ["default", "labeling", "review", "training"]) {
  const layout = normalize(JSON.parse(JSON.stringify(preset(name))));
  const seen = new Set([
    ...layout.left.tabs,
    ...layout.right.tabs,
    ...layout.bottom.tabs,
    ...layout.floating.map((item) => item.id),
    ...layout.hidden,
  ]);
  assert.equal(seen.size, PANELS.length, name);
  for (const id of PANELS) assert.ok(seen.has(id), id);
  assert.equal(layout.columns, 12);
  assert.equal(layout.rows, 12);
  assert.equal(layout.showGrid, false);
  for (const bp of BREAKPOINTS) {
    const template = layout.templates[bp];
    assert.equal(template.areas.length, template.rows.length, bp);
    assert.ok(template.areas.some((row) => row.includes("workspace")), bp);
    assert.ok(template.areas.some((row) => row.includes("menu")), bp);
    assert.ok(template.areas.every((row) => row.split(" ").length === template.columns.length));
    assert.ok(layout.spans[bp]);
  }
  const fresh = buildTemplates(layout.tracks)["1366"].areas.join("|");
  const wide = buildTemplates(layout.tracks)["3354"].areas.join("|");
  assert.notEqual(fresh, wide);
}

const memory = new Map();
globalThis.window = {
  localStorage: {
    getItem: (key) => memory.get(key) ?? "",
    setItem: (key, value) => memory.set(key, value),
  },
};
saveLayout(preset("review"));
const loaded = loadLayout();
assert.deepEqual(loaded.right.tabs, ["layers", "stats", "history"]);
assert.equal(loaded.hidden.includes("classes"), true);
console.log("layout ok");
