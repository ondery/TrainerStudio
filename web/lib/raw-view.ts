import type { Annotation, Geometry } from "./types";

export type RawLine = { n: number; text: string; classIndex: number | null; classId: string; title: string };

function fixed(value: number) {
  return (Number.isFinite(value) ? value : 0).toFixed(6);
}

export function liveLine(classIndex: number, geometry: Geometry, width: number, height: number): string {
  if (width <= 0 || height <= 0) return "";
  if (geometry.type === "raw") return geometry.line.trim();
  if (geometry.type === "polygon") {
    const flat = geometry.points.flatMap((point) => [point.x / width, point.y / height]);
    return `${classIndex} ${flat.map(fixed).join(" ")}`;
  }
  if (geometry.type === "obb") {
    const flat = geometry.corners.flatMap((point) => [point.x / width, point.y / height]);
    return `${classIndex} ${flat.map(fixed).join(" ")}`;
  }
  if (geometry.type === "pose") {
    const box = geometry.box || { x: 0, y: 0, width: 0, height: 0 };
    const parts = [
      String(classIndex),
      fixed((box.x + box.width / 2) / width),
      fixed((box.y + box.height / 2) / height),
      fixed(box.width / width),
      fixed(box.height / height),
    ];
    for (const point of geometry.keypoints) {
      parts.push(fixed(point.x / width), fixed(point.y / height), String(point.visibility));
    }
    return parts.join(" ");
  }
  const cx = (geometry.x + geometry.width / 2) / width;
  const cy = (geometry.y + geometry.height / 2) / height;
  return `${classIndex} ${fixed(cx)} ${fixed(cy)} ${fixed(geometry.width / width)} ${fixed(geometry.height / height)}`;
}

export function liveLabelText(annotations: Annotation[], width: number, height: number, indexOf: (classId: string) => number | null): string {
  const lines: string[] = [];
  for (const row of annotations) {
    if (row.attributes?.review === "pending") continue;
    const index = indexOf(row.classId);
    if (index == null) continue;
    const line = liveLine(index, row.geometry, width, height);
    if (line) lines.push(line);
  }
  return lines.length ? `${lines.join("\n")}\n` : "";
}

export function sameLabel(disk: string, live: string) {
  const norm = (text: string) => text.replace(/\r\n/g, "\n").replace(/\n+$/, "");
  return norm(disk) === norm(live);
}

export function linkLabelLines(lines: { n: number; text: string }[], annotations: { id: string; attributes?: Annotation["attributes"] }[]) {
  const writable = annotations.filter((row) => row.attributes?.review !== "pending");
  const linked: Record<number, string> = {};
  let index = 0;
  for (const line of lines) {
    if (!line.text.trim()) continue;
    const row = writable[index];
    if (!row) break;
    linked[line.n] = row.id;
    index += 1;
  }
  return linked;
}

export function annotationRecord(row: Annotation, width: number, height: number, title: string, classIndex: number | null) {
  return {
    id: row.id,
    classId: row.classId,
    classIndex,
    title,
    pixel: row.geometry,
    normalized: classIndex == null ? null : liveLine(classIndex, row.geometry, width, height),
    attributes: row.attributes,
  };
}
