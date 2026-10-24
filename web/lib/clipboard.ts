import { appearance } from "./appearance";
import { offsetGeometry } from "./geom";
import type { Annotation } from "./types";
import { uid } from "./utils";

let buffer: Annotation[] = [];

export function copyAnnotations(rows: Annotation[]) {
  buffer = rows.map((row) => structuredClone(row));
}

export function hasClipboard() {
  return buffer.length > 0;
}

export function pasteAnnotations(imageId: string): Annotation[] {
  const stamp = new Date().toISOString();
  return buffer.map((row) => ({
    ...structuredClone(row),
    id: uid(),
    imageId,
    geometry: offsetGeometry(row.geometry, appearance().duplicateOffset ?? 12, appearance().duplicateOffset ?? 12),
    createdAt: stamp,
    updatedAt: stamp,
  }));
}
