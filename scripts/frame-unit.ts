import assert from "node:assert/strict";
import { anchorAbove } from "../web/lib/anchor.ts";
import { contentRatio, lockAspect } from "../web/lib/nav-frame.ts";

const gear = { left: 700, top: 640, right: 728, bottom: 668 };
const placed = anchorAbove(gear, { w: 440, h: 460 }, { w: 1280, h: 720 });
assert.ok(placed.top + placed.maxHeight <= gear.top - 8, `panel covers the trigger: ${JSON.stringify(placed)}`);
assert.ok(placed.top >= 8);
assert.ok(placed.maxHeight >= 96);

const ratio = contentRatio({ w: 640, h: 480 }, { w: 460, h: 248 });
assert.equal(ratio, 640 / 480);
const start = { x: 80, y: 48, w: 460, h: 248 };
const wider = lockAspect(start, { ...start, w: 540 }, "right", ratio);
const before = (start.w - 8) / (start.h - 68);
const after = (wider.w - 8) / (wider.h - 68);
assert.ok(Math.abs(after - ratio) < 0.02, `aspect drifted ${after} vs ${ratio}`);
assert.ok(Math.abs(before - ratio) > 0.2);
assert.equal(wider.x, start.x);

const emptyRatio = contentRatio(null, start);
assert.ok(Math.abs(emptyRatio - (start.w - 8) / (start.h - 68)) < 0.001);
const kept = lockAspect(start, { ...start, h: 320 }, "bottom", emptyRatio);
assert.ok(Math.abs((kept.w - 8) / (kept.h - 68) - emptyRatio) < 0.02);

console.log("frame unit ok");
