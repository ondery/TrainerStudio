import type { Geometry, Point } from "./types";

export function ringOf(geometry: Geometry): Point[] {
  if (geometry.type === "bbox" && geometry.width > 0 && geometry.height > 0) {
    return boxRing(geometry.x, geometry.y, geometry.width, geometry.height);
  }
  if (geometry.type === "polygon" && geometry.points.length >= 3) return geometry.points;
  if (geometry.type === "obb" && geometry.corners.length >= 3) return geometry.corners;
  if (geometry.type === "pose") {
    const box = geometry.box || poseRing(geometry.keypoints);
    if (!box || box.width <= 0 || box.height <= 0) return [];
    return boxRing(box.x, box.y, box.width, box.height);
  }
  return [];
}

function poseRing(keypoints: Array<{ x: number; y: number; visibility: number }>) {
  const visible = keypoints.filter((point) => point.visibility > 0);
  if (!visible.length) return undefined;
  const xs = visible.map((point) => point.x);
  const ys = visible.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return {
    x: minX - 4,
    y: minY - 4,
    width: Math.max(1, Math.max(...xs) - minX + 8),
    height: Math.max(1, Math.max(...ys) - minY + 8),
  };
}

export function boxRing(x: number, y: number, width: number, height: number): Point[] {
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + height },
    { x, y: y + height },
  ];
}

/** A closed outline around points before a mask exists, so the comet has a perimeter. */
export function pointHull(points: Point[]): Point[] {
  const clean = points.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  if (!clean.length) return [];
  const xs = clean.map((point) => point.x);
  const ys = clean.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  const pad = clean.length < 3 ? 18 : 8;
  return boxRing(minX - pad, minY - pad, Math.max(12, maxX - minX) + pad * 2, Math.max(12, maxY - minY) + pad * 2);
}

export type ViewPose = { x: number; y: number; scale: number };

/** Screen-space box around a ring, matching the canvas pan / zoom / rotate. */
export function hostBox(
  ring: Point[],
  view: ViewPose,
  image: { width: number; height: number },
  angle = 0,
  pad = 0,
): { x: number; y: number; width: number; height: number } | null {
  if (!ring.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const scale = view.scale;
  const rad = (angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const cx = image.width / 2;
  const cy = image.height / 2;
  for (const point of ring) {
    let x: number;
    let y: number;
    if (!angle) {
      x = view.x + point.x * scale;
      y = view.y + point.y * scale;
    } else {
      const dx = (point.x - cx) * scale;
      const dy = (point.y - cy) * scale;
      x = view.x + cx * scale + dx * cos - dy * sin;
      y = view.y + cy * scale + dx * sin + dy * cos;
    }
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return {
    x: minX - pad,
    y: minY - pad,
    width: Math.max(16, maxX - minX + pad * 2),
    height: Math.max(16, maxY - minY + pad * 2),
  };
}

export function closedLength(points: Point[]) {
  let total = 0;
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return total;
}

export function pointAt(points: Point[], distance: number): Point {
  const total = closedLength(points);
  if (!points.length || !total) return points[0] || { x: 0, y: 0 };
  let left = ((distance % total) + total) % total;
  for (let index = 0; index < points.length; index += 1) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    const span = Math.hypot(b.x - a.x, b.y - a.y);
    if (left <= span || index === points.length - 1) {
      const t = span ? Math.min(1, left / span) : 0;
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    }
    left -= span;
  }
  return points[0];
}
