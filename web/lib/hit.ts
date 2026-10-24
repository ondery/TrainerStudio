/** Hit order matches Legacy: handle, then vertex, then body, else empty draw. */

export type HandleId = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "rotate";

export type CursorName =
  | "crosshair"
  | "move"
  | "nwse-resize"
  | "nesw-resize"
  | "ns-resize"
  | "ew-resize"
  | "grab"
  | "grabbing"
  | "pointer"
  | "copy"
  | "not-allowed"
  | "rotate"
  | "default";

export const HANDLE_LAYOUT: { id: HandleId; cursor: CursorName }[] = [
  { id: "nw", cursor: "nwse-resize" },
  { id: "n", cursor: "ns-resize" },
  { id: "ne", cursor: "nesw-resize" },
  { id: "e", cursor: "ew-resize" },
  { id: "se", cursor: "nwse-resize" },
  { id: "s", cursor: "ns-resize" },
  { id: "sw", cursor: "nesw-resize" },
  { id: "w", cursor: "ew-resize" },
];

export type Hit =
  | { kind: "handle"; id: HandleId; cursor: CursorName }
  | { kind: "vertex"; index: number; cursor: "pointer" }
  | { kind: "rotate"; cursor: "rotate" }
  | { kind: "body"; cursor: "move" }
  | { kind: "empty"; cursor: "crosshair" };

export type BoxLike = { x: number; y: number; width: number; height: number };

export function handlePoints(box: BoxLike): { id: HandleId; x: number; y: number; cursor: CursorName }[] {
  const spots: Record<string, { x: number; y: number }> = {
    nw: { x: box.x, y: box.y },
    n: { x: box.x + box.width / 2, y: box.y },
    ne: { x: box.x + box.width, y: box.y },
    e: { x: box.x + box.width, y: box.y + box.height / 2 },
    se: { x: box.x + box.width, y: box.y + box.height },
    s: { x: box.x + box.width / 2, y: box.y + box.height },
    sw: { x: box.x, y: box.y + box.height },
    w: { x: box.x, y: box.y + box.height / 2 },
  };
  return HANDLE_LAYOUT.map((item) => ({ ...item, ...spots[item.id] }));
}

export function hitBox(point: { x: number; y: number }, box: BoxLike, hit: number, selected: boolean): Hit {
  if (selected) {
    for (const handle of handlePoints(box)) {
      if (Math.hypot(point.x - handle.x, point.y - handle.y) <= hit) return { kind: "handle", id: handle.id, cursor: handle.cursor };
    }
    const rotate = { x: box.x + box.width / 2, y: box.y - 18 };
    if (Math.hypot(point.x - rotate.x, point.y - rotate.y) <= hit) return { kind: "rotate", cursor: "rotate" };
  }
  if (point.x >= box.x && point.x <= box.x + box.width && point.y >= box.y && point.y <= box.y + box.height) return { kind: "body", cursor: "move" };
  return { kind: "empty", cursor: "crosshair" };
}

export function selectAction(hit: Hit, input: { space: boolean; button: number; shift: boolean; alt: boolean }): "pan" | "resize" | "rotate" | "move" | "draw" | "vertex" {
  if (input.space || input.button === 1) return "pan";
  if (hit.kind === "handle") return "resize";
  if (hit.kind === "rotate") return "rotate";
  if (hit.kind === "vertex") return input.alt ? "vertex" : "vertex";
  if (hit.kind === "body") return "move";
  return "draw";
}

export function cursorFor(input: {
  tool: string;
  hit: Hit | null;
  space: boolean;
  dragging: boolean;
  crosshairCursor: boolean;
  drawing: boolean;
  nearClose: boolean;
  alt?: boolean;
  locked?: boolean;
}): CursorName {
  if (input.space) return input.dragging ? "grabbing" : "grab";
  if (input.tool === "pan") return input.dragging ? "grabbing" : "grab";
  if (input.locked) return "not-allowed";
  if (input.nearClose) return "pointer";
  if (input.hit?.kind === "rotate") return "rotate";
  if (input.alt && input.hit?.kind === "body") return "copy";
  if (input.hit && input.hit.kind !== "empty" && (input.tool === "select" || input.tool === "bbox" || input.tool === "polygon" || input.tool === "obb")) return input.hit.cursor;
  if (input.crosshairCursor && (input.drawing || input.tool === "select")) return "crosshair";
  if (input.tool === "select") return "crosshair";
  return "default";
}

const EDGES: Record<string, Array<"l" | "r" | "t" | "b">> = {
  nw: ["l", "t"],
  n: ["t"],
  ne: ["r", "t"],
  e: ["r"],
  se: ["r", "b"],
  s: ["b"],
  sw: ["l", "b"],
  w: ["l"],
};

export function resizeBox(origin: BoxLike, handle: HandleId, point: { x: number; y: number }): BoxLike {
  let x0 = origin.x;
  let y0 = origin.y;
  let x1 = origin.x + origin.width;
  let y1 = origin.y + origin.height;
  const flags = EDGES[handle] || [];
  if (flags.includes("l")) x0 = point.x;
  if (flags.includes("r")) x1 = point.x;
  if (flags.includes("t")) y0 = point.y;
  if (flags.includes("b")) y1 = point.y;
  const x = Math.min(x0, x1);
  const y = Math.min(y0, y1);
  return { x, y, width: Math.max(1, Math.abs(x1 - x0)), height: Math.max(1, Math.abs(y1 - y0)) };
}
