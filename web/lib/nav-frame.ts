/** Pixels around the navigator bitmap: dock header, card padding, and the toolbar. */
export const NAV_CHROME_Y = 68;
export const NAV_PAD_X = 8;
export const NAV_LOCK_KEY = "trainer-studio.nav-lock";

export function navLocked(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(NAV_LOCK_KEY) === "1";
  } catch {
    return false;
  }
}

export function contentRatio(image: { w: number; h: number } | null, box: { w: number; h: number }): number {
  if (image && image.w > 1 && image.h > 1) return image.w / image.h;
  const width = Math.max(1, box.w - NAV_PAD_X);
  const height = Math.max(1, box.h - NAV_CHROME_Y);
  return width / height;
}

type Box = { x: number; y: number; w: number; h: number };

/** Keep the preview area at `ratio` (image width / height) while a float edge moves. */
export function lockAspect(start: Box, next: Box, edge: string, ratio: number): Box {
  const safe = ratio > 0.05 ? ratio : 1;
  const horizontal = edge === "left" || edge === "right" || edge.endsWith("-left") || edge.endsWith("-right") || edge.endsWith("left") || edge.endsWith("right");
  const vertical = edge === "top" || edge === "bottom" || edge.startsWith("top") || edge.startsWith("bottom");
  const driveWidth = horizontal && (!vertical || Math.abs(next.w - start.w) >= Math.abs(next.h - start.h));
  let w = next.w;
  let h = next.h;
  if (driveWidth) {
    const canvasW = Math.max(48, w - NAV_PAD_X);
    const canvasH = canvasW / safe;
    h = Math.max(120, Math.round(canvasH + NAV_CHROME_Y));
    w = Math.max(180, Math.round(canvasW + NAV_PAD_X));
  } else {
    const canvasH = Math.max(48, h - NAV_CHROME_Y);
    const canvasW = canvasH * safe;
    w = Math.max(180, Math.round(canvasW + NAV_PAD_X));
    h = Math.max(120, Math.round(canvasH + NAV_CHROME_Y));
  }
  const x = edge === "left" || edge.endsWith("-left") || edge.endsWith("left") ? start.x + start.w - w : start.x;
  const y = edge === "top" || edge.startsWith("top") ? start.y + start.h - h : start.y;
  return { x, y, w, h };
}
