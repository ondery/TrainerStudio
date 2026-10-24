"use client";

import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { GripHorizontal, Minus, MoreHorizontal, Pin, X } from "lucide-react";
import { dropRect, hitEdge, pixelSize, splitPair, type Edge } from "@/lib/dock-model";
import { tabPastThreshold } from "@/lib/dock-gesture";
import {
  activateNode,
  columnsFromNode,
  loadLayout,
  movePanel,
  normalize,
  panelsIn,
  shownTabs,
  nodeAt,
  pathOf,
  placed,
  allowsDrop,
  stripNode,
  preset,
  resizeChild,
  saveLayout,
  tabsNode,
  withRoot,
  type FloatWin,
  type Group,
  type Layout,
  PANELS,
  type DockNode,
  type PanelId,
  type Zone,
} from "@/lib/grid";
import { appearance as readAppearance, patchAppearance, useAppearance } from "@/lib/appearance";
import { drawCommands } from "@/lib/draw";
import { contentRatio, lockAspect, NAV_LOCK_KEY, navLocked } from "@/lib/nav-frame";
import { useBoundDismiss } from "@/lib/overlay";
import { useStudio } from "@/lib/store";
import { cn } from "@/lib/utils";

type Drag =
  | { kind: "move"; id: PanelId; px: number; py: number; ox: number; oy: number }
  | { kind: "resize"; id: string; edge: Edge | "top-left" | "top-right" | "bottom-left" | "bottom-right"; px: number; py: number; box: { x: number; y: number; w: number; h: number } }
  | { kind: "zone"; zone: Zone; px: number; py: number; size: number }
  | { kind: "split"; zone: Zone | "float"; floatId?: string; path: string; index: number; axis: "x" | "y"; px: number; py: number; sizes: number[] };

type Hover = { zone: Zone | "float"; floatId?: string; path: string; edge: Edge } | null;

function armDockDrag(mode = "1") {
  document.body.dataset.dockDrag = mode;
  window.getSelection()?.removeAllRanges();
}

function clearDockDrag() {
  delete document.body.dataset.dockDrag;
}

