import assert from "node:assert/strict";
import { TAB_DRAG_THRESHOLD, tabGesture, tabPastThreshold } from "../web/lib/dock-gesture.ts";
import { dropRect, hitEdge } from "../web/lib/dock-model.ts";
import { allowsDrop, panelsIn, placeNode, refusesSelfDrop, tabsNode, type DockNode } from "../web/lib/grid.ts";

const click = tabGesture([{ type: "down" }, { type: "up" }]);
assert.equal(click.activate, true);
assert.equal(click.overlay, false);
assert.equal(click.drop, false);
assert.equal(click.phase, "idle");

const jitter = tabGesture([{ type: "down" }, { type: "move", dx: 3, dy: 2 }, { type: "up" }]);
assert.equal(tabPastThreshold(3, 2), false);
assert.equal(jitter.activate, true);
assert.equal(jitter.overlay, false);
assert.equal(jitter.drop, false);

const drag = tabGesture([{ type: "down" }, { type: "move", dx: TAB_DRAG_THRESHOLD, dy: 0 }]);
assert.equal(drag.phase, "dragging");
assert.equal(drag.overlay, true);
assert.equal(drag.activate, false);

const dropped = tabGesture([{ type: "down" }, { type: "move", dx: 8, dy: 1 }, { type: "up" }]);
assert.equal(dropped.drop, true);
assert.equal(dropped.activate, false);
assert.equal(dropped.overlay, false);

const escaped = tabGesture([{ type: "down" }, { type: "move", dx: 12, dy: 0 }, { type: "cancel" }]);
assert.equal(escaped.phase, "idle");
assert.equal(escaped.drop, false);
assert.equal(escaped.overlay, false);
assert.equal(escaped.activate, false);

const whole = dropRect({ x: 0, y: 0, w: 200, h: 100 }, "center");
assert.equal(whole.w, 200);
assert.equal(whole.h, 100);
const half = dropRect({ x: 0, y: 0, w: 200, h: 100 }, "left");
assert.equal(half.w, 100);
assert.equal(half.h, 100);

// View drop target: tab strip and inner 40% merge; 30% sides split.
// 300×200 group, 28px title. Content height is 172.
assert.equal(hitEdge(10, 10, 300, 200), "center");
assert.equal(hitEdge(150, 100, 300, 200), "center");
assert.equal(hitEdge(10, 40, 300, 200), "left");
assert.equal(hitEdge(290, 40, 300, 200), "right");
assert.equal(hitEdge(150, 30, 300, 200), "top");
assert.equal(hitEdge(150, 190, 300, 200), "bottom");
assert.equal(hitEdge(75, 100, 300, 200), "left");
assert.equal(hitEdge(225, 100, 300, 200), "right");

const alone = tabsNode(["minimap"]);
assert.equal(refusesSelfDrop(alone, "minimap"), true);
assert.equal(refusesSelfDrop(alone, "layers"), false);
assert.equal(allowsDrop(alone, "minimap", "center", 1), false);
assert.equal(allowsDrop(alone, "minimap", "right", 1), false);
assert.equal(allowsDrop(alone, "minimap", "right", 2), true);
const shared: DockNode = { kind: "tabs", id: "t", tabs: ["layers", "minimap"], active: "layers", collapsed: false };
assert.equal(refusesSelfDrop(shared, "minimap"), false);
assert.equal(allowsDrop(shared, "minimap", "left", 2), true);
const kept = placeNode(tabsNode(["minimap"]), "minimap", "", "right");
assert.equal(kept.kind, "tabs");
assert.deepEqual(panelsIn(kept), ["minimap"]);
const split = placeNode({ kind: "split", id: "s", axis: "y", children: [{ size: 1, node: tabsNode(["minimap"], "a") }, { size: 1, node: tabsNode(["layers"], "b") }] }, "minimap", "0", "left");
assert.equal(split.kind, "split");
if (split.kind !== "split") throw new Error("expected split");
assert.equal(split.axis, "x");
assert.deepEqual(panelsIn(split), ["minimap", "layers"]);

console.log("tab drag unit ok");
