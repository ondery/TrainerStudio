"use client";

import { useEffect, useRef } from "react";

/** Portaled menus, selects, and popovers that belong to an open layer. */
export const NESTED_OVERLAY = "[data-radix-popper-content-wrapper],[data-radix-select-content],[data-radix-menu-content],[data-radix-popover-content],[role='listbox'],[data-overlay-nested]";

export function eventInsideOverlay(target: EventTarget | null, roots: Array<HTMLElement | null | undefined>): boolean {
  if (!(target instanceof Node)) return false;
  for (const root of roots) {
    if (root?.contains(target)) return true;
  }
  return target instanceof Element && Boolean(target.closest(NESTED_OVERLAY));
}

type OverlayEntry = {
  id: string;
  close: () => void;
  z: number;
  dismissPointer: boolean;
  inside?: () => Array<HTMLElement | null | undefined>;
};

const stack: OverlayEntry[] = [];
let listening = false;
let serial = 0;

function ensureListener() {
  if (listening || typeof document === "undefined") return;
  listening = true;
  document.addEventListener("keydown", onKey, true);
  document.addEventListener("pointerdown", onPointer, true);
}

function onKey(event: KeyboardEvent) {
  if (event.key !== "Escape" || !stack.length) return;
  const top = stack[stack.length - 1];
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation();
  stack.pop();
  top.close();
}

function onPointer(event: PointerEvent) {
  const top = stack[stack.length - 1];
  if (!top?.dismissPointer) return;
  const roots = top.inside ? top.inside() : [];
  if (eventInsideOverlay(event.target, roots)) return;
  stack.pop();
  top.close();
}

export function pushOverlay(entry: {
  id: string;
  close: () => void;
  dismissPointer?: boolean;
  inside?: () => Array<HTMLElement | null | undefined>;
}): number {
  const index = stack.findIndex((item) => item.id === entry.id);
  if (index >= 0) stack.splice(index, 1);
  const z = 60 + stack.length;
  stack.push({
    id: entry.id,
    close: entry.close,
    z,
    dismissPointer: entry.dismissPointer !== false,
    inside: entry.inside,
  });
  ensureListener();
  return z;
}

export function popOverlay(id: string) {
  const index = stack.findIndex((item) => item.id === id);
  if (index >= 0) stack.splice(index, 1);
}

export function topOverlay() {
  return stack[stack.length - 1] || null;
}

export function overlayDepth() {
  return stack.length;
}

/** Escape and an outside press close the top layer only. */
export function useBoundDismiss(open: boolean, close: () => void, inside: () => Array<HTMLElement | null | undefined>) {
  const closeRef = useRef(close);
  const insideRef = useRef(inside);
  const idRef = useRef(`bound-${(serial += 1)}`);
  closeRef.current = close;
  insideRef.current = inside;
  useEffect(() => {
    if (!open) return undefined;
    pushOverlay({
      id: idRef.current,
      close: () => closeRef.current(),
      dismissPointer: true,
      inside: () => insideRef.current(),
    });
    return () => popOverlay(idRef.current);
  }, [open]);
}
