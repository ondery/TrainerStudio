"use client";

import { useSyncExternalStore } from "react";

let hover = "";
const listeners = new Set<() => void>();

export function setRawHover(id: string) {
  if (hover === id) return;
  hover = id;
  listeners.forEach((listener) => listener());
}

export function rawHover() {
  return hover;
}

export function useRawHover() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => hover,
    () => "",
  );
}
