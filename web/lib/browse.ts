"use client";

import { appearance } from "./appearance";
import { api, rememberGrant } from "./api";

export type PathFilter = { name: string; extensions: readonly string[] };

export const FILTERS = {
  yaml: [{ name: "YAML", extensions: ["yaml", "yml"] }],
  weights: [{ name: "Weights", extensions: ["pt", "onnx"] }],
  json: [{ name: "JSON", extensions: ["json"] }],
  key: [{ name: "License", extensions: ["key"] }],
} as const;

const RECENT_KEY = "trainer-studio.recent";

type TauriWindow = Window & { __TAURI_INTERNALS__?: unknown; __TAURI__?: unknown };
type DropFile = File & { path?: string; pywebviewFullPath?: string };

let dropTarget: ((path: string) => void) | null = null;

export function isTauri(): boolean {
  if (typeof window === "undefined") return false;
  const host = window as TauriWindow;
  return Boolean(host.__TAURI_INTERNALS__ || host.__TAURI__);
}

export function claimDrop(handler: (path: string) => void) {
  dropTarget = handler;
}

export function releaseDrop(handler: (path: string) => void) {
  window.setTimeout(() => {
    if (dropTarget === handler) dropTarget = null;
  }, 0);
}

export function deliverDrop(path: string): boolean {
  if (!dropTarget) return false;
  dropTarget(path);
  return true;
}

function recentCap() {
  return Math.max(1, Math.min(24, Number(appearance().recentLimit) || 8));
}

export function recentPaths(): string[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RECENT_KEY) || "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string" && item.trim() !== "").slice(0, recentCap());
  } catch {
    return [];
  }
}

export function rememberPath(path: string) {
  const value = path.trim();
  if (!value || typeof window === "undefined") return;
  const next = [value, ...recentPaths().filter((item) => item !== value)].slice(0, recentCap());
  window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event("studio-recent"));
}

export function fileUrlPath(raw: string): string {
  const line = raw.split(/\r?\n/).map((item) => item.trim()).find((item) => item.startsWith("file:"));
  if (!line) return "";
  try {
    const url = new URL(line);
    let path = decodeURIComponent(url.pathname);
    if (/^\/[A-Za-z]:\//.test(path)) path = path.slice(1);
    return path;
  } catch {
    return "";
  }
}

export function pathFromTransfer(data: DataTransfer | null): string {
  if (!data) return "";
  const file = data.files?.[0] as DropFile | undefined;
  if (file?.path) return file.path;
  if (file?.pywebviewFullPath) return file.pywebviewFullPath;
  return fileUrlPath(data.getData("text/uri-list") || data.getData("text/plain") || "");
}

export async function attachTauriDrop(onPath: (path: string) => void): Promise<() => void> {
  if (!isTauri()) return () => undefined;
  try {
    const mod = await import("@tauri-apps/api/webview");
    return mod.getCurrentWebview().onDragDropEvent((event) => {
      if (event.payload.type === "drop" && event.payload.paths[0]) onPath(event.payload.paths[0]);
    });
  } catch {
    return () => undefined;
  }
}

export async function browse(kind: "folder" | "file", filters?: readonly PathFilter[], title?: string, initial?: string): Promise<string | null> {
  if (isTauri()) {
    const dialog = await import("@tauri-apps/plugin-dialog");
    const picked = await dialog.open({
      directory: kind === "folder",
      multiple: false,
      title,
      defaultPath: initial || undefined,
      filters: kind === "file" && filters?.length ? filters.map((item) => ({ name: item.name, extensions: [...item.extensions] })) : undefined,
    });
    if (picked == null || Array.isArray(picked)) return Array.isArray(picked) ? picked[0] || null : null;
    return picked;
  }
  const body = await api<{ path?: string; cancelled?: boolean; code?: string; grant?: string }>("/api/dialog", {
    method: "POST",
    body: JSON.stringify({ kind, filters: filters || [], title: title || "", initial: initial || "" }),
  });
  if (body.path && body.grant) rememberGrant(body.path, body.grant);
  if (!body.path) {
    if (body.code && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("studio-browse-error", { detail: body.code }));
    }
    return null;
  }
  return body.path;
}
