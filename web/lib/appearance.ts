"use client";

import { useSyncExternalStore } from "react";
import { parseOpenZoom, type OpenZoom } from "./zoom-frame";

export type Appearance = {
  theme: "dark" | "light" | "system";
  chrome: "classic" | "ribbon";
  accent: string;
  density: "comfortable" | "compact";
  fontSize: number;
  guideLines: boolean;
  crosshairCursor: boolean;
  crossColor: string;
  crossWidth: number;
  crossOpacity: number;
  loupe: boolean;
  gridSize: number;
  gridGap: number;
  showGrid: boolean;
  epochs: number;
  imgsz: number;
  batch: number;
  exportFormat: "yolo" | "coco" | "voc";
  exportDir: string;
  trainOutput: string;
  samCheckpoint: string;
  uiScale: number;
  canvasBg: string;
  boxLine: number;
  fillOpacity: number;
  labelFont: number;
  handleSize: number;
  showLabels: boolean;
  showClassNames: boolean;
  /** Class-name text drawn on a shape. The chip behind it stays the class color. */
  labelColor: string;
  crossStyle: "solid" | "dashed" | "dotted";
  /** Dash length in screen pixels. Legacy default is 4. */
  crossDash: number;
  /** Gap length in screen pixels. Legacy default is 4. */
  crossGap: number;
  /** Soft black hairline under the guide, matching Legacy. */
  crossShadow: boolean;
  loupeSize: number;
  loupeZoom: number;
  snap: boolean;
  autosaveMs: number;
  filmstripHeight: number;
  thumbCache: number;
  samThreshold: number;
  samMaxPoints: number;
  samMulti: boolean;
  /** Detector (not SAM) proposes boxes when an empty image opens. */
  prelabelOnOpen: boolean;
  prelabelConf: number;
  trainFamily: string;
  trainDevice: "cpu" | "cuda";
  trainWeights: string;
  workers: number;
  exportGrouped: boolean;
  exportEmpty: boolean;
  exportPrecision: number;
  prefetch: number;
  threads: number;
  overscan: number;
  logLevel: "info" | "warn" | "debug";
  dataDir: string;
  brightness: number;
  contrast: number;
  confirmDelete: boolean;
  keepTool: boolean;
  startupLayout: "default" | "labeling" | "review" | "training";
  rememberImage: boolean;
  advanceOnDraw: boolean;
  wrapNavigation: boolean;
  skipUnlabeled: boolean;
  sortClasses: "index" | "name" | "count";
  hideEmpty: boolean;
  showIndexes: boolean;
  classHotkeys: boolean;
  viewRotate: 0 | 90 | 180 | 270;
  imageSort: "name" | "count" | "status";
  imageView: "list" | "thumbs";
  /** Visible wrap rows in the canvas class bar. Drag-resized, 1–8. */
  classBarRows: number;
  snapDock: boolean;
  snapPanels: boolean;
  wheelZoom: number;
  zoomStep: number;
  wheelMode: "zoom" | "pan";
  openZoom: OpenZoom;
  showMinimap: boolean;
  fitOnOpen: boolean;
  showCursor: boolean;
  showClass: boolean;
  labelBg: boolean;
  nudge: number;
  duplicateOffset: number;
  recentLimit: number;
  hiddenClasses: string[];
  lockedClasses: string[];
  /** Empty follows the accent color. */
  runColor: string;
  /** Running-border thickness in screen pixels. Zoom does not change it. */
  runWidth: number;
  /** Local scratch box in the raw panel. Never writes labels or data.yaml. */
  rawEdit: boolean;
};

export const APPEARANCE_KEY = "trainer-studio.appearance";

