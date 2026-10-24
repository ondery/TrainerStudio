/** Serializable 12-track workspace and the named shell grid. Sizes snap to 8px. */

import type { Edge } from "./dock-model";

export const PANELS = [
  "explorer",
  "images",
  "classes",
  "filmstrip",
  "layers",
  "properties",
  "attributes",
  "history",
  "stats",
  "model",
  "minimap",
  "console",
  "raw",
] as const;

export type PanelId = (typeof PANELS)[number];
export type Zone = "left" | "right" | "bottom";
export type BreakpointName = "1366" | "1920" | "2560" | "3354";

export const BREAKPOINTS: BreakpointName[] = ["1366", "1920", "2560", "3354"];

export type Band = { tabs: PanelId[]; active: PanelId; collapsed: boolean; size: number };
export type Column = { bands: Band[] };
export type TabNode = { kind: "tabs"; id: string; tabs: PanelId[]; active: PanelId; collapsed: boolean; vacant?: boolean };
export type SplitNode = { kind: "split"; id: string; axis: "x" | "y"; children: { size: number; node: DockNode }[] };
export type DockNode = TabNode | SplitNode;

let dockSeq = 1;

export function dockId(prefix = "n"): string {
  dockSeq += 1;
  return `${prefix}${dockSeq.toString(36)}`;
}

export function tabsNode(tabs: PanelId[], id = dockId("t")): TabNode {
  return { kind: "tabs", id, tabs: [...tabs], active: tabs[0], collapsed: false };
}

/** Empty half that can still be stored in an old layout. A drop never creates one. */
export function vacantNode(): TabNode {
  return { kind: "tabs", id: dockId("v"), tabs: [], active: "explorer", collapsed: false, vacant: true };
}

export function panelsIn(node: DockNode | null | undefined): PanelId[] {
  if (!node) return [];
  if (node.kind === "tabs") return [...node.tabs];
  return node.children.flatMap((child) => panelsIn(child.node));
}

export function shownTabs(node: DockNode | null | undefined): PanelId[] {
  if (!node) return [];
  if (node.kind === "tabs") return node.collapsed ? [] : [node.active];
  return node.children.flatMap((child) => shownTabs(child.node));
}

export function nodeFromColumns(columns: Column[]): DockNode | null {
  const columnNodes: DockNode[] = [];
  for (const column of columns) {
    const bands = column.bands.filter((item) => item.tabs.length);
    if (!bands.length) continue;
    const leaves = bands.map((item) => ({
      kind: "tabs" as const,
      id: dockId("t"),
      tabs: [...item.tabs],
      active: item.tabs.includes(item.active) ? item.active : item.tabs[0],
      collapsed: Boolean(item.collapsed),
    }));
    columnNodes.push(leaves.length === 1 ? leaves[0] : { kind: "split", id: dockId("y"), axis: "y", children: leaves.map((node, index) => ({ size: bands[index].size || 1, node })) });
  }
  if (!columnNodes.length) return null;
  if (columnNodes.length === 1) return columnNodes[0];
  return { kind: "split", id: dockId("x"), axis: "x", children: columnNodes.map((node) => ({ size: 1, node })) };
}

export function columnsFromNode(node: DockNode | null | undefined): Column[] {
  const bands: Band[] = [];
  const walk = (current: DockNode) => {
    if (current.kind === "tabs") {
      if (current.vacant && !current.tabs.length) return;
      bands.push({ tabs: [...current.tabs], active: current.active, collapsed: current.collapsed, size: 160 });
      return;
    }
    for (const child of current.children) walk(child.node);
  };
  if (node) walk(node);
  return bands.length ? [{ bands }] : [];
}

export function stripNode(node: DockNode | null | undefined, panel: PanelId): DockNode | null {
  if (!node) return null;
  if (node.kind === "tabs") {
    if (node.vacant && !node.tabs.includes(panel)) return node;
    const tabs = node.tabs.filter((id) => id !== panel);
    if (!tabs.length) return node.vacant ? { ...node, tabs: [], vacant: true } : null;
    return { ...node, tabs, active: tabs.includes(node.active) ? node.active : tabs[0], vacant: false };
  }
  const children = node.children.flatMap((child) => {
    const next = stripNode(child.node, panel);
    return next ? [{ ...child, node: next }] : [];
  });
  if (!children.length) return null;
  if (children.length === 1) return children[0].node;
  return { ...node, children };
}

