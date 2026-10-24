/** Place a popover above its trigger. The trigger stays clear of the panel. */

export function anchorAbove(
  rect: { left: number; top: number; right: number; bottom: number },
  box: { w: number; h: number },
  viewport: { w: number; h: number },
  gap = 8,
) {
  let left = rect.right - box.w;
  if (left < 8) left = 8;
  if (left + box.w > viewport.w - 8) left = Math.max(8, viewport.w - box.w - 8);
  const limit = rect.top - gap;
  let top = limit - box.h;
  let maxHeight = box.h;
  if (top < 8) {
    top = 8;
    maxHeight = Math.max(96, limit - top);
  }
  return { left, top, maxHeight };
}
