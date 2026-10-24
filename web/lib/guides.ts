/** Crosshair guides. The pointer handler only stores a point. One animation frame writes translate3d. */

export type GuidePattern = "solid" | "dashed" | "dotted";

function withAlpha(color: string, opacity: number): string {
  const hex = color.trim();
  const match = /^#([\da-f]{6})$/i.exec(hex);
  const alpha = Math.min(1, Math.max(0, opacity));
  if (!match) return color;
  const value = match[1];
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Paint settings for one guide bar. Movement stays on transform and never reads this. */
export function guidePaint(input: {
  axis: "h" | "v";
  pattern: GuidePattern;
  color: string;
  opacity: number;
  thickness: number;
  dash: number;
  gap: number;
  shadow: boolean;
}): { background: string; boxShadow: string; opacity: number; height?: string; width?: string } {
  const thick = Math.max(0.5, input.thickness || 1);
  const ink = withAlpha(input.color || "#2dd4bf", input.opacity);
  const dash = Math.max(1, input.dash || 4);
  const gap = Math.max(1, input.gap || 4);
  const dir = input.axis === "h" ? "90deg" : "180deg";
  let background = ink;
  if (input.pattern === "dashed") {
    background = `repeating-linear-gradient(${dir}, ${ink} 0 ${dash}px, transparent ${dash}px ${dash + gap}px)`;
  } else if (input.pattern === "dotted") {
    const dot = Math.max(1, Math.min(thick, 3));
    const space = Math.max(dot + 1, gap);
    background = `repeating-linear-gradient(${dir}, ${ink} 0 ${dot}px, transparent ${dot}px ${dot + space}px)`;
  }
  const size = `${thick}px`;
  const boxShadow = input.shadow ? "0 0 0 0.5px rgba(0, 0, 0, 0.35)" : "none";
  if (input.axis === "h") return { background, boxShadow, opacity: 1, height: size };
  return { background, boxShadow, opacity: 1, width: size };
}

export type GuidePlacement = { lag: number; horizontal: string; vertical: string };

type Point = { clientX: number; clientY: number };

export function guideFrame(input: { x: number; y: number; show: boolean; stamp: number; now: number }): GuidePlacement {
  const lag = input.stamp ? Math.max(0, Math.round(input.now - input.stamp)) : 0;
  const x = input.show ? input.x : -10000;
  const y = input.show ? input.y : -10000;
  return {
    lag,
    horizontal: `translate3d(0px, ${y}px, 0px)`,
    vertical: `translate3d(${x}px, 0px, 0px)`,
  };
}

export function latestPointer(event: Point & { getCoalescedEvents?: () => Point[]; getPredictedEvents?: () => Point[] }): Point {
  const predicted = event.getPredictedEvents?.() || [];
  if (predicted.length) return predicted[predicted.length - 1];
  const coalesced = event.getCoalescedEvents?.() || [];
  if (coalesced.length) return coalesced[coalesced.length - 1];
  return event;
}

export function benchGuideLatency() {
  if (typeof document === "undefined" || typeof performance === "undefined") return { beforeMs: 0, afterMs: 0 };
  const canvas = document.createElement("canvas");
  canvas.width = 900;
  canvas.height = 600;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { beforeMs: 0, afterMs: 0 };
  ctx.strokeStyle = "#2dd4bf";
  const samples = 40;
  const beforeStart = performance.now();
  for (let index = 0; index < samples; index += 1) {
    ctx.clearRect(0, 0, 900, 600);
    ctx.beginPath();
    ctx.moveTo(0, 8 + index);
    ctx.lineTo(900, 8 + index);
    ctx.moveTo(8 + index, 0);
    ctx.lineTo(8 + index, 600);
    ctx.stroke();
  }
  const beforeMs = (performance.now() - beforeStart) / samples;
  const node = document.createElement("i");
  node.style.position = "absolute";
  node.style.left = "0";
  node.style.top = "0";
  node.style.width = "100%";
  node.style.height = "1px";
  document.body.appendChild(node);
  const afterStart = performance.now();
  for (let index = 0; index < samples; index += 1) {
    node.style.transform = `translate3d(${index}px, ${index}px, 0px)`;
  }
  const afterMs = (performance.now() - afterStart) / samples;
  node.remove();
  return {
    beforeMs: Math.round(beforeMs * 1000) / 1000,
    afterMs: Math.round(afterMs * 1000) / 1000,
  };
}

export function bindCrosshair(options: {
  host: HTMLElement;
  horizontal: HTMLElement;
  vertical: HTMLElement;
  active: () => boolean;
}) {
  const view = options.host.ownerDocument.defaultView;
  let rect = options.host.getBoundingClientRect();
  let frame = 0;
  let draws = 0;
  let pending = { x: 0, y: 0, stamp: 0, show: false };
  const refresh = () => {
    rect = options.host.getBoundingClientRect();
  };
  const observer = new ResizeObserver(refresh);
  observer.observe(options.host);
  view?.addEventListener("resize", refresh);
  const bench = benchGuideLatency();
  options.host.dataset.guideBefore = String(bench.beforeMs);
  options.host.dataset.guideAfter = String(bench.afterMs);
  options.host.dataset.guideMode = "dom";
  const flush = () => {
    frame = 0;
    const placed = guideFrame({ ...pending, now: performance.now() });
    options.horizontal.style.transform = placed.horizontal;
    options.vertical.style.transform = placed.vertical;
    draws += 1;
    options.host.dataset.guideLag = String(placed.lag);
    options.host.dataset.guideDraw = String(draws);
    options.host.dataset.guideMode = "dom";
  };
  const onPointer = (event: Event) => {
    const pointer = event as PointerEvent;
    const last = latestPointer(pointer);
    const x = last.clientX - rect.left;
    const y = last.clientY - rect.top;
    const show = options.active() && x >= 0 && y >= 0 && x <= rect.width && y <= rect.height;
    pending = { x, y, stamp: pointer.timeStamp || performance.now(), show };
    if (!frame) frame = view?.requestAnimationFrame(flush) || 0;
  };
  const raw = view ? "onpointerrawupdate" in view : false;
  const moveName = raw ? "pointerrawupdate" : "pointermove";
  options.host.addEventListener(moveName, onPointer, { passive: true });
  const onLeave = () => {
    pending = { x: -1e9, y: -1e9, stamp: 0, show: false };
    if (!frame) frame = view?.requestAnimationFrame(flush) || 0;
  };
  options.host.addEventListener("pointerleave", onLeave);
  return () => {
    if (frame) view?.cancelAnimationFrame(frame);
    observer.disconnect();
    view?.removeEventListener("resize", refresh);
    options.host.removeEventListener(moveName, onPointer);
    options.host.removeEventListener("pointerleave", onLeave);
  };
}