function axisFor(edge: Edge): "x" | "y" {
  return edge === "left" || edge === "right" ? "x" : "y";
}

function mergeHere(node: DockNode, edge: Edge, fresh: TabNode): DockNode {
  if (edge === "center") {
    if (node.kind === "tabs") return { ...node, tabs: [...node.tabs, fresh.tabs[0]], active: fresh.tabs[0], collapsed: false, vacant: false };
    const at = Math.ceil(node.children.length / 2);
    const children = [...node.children];
    children.splice(at, 0, { size: 1, node: fresh });
    return { ...node, children };
  }
  const axis = axisFor(edge);
  if (node.kind === "split" && node.axis === axis) {
    const children = [...node.children];
    const at = edge === "left" || edge === "top" ? 0 : children.length;
    children.splice(at, 0, { size: 1, node: fresh });
    return { ...node, children };
  }
  const first = edge === "left" || edge === "top";
  return { kind: "split", id: dockId(axis), axis, children: [{ size: 1, node: first ? fresh : node }, { size: 1, node: first ? node : fresh }] };
}

function insertAt(node: DockNode, indexes: number[], edge: Edge, fresh: TabNode): DockNode {
  if (!indexes.length || node.kind !== "split") return mergeHere(node, edge, fresh);
  const index = Math.min(indexes[0], node.children.length - 1);
  const axis = axisFor(edge);
  if (indexes.length === 1 && edge !== "center" && node.axis === axis) {
    const at = edge === "left" || edge === "top" ? index : index + 1;
    const children = [...node.children];
    children.splice(at, 0, { size: 1, node: fresh });
    return { ...node, children };
  }
  const children = node.children.map((child, childIndex) => (childIndex === index ? { ...child, node: insertAt(child.node, indexes.slice(1), edge, fresh) } : child));
  return { ...node, children };
}

export function placeNode(node: DockNode | null | undefined, panel: PanelId, path: string, edge: Edge): DockNode {
  const base = stripNode(node, panel);
  const fresh = tabsNode([panel]);
  // Removing the only panel leaves nothing to split. VS Code refuses that drop
  // (`editorDropTarget.ts`: do not drop on itself if it results in an empty group).
  if (!base) return fresh;
  const indexes = path.split(".").map(Number).filter((part) => Number.isInteger(part) && part >= 0);
  return insertAt(base, path.trim() ? indexes : [], edge, fresh);
}

export function nodeAt(node: DockNode | null | undefined, path: string): DockNode | null {
  if (!node) return null;
  if (!path) return node;
  let current = node;
  for (const index of path.split(".").map(Number)) {
    if (current.kind !== "split" || !current.children[index]) return null;
    current = current.children[index].node;
  }
  return current;
}

/** Same group, and this panel is its only one. Dropping there would empty the group. */
export function refusesSelfDrop(node: DockNode | null | undefined, panel: PanelId): boolean {
  if (!node) return false;
  const panels = panelsIn(node);
  return panels.length < 2 && panels.includes(panel);
}

/** Center on a singleton is refused. An edge is allowed when the zone still has siblings after the tear. */
export function allowsDrop(node: DockNode | null | undefined, panel: PanelId, edge: Edge, zoneCount: number): boolean {
  if (!refusesSelfDrop(node, panel)) return true;
  if (edge === "center") return false;
  return zoneCount > 1;
}

export function pathOf(node: DockNode | null | undefined, panel: PanelId, path = ""): string | null {
  if (!node) return null;
  if (node.kind === "tabs") return node.tabs.includes(panel) ? path : null;
  for (let index = 0; index < node.children.length; index += 1) {
    const childPath = path ? `${path}.${index}` : String(index);
    const found = pathOf(node.children[index].node, panel, childPath);
    if (found !== null) return found;
  }
  return null;
}

export function activateNode(node: DockNode, path: string, panel: PanelId): DockNode {
  const indexes = path.split(".").filter(Boolean).map(Number);
  const visit = (current: DockNode, rest: number[]): DockNode => {
    if (!rest.length || current.kind === "tabs") {
      if (current.kind !== "tabs" || !current.tabs.includes(panel)) return current;
      return { ...current, active: panel, collapsed: false };
    }
    return { ...current, children: current.children.map((child, index) => (index === rest[0] ? { ...child, node: visit(child.node, rest.slice(1)) } : child)) };
  };
  return visit(node, indexes);
}

