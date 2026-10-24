/** Legacy canvas chrome. Sizes are CSS pixels on screen, independent of zoom. */

export const CANVAS = {
  handle: 8,
  handleBorder: 1.5,
  handleFill: "#ffffff",
  handleStroke: "#101418",
  vertex: 7,
  closeRadius: 8,
  closeColor: "#2dd4bf",
  rotateGap: 18,
  rotateRadius: 4.5,
  stroke: 1,
  strokeSelected: 1.5,
  dash: [6, 4] as const,
  guideDash: [4, 4] as const,
  guideColor: "rgba(45, 212, 191, 0.95)",
  guideShadow: "rgba(0, 0, 0, 0.35)",
  guideShadowWidth: 0.5,
  fill: 0.22,
  hit: 8,
  labelHeight: 20,
  labelFont: 12,
};

export function screenStroke(base: number, selected: boolean): number {
  const raw = Number.isFinite(base) && base > 0 ? base : CANVAS.stroke;
  return selected ? (raw <= 1 ? CANVAS.strokeSelected : raw * CANVAS.strokeSelected) : raw;
}

/** Local dash that stays `pattern` CSS pixels when the layer scale is `scale`. */
export function screenDash(pattern: readonly number[], scale: number): number[] {
  const safe = scale > 0 ? scale : 1;
  return pattern.map((part) => part / safe);
}

/** How many screen pixels a stroke occupies. strokeScaleEnabled false keeps CSS px. */
export function renderedStroke(cssPx: number, scale: number, strokeScaleEnabled: boolean): number {
  return strokeScaleEnabled ? cssPx * (scale > 0 ? scale : 1) : cssPx;
}

export function polygonInk(closed: boolean) {
  return { dash: closed ? ([] as number[]) : [...CANVAS.dash], fill: CANVAS.fill, solid: closed };
}
