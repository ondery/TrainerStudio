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

/** Escape and an outside press close the layer. Nested portals and sliders do not. */
export function useBoundDismiss(open: boolean, close: () => void, inside: () => Array<HTMLElement | null | undefined>) {
  const closeRef = useRef(close);
  const insideRef = useRef(inside);
  closeRef.current = close;
  insideRef.current = inside;
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const nested = document.querySelector(NESTED_OVERLAY);
      const roots = insideRef.current();
      const owned = Boolean(nested && roots.some((root) => root?.contains(nested)));
      if (nested && !owned) return;
      event.preventDefault();
      event.stopPropagation();
      closeRef.current();
    };
    const onPointer = (event: PointerEvent) => {
      if (eventInsideOverlay(event.target, insideRef.current())) return;
      closeRef.current();
    };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onPointer, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onPointer, true);
    };
  }, [open]);
}
