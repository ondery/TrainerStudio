/** A tab drag starts only after the pointer leaves the click slop. */

export const TAB_DRAG_THRESHOLD = 5;

export type TabPhase = "idle" | "pending" | "dragging";

export function tabPastThreshold(dx: number, dy: number, threshold = TAB_DRAG_THRESHOLD): boolean {
  return dx * dx + dy * dy >= threshold * threshold;
}

/** Pointer-down, then moves, then up or cancel. Overlay exists only while dragging. */
export function tabGesture(steps: Array<{ type: "down" } | { type: "move"; dx: number; dy: number } | { type: "up" } | { type: "cancel" }>): {
  phase: TabPhase;
  activate: boolean;
  overlay: boolean;
  drop: boolean;
} {
  let phase: TabPhase = "idle";
  let activate = false;
  let drop = false;
  for (const step of steps) {
    if (step.type === "down") {
      phase = "pending";
      activate = false;
      drop = false;
      continue;
    }
    if (step.type === "move") {
      if (phase === "pending" && tabPastThreshold(step.dx, step.dy)) phase = "dragging";
      continue;
    }
    if (step.type === "up") {
      activate = phase === "pending";
      drop = phase === "dragging";
      phase = "idle";
      continue;
    }
    activate = false;
    drop = false;
    phase = "idle";
  }
  return { phase, activate, overlay: phase === "dragging", drop };
}
