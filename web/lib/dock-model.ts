import type { Band, Column, PanelId } from "./grid";

export type Edge = "left" | "right" | "top" | "bottom" | "center";

/**
 * Tab-strip height. VS Code's drop overlay starts below the title
 * (`DropOverlay.getOverlayOffsetHeight` in editorDropTarget.ts).
 */
export const DROP_TITLE_PX = 28;

/** Side/top/bottom split occupies this fraction. The inner remainder merges as a tab. */
export const DROP_EDGE = 0.3;

/**
 * View-container drop target. Tab strip always merges. Inner 40% merges.
 * Everywhere else uses the nearest edge so a side dock splits left/right
 * without hunting a 10% gutter (editor files keep that sliver; views do not).
 */
export function hitEdge(x: number, y: number, width: number, height: number, title = DROP_TITLE_PX): Edge {
  if (y < title) return "center";
  const w = Math.max(1, width);
  const h = Math.max(1, height - title);
  const px = x / w;
  const py = (y - title) / h;
  if (px > DROP_EDGE && px < 1 - DROP_EDGE && py > DROP_EDGE && py < 1 - DROP_EDGE) return "center";
  const dist = { left: px, right: 1 - px, top: py, bottom: 1 - py };
  let edge: Edge = "left";
  let best = dist.left;
  for (const key of ["right", "top", "bottom"] as const) {
    if (dist[key] < best) {
      best = dist[key];
      edge = key;
    }
  }
  return edge;
}

/** Rectangle the panel will occupy. A side is half the group; the center is the whole group. */
export function dropRect(
  rect: { x: number; y: number; w: number; h: number },
  edge: Edge,
): { x: number; y: number; w: number; h: number } {
  if (edge === "left") return { x: rect.x, y: rect.y, w: rect.w / 2, h: rect.h };
  if (edge === "right") return { x: rect.x + rect.w / 2, y: rect.y, w: rect.w / 2, h: rect.h };
  if (edge === "top") return { x: rect.x, y: rect.y, w: rect.w, h: rect.h / 2 };
  if (edge === "bottom") return { x: rect.x, y: rect.y + rect.h / 2, w: rect.w, h: rect.h / 2 };
  return { x: rect.x, y: rect.y, w: rect.w, h: rect.h };
}

export function stripPanel(columns: Column[], panel: PanelId): Column[] {
  const next: Column[] = [];
  for (const column of columns) {
    const bands: Band[] = [];
    for (const band of column.bands) {
      const tabs = band.tabs.filter((id) => id !== panel);
      if (!tabs.length) continue;
      bands.push({ ...band, tabs, active: tabs.includes(band.active) ? band.active : tabs[0] });
    }
    if (bands.length) next.push({ bands });
  }
  return next;
}

export function insertPanel(columns: Column[], panel: PanelId, columnIndex: number, bandIndex: number, edge: Edge): Column[] {
  const copy = stripPanel(columns, panel).map((column) => ({ bands: column.bands.map((band) => ({ ...band, tabs: [...band.tabs] })) }));
  const leaf: Band = { tabs: [panel], active: panel, collapsed: false, size: 160 };
  if (!copy.length) return [{ bands: [leaf] }];
  const col = Math.max(0, Math.min(columnIndex, copy.length - 1));
  const row = Math.max(0, Math.min(bandIndex, copy[col].bands.length - 1));
  if (edge === "center") {
    const target = copy[col].bands[row];
    target.tabs = [...target.tabs.filter((id) => id !== panel), panel];
    target.active = panel;
    target.collapsed = false;
    return copy;
  }
  if (edge === "left" || edge === "right") {
    const at = edge === "left" ? col : col + 1;
    copy.splice(at, 0, { bands: [leaf] });
    return copy;
  }
  const at = edge === "top" ? row : row + 1;
  copy[col].bands.splice(at, 0, leaf);
  return copy;
}

export function pixelSize(value: number, snap: boolean, min: number): number {
  const next = Math.max(min, value);
  if (!snap) return next;
  return Math.max(min, Math.round(next / 8) * 8);
}

/** Adjacent split panes trade pixels 1:1 so one grows as the other shrinks. */
export function splitPair(start: number, next: number, delta: number, snap: boolean, min = 48): { first: number; second: number } {
  const total = Math.max(min * 2, start + next);
  let first = start + delta;
  if (snap) first = Math.round(first / 8) * 8;
  first = Math.min(total - min, Math.max(min, first));
  return { first, second: total - first };
}