export function resizeChild(node: DockNode, path: string, sizes: number[]): DockNode {
  const indexes = path.split(".").filter(Boolean).map(Number);
  const visit = (current: DockNode, rest: number[]): DockNode => {
    if (current.kind !== "split") return current;
    if (!rest.length) {
      return {
        ...current,
        children: current.children.map((child, childIndex) => ({
          ...child,
          size: Math.max(1, sizes[childIndex] ?? child.size),
        })),
      };
    }
    return { ...current, children: current.children.map((child, childIndex) => (childIndex === rest[0] ? { ...child, node: visit(child.node, rest.slice(1)) } : child)) };
  };
  return visit(node, indexes);
}

export function depthOf(node: DockNode | null | undefined): number {
  if (!node || node.kind === "tabs") return 1;
  return 1 + Math.max(0, ...node.children.map((child) => depthOf(child.node)));
}

export function scrubNode(node: DockNode | null | undefined, claim: (id: PanelId) => boolean): DockNode | null {
  if (!node) return null;
  if (node.kind === "tabs") {
    if (node.vacant && !node.tabs.length) return node;
    const tabs = node.tabs.filter(claim);
    if (!tabs.length) return null;
    return { ...node, tabs, active: tabs.includes(node.active) ? node.active : tabs[0], vacant: false };
  }
  const children = node.children.flatMap((child) => {
    const next = scrubNode(child.node, claim);
    return next ? [{ size: Math.max(1, child.size || 1), node: next }] : [];
  });
  if (!children.length) return null;
  if (children.length === 1) return children[0].node;
  return { ...node, children };
}

export function parseNode(value: unknown): DockNode | null {
  if (!value || typeof value !== "object") return null;
  const row = value as { kind?: string; id?: string; tabs?: unknown; active?: unknown; collapsed?: unknown; axis?: string; children?: unknown; vacant?: unknown };
  if (row.kind === "tabs" && Array.isArray(row.tabs) && typeof row.id === "string") {
    const tabs = row.tabs.filter(isPanel);
    if (!tabs.length) {
      if (!row.vacant) return null;
      return { kind: "tabs", id: row.id, tabs: [], active: "explorer", collapsed: false, vacant: true };
    }
    return { kind: "tabs", id: row.id, tabs, active: tabs.includes(row.active as PanelId) ? (row.active as PanelId) : tabs[0], collapsed: Boolean(row.collapsed) };
  }
  if (row.kind === "split" && (row.axis === "x" || row.axis === "y") && Array.isArray(row.children) && typeof row.id === "string") {
    const children = row.children.flatMap((child) => {
      if (!child || typeof child !== "object") return [];
      const item = child as { size?: unknown; node?: unknown };
      const node = parseNode(item.node);
      if (!node) return [];
      const size = typeof item.size === "number" && item.size > 0 ? item.size : 1;
      return [{ size, node }];
    });
    if (children.length < 2) return children[0]?.node || null;
    return { kind: "split", id: row.id, axis: row.axis, children };
  }
  return null;
}

export type Group = { tabs: PanelId[]; active: PanelId; size: number; collapsed: boolean; columns: Column[]; root: DockNode | null };
export type FloatWin = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  col: number;
  row: number;
  colSpan: number;
  rowSpan: number;
  columns: Column[];
  root: DockNode | null;
};
export type Span = { left: number; right: number; bottom: number };
export type Tracks = { palette: number; menu: number; toolbar: number; status: number };
export type ShellTemplate = { columns: string[]; rows: string[]; areas: string[] };

export type Layout = {
  left: Group;
  right: Group;
  bottom: Group;
  floating: FloatWin[];
  hidden: PanelId[];
  gridSize: number;
  columns: number;
  rows: number;
  gap: number;
  showGrid: boolean;
  tracks: Tracks;
  spans: Record<BreakpointName, Span>;
  templates: Record<BreakpointName, ShellTemplate>;
};

export const LAYOUT_KEY = "trainer-studio.layout";

const ALL = new Set<PanelId>(PANELS);

export const DEFAULT_TRACKS: Tracks = { palette: 40, menu: 40, toolbar: 40, status: 32 };

