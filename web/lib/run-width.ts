/** Screen pixels stay constant when the layer is scaled by `scale`. */

export function runStrokeWidth(screenPx: number, scale: number): number {
  const px = screenPx >= 0.5 ? screenPx : 1.5;
  return px / Math.max(scale, 0.02);
}