export function Dock({ center, render }: { center: ReactNode; render: (id: PanelId) => ReactNode }) {
  const { t } = useTranslation();
  const appearance = useAppearance();
  const [layout, setLayout] = useState<Layout>(() => loadLayout());
  const layoutRef = useRef(layout);
  const hostRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Drag | null>(null);
  const pendingRef = useRef<{ id: PanelId; x: number; y: number; ox: number; oy: number } | null>(null);
  const suppressClick = useRef(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const ptrRef = useRef({ x: 0, y: 0 });
  const tRef = useRef(t);
  tRef.current = t;
  const [hover, setHover] = useState<Hover>(null);
  const hoverRef = useRef<Hover>(null);
  const moving = useRef<PanelId | null>(null);
  const originRef = useRef<Layout | null>(null);
  const [dragId, setDragId] = useState<PanelId | null>(null);
  const floatRef = useRef<(id: PanelId, at?: { x: number; y: number }) => void>(() => undefined);

  useEffect(() => {
    commit(loadLayout());
    const onPreset = (event: Event) => {
      const name = String((event as CustomEvent).detail || "default");
      if (name === "reload") {
        commit(loadLayout());
        return;
      }
      commit(name === "save" ? layoutRef.current : preset(name === "reset" ? "default" : name));
    };
    const onToggle = (event: Event) => toggle(String((event as CustomEvent).detail) as PanelId);
    const onSide = (event: Event) => {
      if (String((event as CustomEvent).detail) !== "swap") return;
      const box = layoutRef.current;
      commit({ ...box, left: box.right, right: box.left });
    };
    const onActivity = (event: Event) => {
      const id = String((event as CustomEvent).detail || "toggle");
      const box = layoutRef.current;
      if (id === "toggle") {
        commit({ ...box, left: { ...box.left, collapsed: !box.left.collapsed } });
        return;
      }
      if (!PANELS.includes(id as PanelId)) return;
      const panel = id as PanelId;
      const root = box.left.root;
      const inLeft = panelsIn(root).includes(panel);
      const path = pathOf(root, panel) || "";
      if (inLeft && root && !box.left.collapsed) {
        if (shownTabs(root).includes(panel)) {
          commit({ ...box, left: { ...box.left, active: panel, collapsed: true } });
          return;
        }
        commit({ ...box, left: withRoot({ ...box.left, active: panel }, activateNode(root, path, panel), false) });
        return;
      }
      if (inLeft && root) {
        commit({
          ...box,
          left: withRoot({ ...box.left, size: Math.max(box.left.size || 240, 240) }, activateNode(root, path, panel), false),
        });
        return;
      }
      const next = movePanel(box, panel, { zone: "left", path: "", edge: "center" });
      commit({ ...next, left: { ...next.left, collapsed: false, size: Math.max(next.left.size || 240, 240) } });
    };
    const onFloat = (event: Event) => {
      const id = String((event as CustomEvent).detail || "") as PanelId;
      if (PANELS.includes(id)) floatRef.current(id);
    };
    window.addEventListener("studio-layout", onPreset);
    window.addEventListener("studio-toggle-panel", onToggle);
    window.addEventListener("studio-dock-side", onSide);
    window.addEventListener("studio-activity", onActivity);
    const onNav = (event: Event) => {
      const show = Boolean((event as CustomEvent).detail);
      const box = layoutRef.current;
      if (show) {
        if (!placed(box).has("minimap")) floatRef.current("minimap");
        return;
      }
      if (placed(box).has("minimap")) commit(hide(box, "minimap"));
    };
    window.addEventListener("studio-float", onFloat);
    const onDockPanel = (event: Event) => {
      const id = String((event as CustomEvent).detail || "") as PanelId;
      if (!PANELS.includes(id)) return;
      commit(movePanel(layoutRef.current, id, { zone: "right", path: "", edge: "center" }));
    };
    const onNavReset = () => {
      patchAppearance({ showMinimap: true });
      floatRef.current("minimap");
    };
    const onLayoutReset = () => {
      commit(preset("default"));
      if (readAppearance().showMinimap) floatRef.current("minimap");
    };
    window.addEventListener("studio-navigator", onNav);
    window.addEventListener("studio-dock-panel", onDockPanel);
    window.addEventListener("studio-navigator-reset", onNavReset);
    window.addEventListener("studio-layout-reset", onLayoutReset);
    if (readAppearance().showMinimap && !placed(layoutRef.current).has("minimap")) floatRef.current("minimap");
    return () => {
      window.removeEventListener("studio-layout", onPreset);
      window.removeEventListener("studio-toggle-panel", onToggle);
      window.removeEventListener("studio-dock-side", onSide);
      window.removeEventListener("studio-activity", onActivity);
      window.removeEventListener("studio-float", onFloat);
      window.removeEventListener("studio-navigator", onNav);
      window.removeEventListener("studio-dock-panel", onDockPanel);
      window.removeEventListener("studio-navigator-reset", onNavReset);
      window.removeEventListener("studio-layout-reset", onLayoutReset);
    };
  }, []);

  function commit(next: Layout, persist = true) {
    const clean = normalize({ ...next, showGrid: appearance.showGrid });
    layoutRef.current = clean;
    setLayout(clean);
    if (persist) saveLayout(clean);
    window.dispatchEvent(new Event("studio-layout-changed"));
  }

  const pointerMoveRef = useRef<(event: PointerEvent) => void>(() => undefined);
  const pointerEndRef = useRef<(drop: boolean) => void>(() => undefined);
  pointerMoveRef.current = (event: PointerEvent) => {
    if (!dragRef.current && pendingRef.current) {
      const pending = pendingRef.current;
      if (!tabPastThreshold(event.clientX - pending.x, event.clientY - pending.y)) return;
      pendingRef.current = null;
      suppressClick.current = true;
      armDockDrag();
      moving.current = pending.id;
      originRef.current = layoutRef.current;
      setDragId(pending.id);
      dragRef.current = { kind: "move", id: pending.id, px: pending.x, py: pending.y, ox: pending.ox, oy: pending.oy };
    }
    const current = dragRef.current;
    if (!current) return;
    const box = layoutRef.current;
    const snap = appearance.snapPanels;
    if (current.kind === "zone") {
      const delta = current.zone === "bottom" ? current.py - event.clientY : current.zone === "left" ? event.clientX - current.px : current.px - event.clientX;
      const size = pixelSize(current.size + delta, snap, current.zone === "bottom" ? 72 : 160);
      const max = Math.max(180, window.innerWidth - 280);
      commit({ ...box, [current.zone]: { ...box[current.zone], size: Math.min(size, max), collapsed: false } }, false);
      return;
    }
    if (current.kind === "split") {
      const delta = current.axis === "x" ? event.clientX - current.px : event.clientY - current.py;
      const sizes = current.sizes.slice();
      const pair = splitPair(sizes[current.index], sizes[current.index + 1], delta, snap);
      sizes[current.index] = pair.first;
      sizes[current.index + 1] = pair.second;
      if (current.zone === "float" && current.floatId) {
        commit({
          ...box,
          floating: box.floating.map((win) => {
            if (win.id !== current.floatId || !win.root) return win;
            const root = resizeChild(win.root, current.path, sizes);
            return { ...win, root, columns: columnsFromNode(root) };
          }),
        }, false);
        return;
      }
      if (current.zone !== "float") {
        const zone = box[current.zone];
        if (!zone.root) return;
        commit({ ...box, [current.zone]: withRoot(zone, resizeChild(zone.root, current.path, sizes)) }, false);
      }
      return;
    }
    if (current.kind === "resize") {
      const win = box.floating.find((item) => item.id === current.id);
      if (!win) return;
      const dx = event.clientX - current.px;
      const dy = event.clientY - current.py;
      let { x, y, w, h } = current.box;
      const edge = current.edge;
      if (edge === "right" || edge === "top-right" || edge === "bottom-right") w = pixelSize(current.box.w + dx, snap, 180);
      if (edge === "bottom" || edge === "bottom-left" || edge === "bottom-right") h = pixelSize(current.box.h + dy, snap, 120);
      if (edge === "left" || edge === "top-left" || edge === "bottom-left") {
        w = pixelSize(current.box.w - dx, snap, 180);
        x = current.box.x + current.box.w - w;
      }
      if (edge === "top" || edge === "top-left" || edge === "top-right") {
        h = pixelSize(current.box.h - dy, snap, 120);
        y = current.box.y + current.box.h - h;
      }
      const ids = panelsIn(win.root);
      if (ids.length === 1 && ids[0] === "minimap" && navLocked()) {
        const editor = useStudio.getState().editor;
        const ratio = contentRatio(editor.width > 1 && editor.height > 1 ? { w: editor.width, h: editor.height } : null, current.box);
        const locked = lockAspect(current.box, { x, y, w, h }, edge, ratio);
        x = locked.x;
        y = locked.y;
        w = locked.w;
        h = locked.h;
      }
      commit({ ...box, floating: box.floating.map((item) => (item.id === win.id ? { ...item, x, y, w, h } : item)) }, false);
      return;
    }
    if (current.kind !== "move") return;
    ptrRef.current = { x: event.clientX, y: event.clientY };
    let live = box;
    let handle = current;
    let win = live.floating.find((item) => panelsIn(item.root).includes(handle.id));
    const found = dropTarget(live, handle.id, bandAt(event.clientX, event.clientY));
    hoverRef.current = found;
    const hostRect = hostRef.current?.getBoundingClientRect();
    if (!found && !win && hostRect && !overDockChrome(event.clientX, event.clientY)) {
      const at = {
        x: Math.max(8, event.clientX - hostRect.left - 48),
        y: Math.max(8, event.clientY - hostRect.top - 14),
      };
      floatRef.current(handle.id, at);
      live = layoutRef.current;
      win = live.floating.find((item) => panelsIn(item.root).includes(handle.id));
      if (win) {
        handle = { kind: "move", id: handle.id, px: event.clientX, py: event.clientY, ox: win.x, oy: win.y };
        dragRef.current = handle;
      }
    } else if (win) {
      const placed = win;
      const dx = event.clientX - handle.px;
      const dy = event.clientY - handle.py;
      const x = pixelSize(handle.ox + dx, snap, 0);
      const y = pixelSize(handle.oy + dy, snap, 0);
      commit({ ...live, floating: live.floating.map((item) => (item.id === placed.id ? { ...item, x, y } : item)) }, false);
      live = layoutRef.current;
    }
    paintDrop(hostRef.current, previewRef.current, ghostRef.current, found, event.clientX, event.clientY, tRef.current(`panel.${handle.id}`), Boolean(win));
  };
  pointerEndRef.current = (drop: boolean) => {
    const hadPending = Boolean(pendingRef.current);
    pendingRef.current = null;
    clearDockDrag();
    hideDrop(previewRef.current, ghostRef.current);
    const current = dragRef.current;
    if (!drop && (hadPending || current?.kind === "move")) suppressClick.current = true;
    const zone = hoverRef.current;
    const ptr = ptrRef.current;
    const origin = originRef.current;
    originRef.current = null;
    dragRef.current = null;
    moving.current = null;
    hoverRef.current = null;
    setHover(null);
    setDragId(null);
    if (!current) return;
    if (!drop) {
      if (origin) commit(origin);
      return;
    }
    if (current.kind === "move") {
      if (zone) {
        commit(movePanel(layoutRef.current, current.id, zone));
        return;
      }
      const already = layoutRef.current.floating.some((item) => panelsIn(item.root).includes(current.id));
      if (!already && !overDockChrome(ptr.x, ptr.y)) {
        const hostRect = hostRef.current?.getBoundingClientRect();
        floatRef.current(current.id, hostRect ? { x: Math.max(8, ptr.x - hostRect.left - 48), y: Math.max(8, ptr.y - hostRect.top - 14) } : undefined);
        return;
      }
    }
    saveLayout(layoutRef.current);
  };

  useEffect(() => {
    const move = (event: PointerEvent) => pointerMoveRef.current(event);
    const end = (drop: boolean) => pointerEndRef.current(drop);
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (!pendingRef.current && dragRef.current?.kind !== "move") return;
      event.preventDefault();
      end(false);
    };
    const onBlur = () => {
      if (!pendingRef.current && dragRef.current?.kind !== "move") return;
      end(false);
    };
    const onUp = () => end(true);
    const onCancel = () => end(false);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  function toggle(id: PanelId) {
    if (placed(layoutRef.current).has(id)) {
      commit(hide(layoutRef.current, id));
      return;
    }
    const next = movePanel(layoutRef.current, id, { zone: "right", path: "", edge: "center" });
    commit(next);
  }

  function onTitleDown(event: React.PointerEvent, id: PanelId) {
    if (event.button !== 0) return;
    suppressClick.current = false;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* capture is best-effort */
    }
    const win = layoutRef.current.floating.find((item) => panelsIn(item.root).includes(id));
    pendingRef.current = { id, x: event.clientX, y: event.clientY, ox: win?.x || 32, oy: win?.y || 32 };
  }

  function acceptTab(path: string, id: PanelId, zone: Zone | "float", floatId?: string) {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    if (zone === "float" && floatId) activateFloat(floatId, path, id);
    else if (zone !== "float") activate(zone, path, id);
  }

  const fitted = fitPair(layout.left, layout.right);
  const left = fitted.left;
  const right = fitted.right;
  const bottom = sideSize(layout.bottom, "bottom");
  const gridStyle = {
    display: "grid",
    gridTemplateColumns: `minmax(0, ${left}px) minmax(0, 1fr) minmax(0, ${right}px)`,
    gridTemplateRows: `minmax(0, 1fr) minmax(0, ${bottom}px)`,
    gridTemplateAreas: '"left canvas right" "bottom bottom bottom"',
    minWidth: 0,
    maxWidth: "100%",
  } as const;

  floatRef.current = float;

  return (
    <div ref={hostRef} data-testid="workspace-grid" className="relative h-full min-h-0 min-w-0 overflow-hidden" style={gridStyle}>
      <ZoneView t={t} zone="left" group={layout.left} render={render} hover={hover} dragId={dragId} onTitleDown={onTitleDown} onCollapse={() => commit({ ...layout, left: { ...layout.left, collapsed: !layout.left.collapsed } })} onClose={(id) => { if (id === "minimap") patchAppearance({ showMinimap: false }); commit(hide(layout, id)); }} onFloat={(id) => float(id)} onActivate={(path, id) => acceptTab(path, id, "left")} onResize={(event) => { armDockDrag(); dragRef.current = { kind: "zone", zone: "left", px: event.clientX, py: event.clientY, size: layout.left.size }; }} onSplit={(path, index, axis, sizes, event) => startSplit("left", path, index, axis, sizes, event)} onCommand={(id, edge, target) => commandPanel("left", id, edge, target)} />
      <div className="relative min-h-0 min-w-0 overflow-hidden" style={{ gridArea: "canvas" }}>{center}</div>
      <ZoneView t={t} zone="right" group={layout.right} render={render} hover={hover} dragId={dragId} onTitleDown={onTitleDown} onCollapse={() => commit({ ...layout, right: { ...layout.right, collapsed: !layout.right.collapsed } })} onClose={(id) => { if (id === "minimap") patchAppearance({ showMinimap: false }); commit(hide(layout, id)); }} onFloat={(id) => float(id)} onActivate={(path, id) => acceptTab(path, id, "right")} onResize={(event) => { armDockDrag(); dragRef.current = { kind: "zone", zone: "right", px: event.clientX, py: event.clientY, size: layout.right.size }; }} onSplit={(path, index, axis, sizes, event) => startSplit("right", path, index, axis, sizes, event)} onCommand={(id, edge, target) => commandPanel("right", id, edge, target)} />
      <ZoneView t={t} zone="bottom" group={layout.bottom} render={render} hover={hover} dragId={dragId} onTitleDown={onTitleDown} onCollapse={() => commit({ ...layout, bottom: { ...layout.bottom, collapsed: !layout.bottom.collapsed } })} onClose={(id) => { if (id === "minimap") patchAppearance({ showMinimap: false }); commit(hide(layout, id)); }} onFloat={(id) => float(id)} onActivate={(path, id) => acceptTab(path, id, "bottom")} onResize={(event) => { armDockDrag(); dragRef.current = { kind: "zone", zone: "bottom", px: event.clientX, py: event.clientY, size: layout.bottom.size }; }} onSplit={(path, index, axis, sizes, event) => startSplit("bottom", path, index, axis, sizes, event)} onCommand={(id, edge, target) => commandPanel("bottom", id, edge, target)} />
      {layout.floating.map((win) => (
        <FloatGroup key={win.id} t={t} win={win} render={render} hover={hover} dragId={dragId} onTitleDown={onTitleDown} onClose={(id) => { if (id === "minimap") patchAppearance({ showMinimap: false }); commit(hide(layoutRef.current, id)); }} onActivate={(path, id) => acceptTab(path, id, "float", win.id)} onResize={(edge, event) => { armDockDrag(); dragRef.current = { kind: "resize", id: win.id, edge, px: event.clientX, py: event.clientY, box: { x: win.x, y: win.y, w: win.w, h: win.h } }; }} onSplit={(path, index, axis, sizes, event) => startSplit("float", path, index, axis, sizes, event, win.id)} onCommand={(id, edge, target) => commandPanel("float", id, edge, target, win.id)} />
      ))}
      <div ref={previewRef} data-testid="drop-preview" data-on="0" className="dock-drop-target" />
      <div ref={ghostRef} data-testid="dock-ghost" data-on="0" className="dock-tab-ghost" />
      {appearance.showGrid ? <div data-testid="workspace-grid-guide" className="pointer-events-none absolute inset-0 z-20 grid grid-cols-12 grid-rows-12">{Array.from({ length: 144 }, (_, index) => <div key={index} className="border border-dashed border-accent/15" />)}</div> : null}
    </div>
  );

  function startSplit(zone: Zone | "float", path: string, index: number, axis: "x" | "y", sizes: number[], event: React.PointerEvent, floatId?: string) {
    armDockDrag(axis === "x" ? "split-x" : "split-y");
    dragRef.current = { kind: "split", zone, floatId, path, index, axis, px: event.clientX, py: event.clientY, sizes };
  }

  function activate(zone: Zone, path: string, id: PanelId) {
    const group = layout[zone];
    if (!group.root) return;
    commit({ ...layout, [zone]: withRoot(group, activateNode(group.root, path, id), false) });
  }

  function activateFloat(floatId: string, path: string, id: PanelId) {
    const floating = layout.floating.map((item) => {
      if (item.id !== floatId || !item.root) return item;
      const root = activateNode(item.root, path, id);
      return { ...item, root, columns: columnsFromNode(root) };
    });
    commit({ ...layout, floating });
  }

  function commandPanel(zone: Zone | "float", id: PanelId, edge: Edge, target?: Zone, floatId?: string) {
    const box = layoutRef.current;
    if (target) {
      commit(movePanel(box, id, { zone: target, path: "", edge: "center" }));
      return;
    }
    if (zone === "float" && floatId) {
      const win = box.floating.find((item) => item.id === floatId);
      const path = pathOf(win?.root, id) || "";
      commit(movePanel(box, id, { zone: "float", floatId, path, edge }));
      return;
    }
    if (zone === "float") return;
    const path = pathOf(box[zone].root, id) || "";
    commit(movePanel(box, id, { zone, path, edge }));
  }

  function float(id: PanelId, at?: { x: number; y: number }) {
    const box = layoutRef.current;
    const root = tabsNode([id]);
    const wide = typeof window === "undefined" ? 1280 : window.innerWidth;
    const nav = id === "minimap";
    const win: FloatWin = {
      id: `float-${id}-${Date.now().toString(36)}`,
      x: at ? Math.max(8, Math.round(at.x)) : nav ? Math.max(24, Math.round(wide * 0.28)) : 72,
      y: at ? Math.max(8, Math.round(at.y)) : nav ? 48 : 64,
      w: nav ? 460 : 340,
      h: nav ? 248 : 280,
      col: 1,
      row: 1,
      colSpan: 1,
      rowSpan: 1,
      columns: columnsFromNode(root),
      root,
    };
    commit({
      ...box,
      left: withRoot(box.left, stripNode(box.left.root, id), box.left.collapsed),
      right: withRoot(box.right, stripNode(box.right.root, id), box.right.collapsed),
      bottom: withRoot(box.bottom, stripNode(box.bottom.root, id), box.bottom.collapsed),
      hidden: box.hidden.filter((item) => item !== id),
      floating: [
        ...box.floating.flatMap((item) => {
          const next = stripNode(item.root, id);
          if (!next || !panelsIn(next).length) return [];
          return [{ ...item, root: next, columns: columnsFromNode(next) }];
        }),
        win,
      ],
    });
  }
}

function sideSize(group: Group, zone: Zone) {
  if (!group.tabs.length || group.collapsed) return 0;
  const view = typeof window === "undefined" ? 1280 : zone === "bottom" ? window.innerHeight : window.innerWidth;
  const reserve = zone === "bottom" ? 180 : 280;
  return Math.min(group.size, Math.max(120, view - reserve));
}

function fitPair(leftGroup: Group, rightGroup: Group) {
  let left = sideSize(leftGroup, "left");
  let right = sideSize(rightGroup, "right");
  const view = typeof window === "undefined" ? 1280 : window.innerWidth;
  const budget = Math.max(80, view - 280);
  if (left + right > budget) {
    const scale = budget / Math.max(1, left + right);
    left = left ? Math.max(36, Math.floor(left * scale)) : 0;
    right = right ? Math.max(36, Math.floor(right * scale)) : 0;
  }
  return { left, right };
}

function hide(layout: Layout, id: PanelId): Layout {
  return normalize({
    ...layout,
    left: withRoot(layout.left, stripNode(layout.left.root, id), layout.left.collapsed),
    right: withRoot(layout.right, stripNode(layout.right.root, id), layout.right.collapsed),
    bottom: withRoot(layout.bottom, stripNode(layout.bottom.root, id), layout.bottom.collapsed),
    floating: layout.floating.flatMap((item) => {
      const root = stripNode(item.root, id);
      if (!root || !panelsIn(root).length) return [];
      return [{ ...item, root, columns: columnsFromNode(root) }];
    }),
    hidden: [...layout.hidden.filter((item) => item !== id), id],
  });
}

function dropTarget(layout: Layout, panel: PanelId, hover: Hover): Hover {
  if (!hover) return null;
  const root = hover.zone === "float"
    ? layout.floating.find((item) => item.id === hover.floatId)?.root
    : layout[hover.zone].root;
  const count = panelsIn(root).length;
  if (!allowsDrop(nodeAt(root, hover.path), panel, hover.edge, count)) return null;
  return hover;
}

function overDockChrome(x: number, y: number): boolean {
  for (const node of document.elementsFromPoint(x, y)) {
    if (!(node instanceof HTMLElement)) continue;
    if (node.closest("[data-dock-dragging]")) continue;
    if (node.closest("[data-zone], [data-floating], [data-dock]")) return true;
  }
  return false;
}

function bandAt(x: number, y: number): Hover {
  const stack = document.elementsFromPoint(x, y).filter((item): item is HTMLElement => item instanceof HTMLElement && !item.closest("[data-dock-dragging]"));
  const marked = stack.map((item) => item.closest("[data-drop-zone]")).find((item): item is HTMLElement => item instanceof HTMLElement);
  if (marked) {
    const edge = marked.dataset.edge;
    const zone = marked.dataset.zone;
    if (edge === "left" || edge === "right" || edge === "top" || edge === "bottom" || edge === "center") {
      if (zone === "left" || zone === "right" || zone === "bottom" || zone === "float") {
        return { zone, floatId: marked.dataset.float || undefined, path: marked.dataset.path || "", edge };
      }
    }
  }
  const empty = stack.map((item) => item.closest("[data-dock='drop-here']")).find((item): item is HTMLElement => item instanceof HTMLElement);
  if (empty) {
    const zone = (empty.dataset.zone || empty.closest("[data-testid^='dock-']")?.getAttribute("data-testid")?.replace("dock-", "")) as Zone | undefined;
    if (zone === "left" || zone === "right" || zone === "bottom") {
      return { zone, path: "", edge: "center" };
    }
  }
  const target = stack.map((item) => item.closest("[data-dock='tabs']")).find((item): item is HTMLElement => item instanceof HTMLElement);
  if (!target) return null;
  const rect = target.getBoundingClientRect();
  return {
    zone: (target.dataset.zone || "left") as Zone | "float",
    floatId: target.dataset.float || undefined,
    path: target.dataset.path || "",
    edge: hitEdge(x - rect.left, y - rect.top, rect.width, rect.height),
  };
}

type SplitHandler = (path: string, index: number, axis: "x" | "y", sizes: number[], event: React.PointerEvent) => void;

function ZoneView({
  t, zone, group, render, hover, dragId, onTitleDown, onCollapse, onClose, onFloat, onActivate, onResize, onSplit, onCommand,
}: {
  t: (key: string) => string;
  zone: Zone;
  group: Group;
  render: (id: PanelId) => ReactNode;
  hover: Hover;
  dragId: PanelId | null;
  onTitleDown: (event: React.PointerEvent, id: PanelId) => void;
  onCollapse: () => void;
  onClose: (id: PanelId) => void;
  onFloat: (id: PanelId) => void;
  onActivate: (path: string, id: PanelId) => void;
  onResize: (event: React.PointerEvent) => void;
  onSplit: SplitHandler;
  onCommand: (id: PanelId, edge: Edge, target?: Zone) => void;
}) {
  if (!group.tabs.length || !group.root) return <div style={{ gridArea: zone }} />;
  if (group.collapsed) {
    return <div style={{ gridArea: zone }} data-testid={`dock-${zone}`} data-collapsed="1" />;
  }
  return (
    <section style={{ gridArea: zone }} data-testid={`dock-${zone}`} data-dock={zone} data-zone={zone} className={cn("relative flex min-h-0 min-w-0 overflow-hidden border-line bg-panel", zone === "left" && "border-e", zone === "right" && "border-s", zone === "bottom" && "border-t")}>
      <TreeView t={t} node={group.root} path="" zone={zone} render={render} hover={hover} dragId={dragId} onTitleDown={onTitleDown} onClose={onClose} onFloat={onFloat} onActivate={onActivate} onSplit={onSplit} onCommand={onCommand} />
      <button type="button" aria-label={t("dock.collapse")} className="absolute end-1 top-1 z-10 inline-flex h-6 w-6 items-center justify-center rounded hover:bg-panel-2" onClick={onCollapse}><Minus className="h-3 w-3" /></button>
      <div className={cn("absolute z-10 bg-transparent", zone === "bottom" ? "inset-x-0 -top-1 h-2 cursor-ns-resize" : zone === "left" ? "inset-y-0 -end-1 w-2 cursor-ew-resize" : "inset-y-0 -start-1 w-2 cursor-ew-resize")} onPointerDown={(event) => { if (event.button === 0) onResize(event); }} />
    </section>
  );
}

function TreeView({
  t, node, path, zone, floatId, render, hover, dragId, onTitleDown, onClose, onFloat, onActivate, onSplit, onCommand,
}: {
  t: (key: string) => string;
  node: DockNode;
  path: string;
  zone: Zone | "float";
  floatId?: string;
  render: (id: PanelId) => ReactNode;
  hover: Hover;
  dragId: PanelId | null;
  onTitleDown: (event: React.PointerEvent, id: PanelId) => void;
  onClose: (id: PanelId) => void;
  onFloat: (id: PanelId) => void;
  onActivate: (path: string, id: PanelId) => void;
  onSplit: SplitHandler;
  onCommand: (id: PanelId, edge: Edge, target?: Zone) => void;
}) {
  if (node.kind === "split") {
    const hot = hover && hover.zone === zone && (hover.floatId || "") === (floatId || "") && hover.path === path ? hover.edge : null;
    return (
      <div data-dock="split" data-path={path} data-zone={zone} data-float={floatId || ""} data-drop={hot || ""} className={cn("relative flex min-h-0 min-w-0 flex-1", node.axis === "x" ? "flex-row" : "flex-col")}>
        {node.children.map((child, index) => {
          const childPath = path ? `${path}.${index}` : String(index);
          return (
            <Fragment key={child.node.id}>
              {index > 0 ? (
                <div
                  role="separator"
                  aria-orientation={node.axis === "x" ? "vertical" : "horizontal"}
                  data-testid="dock-sash"
                  data-axis={node.axis}
                  className="dock-sash"
                  onPointerDown={(event) => {
                    if (event.button !== 0) return;
                    event.preventDefault();
                    event.stopPropagation();
                    const split = event.currentTarget.parentElement;
                    if (!split) return;
                    const panes = [...split.children].filter((el): el is HTMLElement => el instanceof HTMLElement && el.dataset.dockPane === "1");
                    if (panes.length < 2 || !panes[index - 1] || !panes[index]) return;
                    const sizes = panes.map((pane) => (node.axis === "x" ? pane.getBoundingClientRect().width : pane.getBoundingClientRect().height));
                    onSplit(path, index - 1, node.axis, sizes, event);
                  }}
                />
              ) : null}
              <div
                data-dock-pane="1"
                className="flex min-h-0 min-w-0 flex-col overflow-hidden"
                style={{
                  flexGrow: child.size,
                  flexShrink: 1,
                  flexBasis: 0,
                  minWidth: node.axis === "x" ? 48 : 0,
                  minHeight: node.axis === "y" ? 48 : 0,
                }}
              >
                <TreeView t={t} node={child.node} path={childPath} zone={zone} floatId={floatId} render={render} hover={hover} dragId={dragId} onTitleDown={onTitleDown} onClose={onClose} onFloat={onFloat} onActivate={onActivate} onSplit={onSplit} onCommand={onCommand} />
              </div>
            </Fragment>
          );
        })}
      </div>
    );
  }
  const hot = hover && hover.zone === zone && (hover.floatId || "") === (floatId || "") && hover.path === path ? hover.edge : null;
  if (node.vacant && !node.tabs.length) {
    return <div data-dock="tabs" data-vacant="1" data-path={path} data-zone={zone} data-float={floatId || ""} data-drop={hot || ""} className="relative flex min-h-0 min-w-0 flex-1" />;
  }
  return (
    <div data-dock="tabs" data-path={path} data-zone={zone} data-float={floatId || ""} data-drop={hot || ""} className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      <header
        className="flex h-7 shrink-0 cursor-grab items-center gap-1 border-b border-line px-1 active:cursor-grabbing"
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          if ((event.target as HTMLElement).closest("button")) return;
          onTitleDown(event, node.active);
        }}
      >
        {node.tabs.map((id) => (
          <button key={id} type="button" data-tab={id} data-active={node.active === id ? "1" : "0"} data-dragging={dragId === id ? "1" : undefined} aria-label={t(`panel.${id}`)} onClick={() => onActivate(path, id)} onPointerDown={(event) => onTitleDown(event, id)} className={cn("flex h-6 cursor-grab items-center gap-1 whitespace-nowrap rounded px-1 text-xs active:cursor-grabbing", node.active === id ? "bg-panel-2 text-ink" : "text-muted", dragId === id && "opacity-50")}>
            <GripHorizontal className="h-3 w-3" />
            <span className="max-w-24 truncate">{t(`panel.${id}`)}</span>
          </button>
        ))}
        <span className="flex-1" />
        <PanelMenu t={t} id={node.active} onSplit={(edge) => onCommand(node.active, edge)} onMove={(target) => onCommand(node.active, "center", target)} />
        {zone !== "float" ? <button type="button" aria-label={t("dock.float")} className="inline-flex h-6 w-6 items-center justify-center" onClick={() => onFloat(node.active)} onPointerDown={(event) => event.stopPropagation()}><Pin className="h-3 w-3" /></button> : null}
        <button type="button" aria-label={t("dock.close")} className="inline-flex h-6 w-6 items-center justify-center" onClick={() => onClose(node.active)} onPointerDown={(event) => event.stopPropagation()}><X className="h-3 w-3" /></button>
      </header>
      {node.collapsed ? null : <div className={cn("min-h-0 min-w-0 flex-1", node.active === "minimap" ? "overflow-hidden" : "overflow-auto")}>{render(node.active)}</div>}
    </div>
  );
}