export const DEFAULT_SPANS: Record<BreakpointName, Span> = {
  "1366": { left: 3, right: 3, bottom: 3 },
  "1920": { left: 2, right: 2, bottom: 2 },
  "2560": { left: 2, right: 2, bottom: 2 },
  "3354": { left: 2, right: 2, bottom: 2 },
};

export function band(tabs: PanelId[], size = 1): Band {
  return { tabs, active: tabs[0], collapsed: false, size };
}

export function columnsFrom(tabs: PanelId[]): Column[] {
  if (!tabs.length) return [];
  return [{ bands: [band(tabs)] }];
}

function group(tabs: PanelId[], size: number): Group {
  const root = tabs.length ? tabsNode(tabs) : null;
  return { tabs, active: tabs[0], size, collapsed: false, columns: columnsFrom(tabs), root };
}

export function snap(value: number, grid = 8): number {
  const step = grid > 0 ? grid : 8;
  return Math.round(value / step) * step;
}

export function breakpointFor(width: number): BreakpointName {
  if (width >= 3354) return "3354";
  if (width >= 2560) return "2560";
  if (width >= 1920) return "1920";
  return "1366";
}

export function clampSpan(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function buildTemplates(tracks: Tracks): Record<BreakpointName, ShellTemplate> {
  const palette = snap(tracks.palette || 40);
  const status = snap(tracks.status || 32);
  return {
    "1366": {
      columns: [`${palette}px`, "minmax(0, 1fr)"],
      rows: ["auto", "minmax(0, 1fr)", `${status}px`],
      areas: ["menu menu", "palette workspace", "status status"],
    },
    "1920": {
      columns: [`${palette}px`, "minmax(0, 1fr)"],
      rows: ["auto", "minmax(0, 1fr)", `${status}px`],
      areas: ["menu menu", "palette workspace", "status status"],
    },
    "2560": {
      columns: [`${palette + 8}px`, "minmax(0, 1fr)", "minmax(0, 1fr)"],
      rows: ["auto", "minmax(0, 1fr)", `${status}px`],
      areas: ["menu menu menu", "palette workspace workspace", "status status status"],
    },
    "3354": {
      columns: [`${palette + 8}px`, "minmax(0, 2fr)", "minmax(0, 1fr)", "minmax(0, 1fr)"],
      rows: ["auto", "minmax(0, 1fr)", `${status + 8}px`],
      areas: [
        "menu menu menu menu",
        "palette workspace workspace workspace",
        "status status status status",
      ],
    },
  };
}

export function workspaceAreas(left: number, right: number, bottom: number, rtl = false): string[] {
  const l = clampSpan(left, 0, 6);
  const r = clampSpan(right, 0, Math.max(0, 10 - l));
  const b = clampSpan(bottom, 0, 6);
  const mid = 12 - l - r;
  const bodyRows = 12 - b;
  const body = rtl
    ? [...Array(r).fill("right"), ...Array(mid).fill("canvas"), ...Array(l).fill("left")]
    : [...Array(l).fill("left"), ...Array(mid).fill("canvas"), ...Array(r).fill("right")];
  const foot = Array(12).fill("bottom");
  const areas: string[] = [];
  for (let index = 0; index < bodyRows; index += 1) areas.push(body.join(" "));
  for (let index = 0; index < b; index += 1) areas.push(foot.join(" "));
  return areas;
}

export function templateHas(template: ShellTemplate, area: string): boolean {
  return template.areas.some((row) => row.split(" ").includes(area));
}

/** Drop a saved toolbar row so the canvas keeps the height after the options bar went away. */
export function withoutToolbar(template: ShellTemplate): ShellTemplate {
  const rows = template.rows.map((row, index) => {
    const cells = template.areas[index]?.split(/\s+/).filter(Boolean) ?? [];
    if (cells.length > 0 && cells.every((cell) => cell === "menu")) return "auto";
    return row;
  });
  const hugged = rows.some((row, index) => row !== template.rows[index]) ? { ...template, rows } : template;
  const keep: number[] = [];
  const areas = hugged.areas.filter((row, index) => {
    const cells = row.split(/\s+/).filter(Boolean);
    const drop = cells.length > 0 && cells.every((cell) => cell === "toolbar");
    if (!drop) keep.push(index);
    return !drop;
  });
  if (areas.length === hugged.areas.length) return hugged;
  return { ...hugged, areas, rows: hugged.rows.filter((_, index) => keep.includes(index)) };
}

export function cellsToBox(col: number, row: number, colSpan: number, rowSpan: number) {
  return { x: (col - 1) * 8, y: (row - 1) * 8, w: colSpan * 8, h: rowSpan * 8 };
}

function spansFor(name: string): Record<BreakpointName, Span> {
  const spans: Record<BreakpointName, Span> = {
    "1366": { ...DEFAULT_SPANS["1366"] },
    "1920": { ...DEFAULT_SPANS["1920"] },
    "2560": { ...DEFAULT_SPANS["2560"] },
    "3354": { ...DEFAULT_SPANS["3354"] },
  };
  if (name === "labeling") spans["1920"] = { left: 2, right: 3, bottom: 2 };
  if (name === "review") spans["1920"] = { left: 3, right: 3, bottom: 2 };
  if (name === "training") spans["1920"] = { left: 2, right: 3, bottom: 2 };
  return spans;
}

export function preset(name: string): Layout {
  const tracks = { ...DEFAULT_TRACKS };
  const base = {
    floating: [] as FloatWin[],
    hidden: [] as PanelId[],
    gridSize: 8,
    columns: 12,
    rows: 12,
    gap: 8,
    showGrid: false,
    tracks,
    spans: spansFor(name),
    templates: buildTemplates(tracks),
  };
  if (name === "labeling") {
    return {
      ...base,
      left: group(["explorer", "classes", "images"], 320),
      right: group(["properties", "attributes", "layers"], 320),
      bottom: group(["history"], 140),
      hidden: ["filmstrip", "stats", "model", "minimap", "console", "raw"],
    };
  }
  if (name === "review") {
    return {
      ...base,
      left: group(["explorer", "images"], 320),
      right: group(["layers", "stats", "history"], 320),
      bottom: group(["console"], 120),
      hidden: ["classes", "filmstrip", "properties", "attributes", "model", "minimap", "raw"],
    };
  }
  if (name === "training") {
    return {
      ...base,
      left: group(["explorer", "images"], 320),
      right: group(["model", "console", "stats"], 360),
      bottom: group(["history"], 120),
      hidden: ["classes", "filmstrip", "layers", "properties", "attributes", "minimap", "raw"],
    };
  }
  return {
    ...base,
    left: group(["explorer", "images", "classes"], 320),
    right: group(["layers", "properties", "attributes"], 320),
    bottom: group(["history", "console"], 140),
    hidden: ["filmstrip", "stats", "model", "minimap", "raw"],
  };
}

export function normalize(raw: unknown): Layout {
  const fallback = preset("default");
  if (!raw || typeof raw !== "object") return fallback;
  const value = raw as Partial<Layout>;
  const tracks = cleanTracks(value.tracks);
  const layout: Layout = {
    ...fallback,
    ...value,
    left: cleanGroup(value.left, fallback.left),
    right: cleanGroup(value.right, fallback.right),
    bottom: cleanGroup(value.bottom, fallback.bottom),
    floating: Array.isArray(value.floating) ? value.floating.map(cleanFloat).filter((item): item is FloatWin => item !== null) : [],
    hidden: Array.isArray(value.hidden) ? value.hidden.filter(isPanel) : [],
    gridSize: 8,
    columns: 12,
    rows: 12,
    gap: snap(numberOr(value.gap, 8)) || 8,
    showGrid: value.showGrid === true,
    tracks,
    spans: cleanSpans(value.spans),
    templates: validTemplates(value.templates) || buildTemplates(tracks),
  };
  const seen = new Set<PanelId>();
  const claim = (id: PanelId) => {
    if (!isPanel(id) || seen.has(id)) return false;
    seen.add(id);
    return true;
  };
  const apply = (group: Group): Group => {
    const root = scrubNode(group.root || nodeFromColumns(group.columns), claim);
    if (!root || !panelsIn(root).length) return { ...group, tabs: [], columns: [], root: null };
    const tabs = panelsIn(root);
    return { ...group, root, tabs, columns: columnsFromNode(root), active: tabs.includes(group.active) ? group.active : tabs[0] };
  };
  layout.left = apply(layout.left);
  layout.right = apply(layout.right);
  layout.bottom = apply(layout.bottom);
  layout.floating = layout.floating.flatMap((item) => {
    const root = scrubNode(item.root || nodeFromColumns(item.columns), claim);
    if (!root || !panelsIn(root).length) return [];
    return [{ ...item, root, columns: columnsFromNode(root) }];
  });
  layout.hidden = layout.hidden.filter((id) => {
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  for (const id of PANELS) {
    if (!seen.has(id)) layout.hidden.push(id);
  }
  return layout;
}

function cleanTracks(value: Tracks | undefined): Tracks {
  return {
    palette: snap(numberOr(value?.palette, DEFAULT_TRACKS.palette)) || 40,
    menu: snap(numberOr(value?.menu, DEFAULT_TRACKS.menu)) || 40,
    toolbar: snap(numberOr(value?.toolbar, DEFAULT_TRACKS.toolbar)) || 40,
    status: snap(numberOr(value?.status, DEFAULT_TRACKS.status)) || 32,
  };
}

function cleanSpans(value: Partial<Record<BreakpointName, Span>> | undefined): Record<BreakpointName, Span> {
  const spans = {} as Record<BreakpointName, Span>;
  for (const name of BREAKPOINTS) {
    const raw = value?.[name];
    const left = clampSpan(numberOr(raw?.left, DEFAULT_SPANS[name].left), 0, 6);
    const right = clampSpan(numberOr(raw?.right, DEFAULT_SPANS[name].right), 0, Math.max(0, 10 - left));
    const bottom = clampSpan(numberOr(raw?.bottom, DEFAULT_SPANS[name].bottom), 0, 6);
    spans[name] = { left, right, bottom };
  }
  return spans;
}

function validTemplates(value: unknown): Record<BreakpointName, ShellTemplate> | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Partial<Record<BreakpointName, ShellTemplate>>;
  const templates = {} as Record<BreakpointName, ShellTemplate>;
  for (const name of BREAKPOINTS) {
    const item = source[name];
    if (!item || !Array.isArray(item.columns) || !Array.isArray(item.rows) || !Array.isArray(item.areas)) return null;
    if (item.areas.length !== item.rows.length || item.columns.length < 1) return null;
    const width = item.columns.length;
    if (item.areas.some((row) => typeof row !== "string" || row.split(" ").length !== width)) return null;
    templates[name] = {
      columns: item.columns.map(String),
      rows: item.rows.map(String),
      areas: item.areas.map(String),
    };
  }
  return templates;
}

function cleanBand(value: unknown): Band | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<Band>;
  const tabs = Array.isArray(row.tabs) ? row.tabs.filter(isPanel) : [];
  if (!tabs.length) return null;
  return {
    tabs,
    active: tabs.includes(row.active as PanelId) ? (row.active as PanelId) : tabs[0],
    collapsed: Boolean(row.collapsed),
    size: Math.max(48, numberOr(row.size, 160)),
  };
}

function cleanColumns(value: unknown, tabs: PanelId[], active: PanelId): Column[] {
  const columns: Column[] = [];
  if (Array.isArray(value)) {
    for (const column of value) {
      const bands = Array.isArray((column as Column)?.bands) ? (column as Column).bands.map(cleanBand).filter((item): item is Band => item !== null) : [];
      if (bands.length) columns.push({ bands });
    }
  }
  if (!columns.length && tabs.length) return [{ bands: [{ tabs, active, collapsed: false, size: 160 }] }];
  return columns;
}

function flatTabs(columns: Column[]): PanelId[] {
  const tabs: PanelId[] = [];
  for (const column of columns) {
    for (const item of column.bands) tabs.push(...item.tabs);
  }
  return tabs;
}

function packGroup(value: Partial<Group>, root: DockNode, fallback: Group): Group {
  const tabs = panelsIn(root);
  const active = tabs.includes(value.active as PanelId) ? (value.active as PanelId) : tabs[0];
  return {
    tabs,
    active,
    size: Math.max(120, numberOr(value.size, fallback.size)),
    collapsed: Boolean(value.collapsed),
    columns: columnsFromNode(root),
    root,
  };
}

function cleanGroup(value: Group | undefined, fallback: Group): Group {
  if (!value || (!Array.isArray(value.tabs) && !Array.isArray(value.columns) && !value.root)) return fallback;
  const seed = Array.isArray(value.tabs) ? value.tabs.filter(isPanel) : [];
  const columns = cleanColumns(value.columns, seed, seed.includes(value.active) ? value.active : seed[0]);
  const root = parseNode(value.root) || nodeFromColumns(columns);
  if (!root) return { ...fallback, tabs: [], columns: [], root: null, collapsed: true, size: value.size || fallback.size };
  return packGroup(value, root, fallback);
}

function isPanel(value: unknown): value is PanelId {
  return typeof value === "string" && ALL.has(value as PanelId);
}

function cleanFloat(value: unknown): FloatWin | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<FloatWin>;
  const fromId = isPanel(row.id) ? [row.id] : [];
  const columns = cleanColumns(row.columns, fromId, fromId[0]);
  const root = parseNode((row as { root?: unknown }).root) || nodeFromColumns(columns);
  if (!root) return null;
  const id = typeof row.id === "string" && row.id ? row.id : panelsIn(root)[0];
  const x = Math.max(0, numberOr(row.x, 48));
  const y = Math.max(0, numberOr(row.y, 48));
  const w = Math.max(160, numberOr(row.w, 320));
  const h = Math.max(120, numberOr(row.h, 240));
  return { id, x, y, w, h, col: 1, row: 1, colSpan: 1, rowSpan: 1, columns: columnsFromNode(root), root };
}

