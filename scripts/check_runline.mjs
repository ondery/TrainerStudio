import assert from "node:assert/strict";
import { closedLength, hostBox, pointAt, pointHull, ringOf } from "../web/lib/run-path.ts";

const box = ringOf({ type: "bbox", x: 10, y: 20, width: 100, height: 40 });
assert.equal(box.length, 4);
assert.equal(closedLength(box), 280);
assert.deepEqual(pointAt(box, 0), { x: 10, y: 20 });
assert.deepEqual(pointAt(box, 100), { x: 110, y: 20 });
assert.deepEqual(pointAt(box, 120), { x: 110, y: 40 });
assert.deepEqual(pointAt(box, 280), { x: 10, y: 20 });
assert.deepEqual(pointAt(box, -20), { x: 10, y: 40 });

const obb = ringOf({
  type: "obb",
  corners: [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 12, y: 8 },
    { x: 2, y: 8 },
  ],
});
assert.equal(obb.length, 4);
const edge = Math.hypot(2, 8);
assert.ok(Math.abs(closedLength(obb) - (20 + edge * 2)) < 0.001);

const poly = ringOf({
  type: "polygon",
  points: [
    { x: 0, y: 0 },
    { x: 30, y: 0 },
    { x: 0, y: 40 },
  ],
});
assert.equal(poly.length, 3);
assert.ok(closedLength(poly) > 30);

const screen = hostBox(
  [
    { x: 10, y: 20 },
    { x: 110, y: 20 },
    { x: 110, y: 60 },
    { x: 10, y: 60 },
  ],
  { x: 5, y: 7, scale: 2 },
  { width: 200, height: 100 },
  0,
  4,
);
assert.deepEqual(screen, { x: 21, y: 43, width: 208, height: 88 });

const turned = hostBox([{ x: 110, y: 50 }], { x: 0, y: 0, scale: 1 }, { width: 200, height: 100 }, 90, 0);
assert.equal(turned?.x, 100);
assert.equal(turned?.y, 60);

const hull = pointHull([{ x: 5, y: 5 }]);
assert.equal(hull.length, 4);
assert.ok(closedLength(hull) > 0);

const pose = ringOf({
  type: "pose",
  keypoints: [{ x: 4, y: 6, visibility: 2 }],
  box: { x: 1, y: 2, width: 8, height: 9 },
});
assert.equal(closedLength(pose), 34);

console.log("runline ok");