function paintDrop(
  host: HTMLElement | null,
  preview: HTMLDivElement | null,
  ghost: HTMLDivElement | null,
  found: Hover,
  clientX: number,
  clientY: number,
  label: string,
  floating: boolean,
) {
  if (!host || !preview || !ghost) return;
  const hostRect = host.getBoundingClientRect();
  if (floating) {
    ghost.dataset.on = "0";
  } else {
    ghost.dataset.on = "1";
    ghost.textContent = label;
    ghost.style.transform = `translate(${clientX - hostRect.left + 12}px, ${clientY - hostRect.top + 8}px)`;
  }
  if (!found) {
    preview.dataset.on = "0";
    return;
  }
  const path = CSS.escape(found.path);
  const zone = CSS.escape(found.zone);
  const floatId = CSS.escape(found.floatId || "");
  const node = host.querySelector<HTMLElement>(`[data-dock="tabs"][data-zone="${zone}"][data-path="${path}"][data-float="${floatId}"]`)
    || host.querySelector<HTMLElement>(`[data-dock][data-zone="${zone}"][data-path="${path}"][data-float="${floatId}"]`);
  if (!node) {
    preview.dataset.on = "0";
    return;
  }
  const rect = node.getBoundingClientRect();
  const box = dropRect({ x: rect.left - hostRect.left, y: rect.top - hostRect.top, w: rect.width, h: rect.height }, found.edge);
  preview.dataset.on = "1";
  preview.dataset.edge = found.edge;
  preview.dataset.kind = found.edge === "center" ? "tab" : "split";
  preview.style.transform = `translate(${box.x}px, ${box.y}px)`;
  preview.style.width = `${box.w}px`;
  preview.style.height = `${box.h}px`;
}