export const DEFAULT_APPEARANCE: Appearance = {
  theme: "dark",
  chrome: "classic",
  accent: "#0a84ff",
  density: "comfortable",
  fontSize: 13,
  guideLines: true,
  crosshairCursor: true,
  crossColor: "#2dd4bf",
  crossWidth: 1,
  crossOpacity: 0.95,
  loupe: true,
  gridSize: 8,
  gridGap: 8,
  showGrid: false,
  epochs: 10,
  imgsz: 640,
  batch: 8,
  exportFormat: "yolo",
  exportDir: "",
  trainOutput: "",
  samCheckpoint: "",
  uiScale: 1,
  canvasBg: "#10141b",
  boxLine: 1.6,
  fillOpacity: 0.13,
  labelFont: 12,
  handleSize: 8,
  showLabels: true,
  showClassNames: true,
  labelColor: "#000000",
  crossStyle: "dashed",
  crossDash: 4,
  crossGap: 4,
  crossShadow: true,
  loupeSize: 128,
  loupeZoom: 4,
  snap: false,
  autosaveMs: 800,
  filmstripHeight: 72,
  thumbCache: 400,
  samThreshold: 0.5,
  samMaxPoints: 8,
  samMulti: false,
  prelabelOnOpen: false,
  prelabelConf: 0.25,
  trainFamily: "yolo11",
  trainDevice: "cpu",
  trainWeights: "",
  workers: 0,
  exportGrouped: false,
  exportEmpty: false,
  exportPrecision: 6,
  prefetch: 2,
  threads: 2,
  overscan: 8,
  logLevel: "info",
  dataDir: "",
  brightness: 1,
  contrast: 1,
  confirmDelete: false,
  keepTool: true,
  startupLayout: "default",
  rememberImage: true,
  advanceOnDraw: false,
  wrapNavigation: false,
  skipUnlabeled: false,
  sortClasses: "index",
  hideEmpty: false,
  showIndexes: true,
  classHotkeys: true,
  viewRotate: 0,
  imageSort: "name",
  imageView: "list",
  classBarRows: 3,
  snapDock: false,
  snapPanels: false,
  wheelZoom: 1.08,
  zoomStep: 1.25,
  wheelMode: "zoom",
  openZoom: "fit",
  showMinimap: true,
  fitOnOpen: true,
  showCursor: true,
  showClass: true,
  labelBg: true,
  nudge: 1,
  duplicateOffset: 12,
  recentLimit: 8,
  hiddenClasses: [],
  lockedClasses: [],
  runColor: "",
  runWidth: 3,
  rawEdit: false,
};

let current = DEFAULT_APPEARANCE;
const listeners = new Set<() => void>();

export function migrateAppearance(raw: Partial<Appearance> & { crossMode?: string }): Appearance {
  const next: Appearance = {
    ...DEFAULT_APPEARANCE,
    ...raw,
    hiddenClasses: Array.isArray(raw.hiddenClasses) ? raw.hiddenClasses.filter((item) => typeof item === "string") : [],
    lockedClasses: Array.isArray(raw.lockedClasses) ? raw.lockedClasses.filter((item) => typeof item === "string") : [],
  };
  const hasGuides = typeof raw.guideLines === "boolean";
  const hasCursor = typeof raw.crosshairCursor === "boolean";
  if (next.theme !== "light" && next.theme !== "dark" && next.theme !== "system") next.theme = "dark";
  if (next.chrome !== "ribbon" && next.chrome !== "classic") next.chrome = "classic";
  if (raw.openZoom == null) next.openZoom = raw.fitOnOpen === false ? "100" : "fit";
  next.openZoom = parseOpenZoom(String(next.openZoom || ""));
  if (next.wheelMode !== "zoom" && next.wheelMode !== "pan") next.wheelMode = "zoom";
  if (!(next.zoomStep > 1) || next.zoomStep > 3) next.zoomStep = 1.25;
  if (next.crossStyle !== "solid" && next.crossStyle !== "dashed" && next.crossStyle !== "dotted") next.crossStyle = "dashed";
  if (!(next.crossDash >= 1) || next.crossDash > 48) next.crossDash = 4;
  if (!(next.crossGap >= 1) || next.crossGap > 48) next.crossGap = 4;
  if (typeof raw.crossShadow !== "boolean") next.crossShadow = true;
  if (!(next.runWidth >= 0.5) || next.runWidth > 12) next.runWidth = 3;
  if (typeof raw.prelabelOnOpen !== "boolean") {
    next.prelabelOnOpen = typeof window !== "undefined" && window.localStorage.getItem("ts-prelabel") === "1";
  }
  if (!(next.prelabelConf > 0) || next.prelabelConf > 1) next.prelabelConf = 0.25;
  const classBarRows = Math.round(Number(next.classBarRows));
  next.classBarRows = classBarRows >= 1 && classBarRows <= 8 ? classBarRows : 3;
  if (typeof next.labelColor !== "string" || !/^#[0-9a-fA-F]{6}$/.test(next.labelColor)) next.labelColor = "#000000";
  if (!hasGuides && !hasCursor && raw.crossMode) {
    if (raw.crossMode === "off") {
      next.guideLines = false;
      next.crosshairCursor = false;
    } else if (raw.crossMode === "cursor") {
      next.guideLines = false;
      next.crosshairCursor = true;
    } else {
      next.guideLines = true;
      next.crosshairCursor = true;
    }
  }
  return next;
}

function read(): Appearance {
  if (typeof window === "undefined") return current;
  try {
    const raw = JSON.parse(window.localStorage.getItem(APPEARANCE_KEY) || "{}") as Partial<Appearance> & { crossMode?: string };
    current = migrateAppearance(raw);
  } catch {
    current = DEFAULT_APPEARANCE;
  }
  return current;
}

export function appearance(): Appearance {
  return current;
}

export function saveAppearance(next: Appearance) {
  current = next;
  window.localStorage.setItem(APPEARANCE_KEY, JSON.stringify(next));
  const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.classList.toggle("dark", next.theme === "system" ? systemDark : next.theme !== "light");
  document.documentElement.dataset.chrome = next.chrome;
  document.documentElement.style.setProperty("--accent", next.accent);
  document.body.style.fontSize = `${next.fontSize}px`;
  document.documentElement.dataset.density = next.density;
  const style = document.documentElement.style as CSSStyleDeclaration & { zoom: string };
  style.zoom = String(next.uiScale || 1);
  listeners.forEach((listener) => listener());
}

export function patchAppearance(partial: Partial<Appearance>) {
  saveAppearance({ ...read(), ...partial });
}

export function useAppearance(): Appearance {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => current,
    () => DEFAULT_APPEARANCE,
  );
}

