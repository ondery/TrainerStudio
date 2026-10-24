import type { Annotation, Geometry, Point } from "./types";

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function rectFromDrag(x0: number, y0: number, x1: number, y1: number) {
  const x = Math.min(x0, x1);
  const y = Math.min(y0, y1);
  return { x, y, width: Math.abs(x1 - x0), height: Math.abs(y1 - y0) };
}

export function pointInPoly(x: number, y: number, points: Point[]) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i];
    const b = points[j];
    const intersect = a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y + 0.00001) + a.x;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function near(a: Point, b: Point, distance: number) {
  return Math.hypot(a.x - b.x, a.y - b.y) <= distance;
}

export function poseBox(keypoints: Array<{ x: number; y: number; visibility: number }>) {
  const visible = keypoints.filter((point) => point.visibility > 0);
  if (!visible.length) return undefined;
  const xs = visible.map((point) => point.x);
  const ys = visible.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  return { x: minX - 4, y: minY - 4, width: Math.max(1, maxX - minX + 8), height: Math.max(1, maxY - minY + 8) };
}

export function offsetGeometry(geometry: Geometry, dx: number, dy: number): Geometry {
  if (geometry.type === "bbox") return { ...geometry, x: geometry.x + dx, y: geometry.y + dy };
  if (geometry.type === "polygon") return { ...geometry, points: geometry.points.map((point) => ({ x: point.x + dx, y: point.y + dy })) };
  if (geometry.type === "obb") {
    const corners = geometry.corners.map((point) => ({ x: point.x + dx, y: point.y + dy })) as [Point, Point, Point, Point];
    return { ...geometry, corners };
  }
  if (geometry.type === "pose") {
    return {
      ...geometry,
      keypoints: geometry.keypoints.map((point) => ({ ...point, x: point.x + dx, y: point.y + dy })),
      box: geometry.box ? { ...geometry.box, x: geometry.box.x + dx, y: geometry.box.y + dy } : geometry.box,
    };
  }
  return geometry;
}

export function boundsOf(geometry: Geometry) {
  if (geometry.type === "bbox") return geometry;
  if (geometry.type === "polygon" && geometry.points.length) {
    const xs = geometry.points.map((point) => point.x);
    const ys = geometry.points.map((point) => point.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
  }
  if (geometry.type === "obb") {
    const xs = geometry.corners.map((point) => point.x);
    const ys = geometry.corners.map((point) => point.y);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
  }
  if (geometry.type === "pose" && geometry.box) return geometry.box;
  if (geometry.type === "pose") return poseBox(geometry.keypoints);
  return undefined;
}

export function moveAnnotation(annotation: Annotation, dx: number, dy: number): Annotation {
  return { ...annotation, geometry: offsetGeometry(annotation.geometry, dx, dy), updatedAt: new Date().toISOString() };
}
