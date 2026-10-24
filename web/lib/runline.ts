"use client";

import { useSyncExternalStore } from "react";
import { runStrokeWidth } from "./run-width";
import type { Geometry, Point } from "./types";

export { closedLength, hostBox, pointAt, pointHull, ringOf } from "./run-path";
export { runStrokeWidth } from "./run-width";

/** One full trip around the outline. Matches the CSS run-spin duration. */
export const RUN_LOOP_MS = 1500;
const FLASH_MS = 450;

export type RunKind = "save" | "sam" | "scan";
export type RunStatus = "run" | "error";

export type RunJob = {
  key: string;
  kind: RunKind;
  geometry: Geometry;
  classColor: string;
  status: RunStatus;
  epoch: number;
};

type Pen = {
  save(): void;
  restore(): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
  stroke(): void;
  fill?(): void;
  fillRect?(x: number, y: number, w: number, h: number): void;
  setAttr(name: string, value: unknown): void;
  setLineDash?: (segments: number[]) => void;
};

let jobs: RunJob[] = [];
let epoch = 0;
let toast = "";
let toastTimer = 0;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function saveEpoch() {
  return epoch;
}

export function beginRun(input: { key: string; kind: RunKind; geometry: Geometry; classColor: string }) {
  if (input.kind === "save") epoch += 1;
  const next: RunJob = { ...input, status: "run", epoch };
  jobs = [...jobs.filter((item) => item.key !== input.key), next];
  emit();
  return epoch;
}

export function cancelRun(key: string) {
  const next = jobs.filter((item) => item.key !== key);
  if (next.length === jobs.length) return;
  jobs = next;
  emit();
}

export function cancelKind(kind: RunKind) {
  const next = jobs.filter((item) => item.kind !== kind);
  if (next.length === jobs.length) return;
  jobs = next;
  emit();
}

export function finishRun(key: string) {
  cancelRun(key);
}

export function failRun(key: string, message: string) {
  const job = jobs.find((item) => item.key === key);
  if (message) showToast(message);
  if (!job) return;
  jobs = jobs.map((item) => (item.key === key ? { ...item, status: "error" as const } : item));
  emit();
  window.setTimeout(() => {
    jobs = jobs.filter((item) => item.key !== key || item.status !== "error");
    emit();
  }, FLASH_MS);
}

export function settleSaves(seen: number, ok: boolean, message = "") {
  const hit = jobs.filter((item) => item.kind === "save" && item.epoch <= seen);
  if (!hit.length) return;
  const keys = new Set(hit.map((item) => item.key));
  if (ok) {
    jobs = jobs.filter((item) => !keys.has(item.key));
    emit();
    return;
  }
  if (message) showToast(message);
  jobs = jobs.map((item) => (keys.has(item.key) ? { ...item, status: "error" as const } : item));
  emit();
  window.setTimeout(() => {
    jobs = jobs.filter((item) => !keys.has(item.key) || item.status !== "error");
    emit();
  }, FLASH_MS);
}

export function flashToast(message: string) {
  showToast(message);
}

function showToast(message: string) {
  toast = message;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toast = "";
    emit();
  }, 2200);
  emit();
}

export function useRuns() {
  return useSyncExternalStore(subscribe, () => jobs, () => jobs);
}

export function useRunToast() {
  return useSyncExternalStore(subscribe, () => toast, () => "");
}

function trace(pen: Pen, ring: Point[]) {
  pen.beginPath();
  pen.moveTo(ring[0].x, ring[0].y);
  for (let index = 1; index < ring.length; index += 1) pen.lineTo(ring[index].x, ring[index].y);
  pen.closePath();
}

/** Sweeping band while a detector scans the open image. Konva.Context has no fillRect. */
export function paintScanBand(
  pen: Pen,
  box: { x: number; y: number; width: number; height: number },
  time: number,
  reduced: boolean,
  accent: string,
) {
  if (!(box.width > 0) || !(box.height > 0)) return;
  const yNorm = reduced ? 0.5 : (time % 1400) / 1400;
  const thickness = Math.min(box.height, Math.max(2, box.height * 0.08));
  const x = box.x;
  const y = box.y + yNorm * box.height - thickness;
  const w = box.width;
  const h = thickness * 2;
  pen.save();
  pen.setAttr("fillStyle", accent);
  pen.setAttr("globalAlpha", 0.28);
  if (pen.fillRect) {
    pen.fillRect(x, y, w, h);
  } else {
    pen.beginPath();
    pen.moveTo(x, y);
    pen.lineTo(x + w, y);
    pen.lineTo(x + w, y + h);
    pen.lineTo(x, y + h);
    pen.closePath();
    pen.fill?.();
  }
  pen.restore();
}

/** Shape outline while the CSS ring carries the running motion. `screenPx` is CSS pixels. */
export function paintRun(
  pen: Pen,
  ring: Point[],
  time: number,
  scale: number,
  accent: string,
  classColor: string,
  status: RunStatus,
  reduced: boolean,
  screenPx = 1.5,
) {
  if (ring.length < 3) return;
  const width = runStrokeWidth(screenPx, scale);
  pen.save();
  pen.setAttr("lineJoin", "round");
  pen.setAttr("lineCap", "round");
  pen.setAttr("lineWidth", width);
  pen.setAttr("shadowBlur", 0);
  trace(pen, ring);
  if (status === "error") {
    const flash = 0.45 + 0.55 * Math.abs(Math.sin(time / 70));
    pen.setAttr("strokeStyle", "#ff4d4f");
    pen.setAttr("globalAlpha", flash);
    pen.stroke();
    pen.restore();
    return;
  }
  pen.setAttr("strokeStyle", accent);
  pen.setAttr("globalAlpha", 0.85);
  pen.stroke();
  pen.restore();
}