function hideDrop(preview: HTMLDivElement | null, ghost: HTMLDivElement | null) {
  if (preview) preview.dataset.on = "0";
  if (ghost) ghost.dataset.on = "0";
}

function PanelMenu({ t, id, onSplit, onMove }: { t: (key: string) => string; id: PanelId; onSplit: (edge: Edge) => void; onMove: (zone: Zone) => void }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = (focus = true) => {
    setOpen(false);
    if (focus) triggerRef.current?.focus();
  };
  useBoundDismiss(open, () => close(true), () => [rootRef.current]);
  return (
    <div ref={rootRef} className="relative">
      <button ref={triggerRef} type="button" data-testid={`panel-menu-${id}`} aria-label={t("dock.menu")} aria-expanded={open} className="inline-flex h-6 w-6 items-center justify-center" onClick={() => setOpen((value) => !value)} onPointerDown={(event) => event.stopPropagation()}>
        <MoreHorizontal className="h-3.5 w-3.5" />
      </button>
      {open ? (
        <div data-testid="panel-menu" data-overlay="panel-menu" className="absolute end-0 top-7 z-50 grid w-64 rounded-md border border-line bg-panel p-1 text-xs shadow-pop" onPointerDown={(event) => event.stopPropagation()}>
          <button type="button" data-testid="split-right" className="h-7 rounded px-2 text-start hover:bg-panel-2" onClick={() => { setOpen(false); onSplit("right"); }}>{t("dock.splitRight")}</button>
          <button type="button" data-testid="split-down" className="h-7 rounded px-2 text-start hover:bg-panel-2" onClick={() => { setOpen(false); onSplit("bottom"); }}>{t("dock.splitDown")}</button>
          <p className="px-2 pt-1 text-[10px] uppercase text-muted">{t("dock.moveTo")}</p>
          <button type="button" className="h-7 rounded px-2 text-start hover:bg-panel-2" onClick={() => { setOpen(false); onMove("left"); }}>{t("dock.toLeft")}</button>
          <button type="button" className="h-7 rounded px-2 text-start hover:bg-panel-2" onClick={() => { setOpen(false); onMove("right"); }}>{t("dock.toRight")}</button>
          <button type="button" className="h-7 rounded px-2 text-start hover:bg-panel-2" onClick={() => { setOpen(false); onMove("bottom"); }}>{t("dock.toBottom")}</button>
          {id === "minimap" ? (
            <>
              <p className="px-2 pt-1 text-[10px] uppercase text-muted">{t("panel.minimap")}</p>
              <button type="button" data-testid="nav-fit" className="h-7 rounded px-2 text-start hover:bg-panel-2" onClick={() => { setOpen(false); drawCommands.fit(); }}>{t("view.fit")}</button>
              <button type="button" data-testid="nav-shapes" aria-pressed={window.localStorage.getItem("trainer-studio.nav-shapes") !== "0"} className="h-7 rounded px-2 text-start hover:bg-panel-2" onClick={() => { setOpen(false); window.dispatchEvent(new CustomEvent("studio-nav-shapes")); }}>{t("nav.shapes")}</button>
              <button type="button" data-testid="nav-lock" aria-pressed={navLocked()} className="h-7 rounded px-2 text-start hover:bg-panel-2" onClick={() => { const next = !navLocked(); window.localStorage.setItem(NAV_LOCK_KEY, next ? "1" : "0"); setOpen(false); }}>{t("nav.lock")}</button>
              <button type="button" data-testid="nav-dock" className="h-7 rounded px-2 text-start hover:bg-panel-2" onClick={() => { setOpen(false); window.dispatchEvent(new CustomEvent("studio-dock-panel", { detail: "minimap" })); }}>{t("nav.dock")}</button>
              <button type="button" data-testid="nav-reset" className="min-h-7 rounded px-2 py-1 text-start hover:bg-panel-2" onClick={() => { setOpen(false); window.dispatchEvent(new CustomEvent("studio-navigator-reset")); }}>{t("nav.reset")}</button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function FloatGroup({
  t, win, render, hover, dragId, onTitleDown, onClose, onActivate, onResize, onSplit, onCommand,
}: {
  t: (key: string) => string;
  win: FloatWin;
  render: (id: PanelId) => ReactNode;
  hover: Hover;
  dragId: PanelId | null;
  onTitleDown: (event: React.PointerEvent, id: PanelId) => void;
  onClose: (id: PanelId) => void;
  onActivate: (path: string, id: PanelId) => void;
  onResize: (edge: Edge | "top-left" | "top-right" | "bottom-left" | "bottom-right", event: React.PointerEvent) => void;
  onSplit: SplitHandler;
  onCommand: (id: PanelId, edge: Edge, target?: Zone) => void;
}) {
  if (!win.root || !panelsIn(win.root).length) return null;
  const corners = ["top-left", "top-right", "bottom-left", "bottom-right"] as const;
  const dragging = Boolean(dragId && panelsIn(win.root).includes(dragId));
  return (
    <section data-floating={win.id} data-dock-dragging={dragging ? "1" : undefined} data-panels={panelsIn(win.root).join(" ")} data-x={win.x} data-y={win.y} data-w={win.w} data-h={win.h} className={cn("absolute z-40 flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-line bg-panel shadow-pop", dragging && "pointer-events-none opacity-[0.92]")} style={{ left: win.x, top: win.y, width: win.w, height: win.h }}>
      <TreeView t={t} node={win.root} path="" zone="float" floatId={win.id} render={render} hover={hover?.floatId === win.id ? hover : null} dragId={dragId} onTitleDown={onTitleDown} onClose={onClose} onFloat={() => undefined} onActivate={onActivate} onSplit={onSplit} onCommand={onCommand} />
      {(["left", "right", "top", "bottom"] as Edge[]).map((edge) => (
        <div key={edge} className={cn("absolute z-10", edge === "right" && "bottom-2 end-0 top-2 w-1.5 cursor-ew-resize", edge === "left" && "bottom-2 start-0 top-2 w-1.5 cursor-ew-resize", edge === "bottom" && "bottom-0 end-2 start-2 h-1.5 cursor-ns-resize", edge === "top" && "end-2 start-2 top-0 h-1.5 cursor-ns-resize")} onPointerDown={(event) => { if (event.button === 0) { event.stopPropagation(); onResize(edge, event); } }} />
      ))}
      {corners.map((corner) => (
        <div
          key={corner}
          data-testid={`float-corner-${corner}`}
          className={cn("absolute z-20 h-3 w-3", corner === "top-left" && "start-0 top-0 cursor-nwse-resize", corner === "bottom-right" && "bottom-0 end-0 cursor-nwse-resize", corner === "top-right" && "end-0 top-0 cursor-nesw-resize", corner === "bottom-left" && "bottom-0 start-0 cursor-nesw-resize")}
          onPointerDown={(event) => { if (event.button === 0) { event.stopPropagation(); onResize(corner, event); } }}
        />
      ))}
    </section>
  );
}
