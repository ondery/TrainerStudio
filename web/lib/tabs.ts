"use client";

import { useSyncExternalStore } from "react";
import { useStudio } from "./store";

export type ImageTab = { id: string; name: string };

let tabs: ImageTab[] = [];
let closed: ImageTab[] = [];
let active = "";
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

function remember(rows: ImageTab[]) {
  if (!rows.length) return;
  const seen = new Set<string>();
  closed = [...rows.slice().reverse(), ...closed].filter((row) => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  }).slice(0, 8);
}

function activate(id: string) {
  active = id;
  if (active) void useStudio.getState().openImage(active);
}

export function openTab(id: string, name: string) {
  if (!id) return;
  const existing = tabs.find((row) => row.id === id);
  if (existing) {
    if (existing.name !== name) existing.name = name;
    active = id;
    emit();
    return;
  }
  tabs = [...tabs, { id, name }].slice(-8);
  closed = closed.filter((row) => row.id !== id);
  active = id;
  emit();
}

export function closeTab(id: string) {
  const hit = tabs.find((row) => row.id === id);
  const next = tabs.filter((row) => row.id !== id);
  if (hit) remember([hit]);
  tabs = next;
  if (active === id) activate(next[next.length - 1]?.id || "");
  emit();
}

export function closeOtherTabs(id: string) {
  const keep = tabs.find((row) => row.id === id);
  remember(tabs.filter((row) => row.id !== id));
  tabs = keep ? [keep] : [];
  activate(keep?.id || "");
  emit();
}

export function closeTabsToRight(id: string, rtl = false) {
  const index = tabs.findIndex((row) => row.id === id);
  if (index < 0) return;
  const gone = rtl ? tabs.slice(0, index) : tabs.slice(index + 1);
  if (!gone.length) return;
  remember(gone);
  tabs = rtl ? tabs.slice(index) : tabs.slice(0, index + 1);
  if (!tabs.some((row) => row.id === active)) activate(tabs[tabs.length - 1]?.id || "");
  emit();
}

export function closeAllTabs() {
  if (!tabs.length) return;
  remember(tabs);
  tabs = [];
  active = "";
  emit();
}

export function reopenClosedTab() {
  const hit = closed.shift();
  if (!hit) return;
  openTab(hit.id, hit.name);
  void useStudio.getState().openImage(hit.id);
}

export function canReopenTab() {
  return closed.length > 0;
}

export function canCloseOthers(id: string) {
  return tabs.some((row) => row.id === id) && tabs.length > 1;
}

export function canCloseToRight(id: string, rtl = false) {
  const index = tabs.findIndex((row) => row.id === id);
  if (index < 0) return false;
  return rtl ? index > 0 : index < tabs.length - 1;
}

export function useTabs(): ImageTab[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => tabs,
    () => [],
  );
}