export function bootAppearance() {
  const next = read();
  if (typeof window !== "undefined" && !window.localStorage.getItem(APPEARANCE_KEY)) {
    const theme = window.localStorage.getItem("trainer-studio.theme");
    if (theme === "light" || theme === "dark") next.theme = theme;
  }
  saveAppearance(next);
}

let pointerSnap = { x: 0, y: 0, inside: false, zoom: 100 };
const pointerListeners = new Set<() => void>();

function publishPointer(next: typeof pointerSnap) {
  if (next.x === pointerSnap.x && next.y === pointerSnap.y && next.inside === pointerSnap.inside && next.zoom === pointerSnap.zoom) return;
  pointerSnap = next;
  pointerListeners.forEach((listener) => listener());
}

const coordListeners = new Set<(text: string) => void>();

export function setPointer(x: number, y: number, inside: boolean) {
  pointerSnap = { ...pointerSnap, x, y, inside };
  const text = inside ? `${x}, ${y}` : "";
  coordListeners.forEach((listener) => listener(text));
}

export function subscribeCoords(listener: (text: string) => void) {
  coordListeners.add(listener);
  return () => coordListeners.delete(listener);
}

export function setZoomPercent(value: number) {
  publishPointer({ ...pointerSnap, zoom: value });
}

export type Frame = { x: number; y: number; scale: number; w: number; h: number; iw: number; ih: number };

let frameSnap: Frame = { x: 0, y: 0, scale: 1, w: 1, h: 1, iw: 1, ih: 1 };
const frameListeners = new Set<() => void>();

export function setFrame(next: Frame) {
  if (
    next.x === frameSnap.x &&
    next.y === frameSnap.y &&
    next.scale === frameSnap.scale &&
    next.w === frameSnap.w &&
    next.h === frameSnap.h &&
    next.iw === frameSnap.iw &&
    next.ih === frameSnap.ih
  ) return;
  frameSnap = next;
  frameListeners.forEach((listener) => listener());
}

export function useFrame(): Frame {
  return useSyncExternalStore(
    (listener) => {
      frameListeners.add(listener);
      return () => frameListeners.delete(listener);
    },
    () => frameSnap,
    () => frameSnap,
  );
}

export function usePointer() {
  return useSyncExternalStore(
    (listener) => {
      pointerListeners.add(listener);
      return () => pointerListeners.delete(listener);
    },
    () => pointerSnap,
    () => pointerSnap,
  );
}