function numberOr(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function loadLayout(): Layout {
  if (typeof window === "undefined") return preset("default");
  try {
    return normalize(JSON.parse(window.localStorage.getItem(LAYOUT_KEY) || ""));
  } catch {
    return preset("default");
  }
}

export function saveLayout(layout: Layout) {
  window.localStorage.setItem(LAYOUT_KEY, JSON.stringify(normalize(layout)));
}

export function withRoot(group: Group, root: DockNode | null, collapsed = group.collapsed): Group {
  if (!root || !panelsIn(root).length) return { ...group, tabs: [], columns: [], root: null, collapsed };
  const tabs = panelsIn(root);
  const shown = shownTabs(root);
  const active = shown.includes(group.active) ? group.active : shown[0] || (tabs.includes(group.active) ? group.active : tabs[0]);
  return { ...group, root, tabs, columns: columnsFromNode(root), active, collapsed };
}

export function movePanel(layout: Layout, panel: PanelId, dest: { zone: Zone | "float"; floatId?: string; path: string; edge: Edge }): Layout {
  const left = withRoot(layout.left, stripNode(layout.left.root, panel));
  const right = withRoot(layout.right, stripNode(layout.right.root, panel));
  const bottom = withRoot(layout.bottom, stripNode(layout.bottom.root, panel));
  const floating = layout.floating.flatMap((win) => {
    if (dest.zone === "float" && dest.floatId === win.id) return [];
    const root = stripNode(win.root, panel);
    if (!root || !panelsIn(root).length) return [];
    return [{ ...win, root, columns: columnsFromNode(root) }];
  });
  const hidden = layout.hidden.filter((id) => id !== panel);
  if (dest.zone === "float" && dest.floatId) {
    const win = layout.floating.find((item) => item.id === dest.floatId);
    if (!win?.root) return { ...layout, left, right, bottom, floating, hidden };
    const root = placeNode(win.root, panel, dest.path, dest.edge);
    return { ...layout, left, right, bottom, hidden, floating: [...floating, { ...win, root, columns: columnsFromNode(root) }] };
  }
  if (dest.zone === "left" || dest.zone === "right" || dest.zone === "bottom") {
    const original = layout[dest.zone];
    const rooted = withRoot(original, placeNode(original.root, panel, dest.path, dest.edge));
    return { ...layout, left, right, bottom, floating, hidden, [dest.zone]: { ...rooted, collapsed: false, size: original.size } };
  }
  return { ...layout, left, right, bottom, floating, hidden };
}

export function placed(layout: Layout): Set<PanelId> {
  const ids = new Set<PanelId>();
  for (const group of [layout.left, layout.right, layout.bottom]) {
    for (const id of panelsIn(group.root)) ids.add(id);
    if (!group.root) for (const id of group.tabs) ids.add(id);
  }
  for (const item of layout.floating) {
    for (const id of panelsIn(item.root)) ids.add(id);
    if (!item.root) for (const id of flatTabs(item.columns || [])) ids.add(id);
  }
  return ids;
}

export function zoneSpan(group: Group, span: number, hot: boolean): number {
  if (!group.tabs.length || group.collapsed) return hot ? 1 : 0;
  return clampSpan(span, 1, 6);
}
