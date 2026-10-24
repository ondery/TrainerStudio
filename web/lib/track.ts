export type Box = { x: number; y: number; width: number; height: number };

/** Halfway box between the current frame and the next one. */
export function blendBox(left: Box, right: Box, t = 0.5): Box {
  const mix = (a: number, b: number) => a + (b - a) * t;
  return {
    x: mix(left.x, right.x),
    y: mix(left.y, right.y),
    width: Math.max(1, mix(left.width, right.width)),
    height: Math.max(1, mix(left.height, right.height)),
  };
}
