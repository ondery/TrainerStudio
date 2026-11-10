export const SHORTCUT_ACTIONS = [
  "undo",
  "redo",
  "palette",
  "copy",
  "paste",
  "delete",
  "selectAll",
  "duplicate",
  "bracketPrev",
  "bracketNext",
  "next",
  "prev",
  "fit",
  "confirm",
  "confirmNext",
  "sidebar",
  "guides",
  "crossCursor",
  "copyPrev",
  "track",
  "skipTask",
  "reviewReject",
  "reviewFix",
  "cycle",
  "cycleBack",
  "acceptGhost",
  "rejectGhost",
  "help",
  "zoom100",
  "zoomIn",
  "zoomOut",
  "zoom200",
  "zoomSelection",
  "floatPanel",
  "propagate",
  "nextUnlabeled",
  "quickOpen",
  "layers",
  "navigator",
  "filmstrip",
  "tool.select",
  "tool.bbox",
  "tool.polygon",
  "tool.pose",
  "tool.obb",
  "tool.sam",
  "tool.pan",
  "export",
  "qc",
  "settings",
  "shortcuts",
  "history",
  "class.1",
  "class.2",
  "class.3",
  "class.4",
  "class.5",
  "class.6",
  "class.7",
  "class.8",
  "class.9",
  "class.10",
  "class.11",
  "class.12",
  "class.13",
  "class.14",
  "class.15",
  "class.16",
  "class.17",
  "class.18",
  "class.19",
  "vehicle.1",
  "vehicle.2",
  "vehicle.3",
  "vehicle.4",
  "vehicle.5",
  "vehicle.6",
  "vehicle.7",
  "vehicle.8",
] as const;

export type ShortcutAction = (typeof SHORTCUT_ACTIONS)[number];

export const DEFAULT_SHORTCUTS: Record<ShortcutAction, string> = {
  undo: "mod+z",
  redo: "mod+shift+z",
  palette: "mod+k",
  copy: "mod+c",
  paste: "mod+v",
  delete: "delete",
  selectAll: "mod+a",
  duplicate: "mod+d",
  bracketPrev: "[",
  bracketNext: "]",
  next: "arrowright",
  prev: "arrowleft",
  fit: "f",
  confirm: "enter",
  confirmNext: "mod+enter",
  sidebar: "mod+b",
  guides: "mod+;",
  crossCursor: "mod+shift+;",
  copyPrev: "c",
  track: "shift+c",
  skipTask: "\\",
  reviewReject: "alt+backspace",
  reviewFix: "mod+shift+enter",
  cycle: "tab",
  cycleBack: "shift+tab",
  acceptGhost: "a",
  rejectGhost: "x",
  help: "f1",
  zoom100: "mod+0",
  zoomIn: "mod+=",
  zoomOut: "mod+-",
  zoom200: "mod+2",
  zoomSelection: "shift+2",
  floatPanel: "mod+shift+f",
  propagate: "mod+shift+v",
  nextUnlabeled: "shift+enter",
  quickOpen: "mod+p",
  layers: "f7",
  navigator: "f8",
  filmstrip: "mod+shift+g",
  "tool.select": "v",
  "tool.bbox": "b",
  "tool.polygon": "g",
  "tool.pose": "p",
  "tool.obb": "o",
  "tool.sam": "m",
  "tool.pan": "h",
  export: "mod+e",
  qc: "mod+q",
  settings: "mod+,",
  shortcuts: "mod+/",
  history: "mod+h",
  "class.1": "1",
  "class.2": "2",
  "class.3": "3",
  "class.4": "4",
  "class.5": "5",
  "class.6": "6",
  "class.7": "7",
  "class.8": "8",
  "class.9": "9",
  "class.10": "q",
  "class.11": "w",
  "class.12": "e",
  "class.13": "r",
  "class.14": "t",
  "class.15": "y",
  "class.16": "u",
  "class.17": "i",
  "class.18": "o",
  "class.19": "p",
  "vehicle.1": "alt+1",
  "vehicle.2": "alt+2",
  "vehicle.3": "alt+3",
  "vehicle.4": "alt+4",
  "vehicle.5": "alt+5",
  "vehicle.6": "alt+6",
  "vehicle.7": "alt+7",
  "vehicle.8": "alt+8",
};

const STORAGE = "trainer-studio.shortcuts";

export type ShortcutContext = {
  tool: string;
  dialog: string;
  paletteOpen: boolean;
  tag: string;
  editable: boolean;
  monacoEdit: boolean;
  hasSelection: boolean;
  projectOpen: boolean;
  classHotkeys: boolean;
  speedClass: boolean;
};

export const DEFAULT_SHORTCUT_CONTEXT: ShortcutContext = {
  tool: "select",
  dialog: "",
  paletteOpen: false,
  tag: "BODY",
  editable: false,
  monacoEdit: false,
  hasSelection: false,
  projectOpen: true,
  classHotkeys: true,
  speedClass: false,
};

export type ShortcutScope = "app" | "canvas" | "class" | "nav" | "vehicle" | "confirm";

const CLASS_SCOPE: ShortcutScope = "class";
const VEHICLE_SCOPE: ShortcutScope = "vehicle";

export const SHORTCUT_SCOPE: Partial<Record<ShortcutAction, ShortcutScope>> = {
  next: "nav",
  prev: "nav",
  confirmNext: "confirm",
  "class.1": CLASS_SCOPE,
  "class.2": CLASS_SCOPE,
  "class.3": CLASS_SCOPE,
  "class.4": CLASS_SCOPE,
  "class.5": CLASS_SCOPE,
  "class.6": CLASS_SCOPE,
  "class.7": CLASS_SCOPE,
  "class.8": CLASS_SCOPE,
  "class.9": CLASS_SCOPE,
  "class.10": CLASS_SCOPE,
  "class.11": CLASS_SCOPE,
  "class.12": CLASS_SCOPE,
  "class.13": CLASS_SCOPE,
  "class.14": CLASS_SCOPE,
  "class.15": CLASS_SCOPE,
  "class.16": CLASS_SCOPE,
  "class.17": CLASS_SCOPE,
  "class.18": CLASS_SCOPE,
  "class.19": CLASS_SCOPE,
  "vehicle.1": VEHICLE_SCOPE,
  "vehicle.2": VEHICLE_SCOPE,
  "vehicle.3": VEHICLE_SCOPE,
  "vehicle.4": VEHICLE_SCOPE,
  "vehicle.5": VEHICLE_SCOPE,
  "vehicle.6": VEHICLE_SCOPE,
  "vehicle.7": VEHICLE_SCOPE,
  "vehicle.8": VEHICLE_SCOPE,
};

const EXCLUSIVE_SCOPES = new Set(["nav|vehicle"]);

export function shortcutScope(action: ShortcutAction): ShortcutScope {
  return SHORTCUT_SCOPE[action] || "app";
}

export function scopesOverlap(left: ShortcutScope, right: ShortcutScope): boolean {
  if (left === right) return true;
  const key = [left, right].sort().join("|");
  return !EXCLUSIVE_SCOPES.has(key);
}

export function bindingConflicts(map: Record<ShortcutAction, string>, action: ShortcutAction, combo: string): boolean {
  const scope = shortcutScope(action);
  for (const other of SHORTCUT_ACTIONS) {
    if (other === action) continue;
    if (map[other] !== combo) continue;
    if (scopesOverlap(scope, shortcutScope(other))) return true;
  }
  return false;
}

export function conflictedActions(map: Record<ShortcutAction, string>): Set<ShortcutAction> {
  const found = new Set<ShortcutAction>();
  for (let index = 0; index < SHORTCUT_ACTIONS.length; index += 1) {
    const left = SHORTCUT_ACTIONS[index];
    for (let next = index + 1; next < SHORTCUT_ACTIONS.length; next += 1) {
      const right = SHORTCUT_ACTIONS[next];
      if (map[left] !== map[right]) continue;
      if (!scopesOverlap(shortcutScope(left), shortcutScope(right))) continue;
      found.add(left);
      found.add(right);
    }
  }
  return found;
}

function fieldFocused(ctx: ShortcutContext): boolean {
  if (ctx.editable || ctx.monacoEdit) return true;
  const tag = ctx.tag.toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export function shortcutActive(action: ShortcutAction, ctx: ShortcutContext): boolean {
  const scope = shortcutScope(action);
  if (scope === "confirm") return !ctx.monacoEdit;
  if (fieldFocused(ctx)) return false;
  if (scope === "app") return true;
  if (ctx.dialog || ctx.paletteOpen) return false;
  if (scope === "class") return ctx.classHotkeys;
  if (scope === "nav") return (ctx.tool === "select" || ctx.tool === "pan") && !ctx.hasSelection;
  if (scope === "vehicle") return ctx.speedClass;
  return true;
}

export function formatCombo(combo: string): string {
  return combo
    .split("+")
    .map((part) => {
      if (part === "mod") return "Ctrl";
      if (part === "shift") return "Shift";
      if (part === "alt") return "Alt";
      if (part === "arrowleft") return "Left";
      if (part === "arrowright") return "Right";
      if (part === "arrowup") return "Up";
      if (part === "arrowdown") return "Down";
      if (part.length === 1) return part.toUpperCase();
      return part.slice(0, 1).toUpperCase() + part.slice(1);
    })
    .join("+");
}

export function comboFromEvent(event: KeyboardEvent): string {
  const parts: string[] = [];
  if (event.metaKey || event.ctrlKey) parts.push("mod");
  if (event.altKey) parts.push("alt");
  if (event.shiftKey) parts.push("shift");
  let key = event.key.toLowerCase();
  if (key === " ") key = "space";
  parts.push(key);
  return parts.join("+");
}

export function loadShortcuts(): Record<ShortcutAction, string> {
  const next = { ...DEFAULT_SHORTCUTS };
  if (typeof window === "undefined") return next;
  try {
    const raw = JSON.parse(window.localStorage.getItem(STORAGE) || "{}") as Record<string, string>;
    for (const action of SHORTCUT_ACTIONS) {
      if (typeof raw[action] === "string" && raw[action]) next[action] = raw[action];
    }
  } catch {
    /* keep defaults */
  }
  return next;
}

export function saveShortcuts(map: Record<ShortcutAction, string>) {
  window.localStorage.setItem(STORAGE, JSON.stringify(map));
  window.dispatchEvent(new Event("studio-shortcuts"));
}

function aliasAction(combo: string, map: Record<ShortcutAction, string>, event: KeyboardEvent): ShortcutAction | null {
  if (combo === "mod+y" && (map.redo === "mod+shift+z" || map.redo === "mod+y")) return "redo";
  if (combo === "backspace" && map.delete === "delete") return "delete";
  if (combo === "mod+1" && map.zoom100 === "mod+0") return "zoom100";
  if ((combo === "mod++" || combo === "mod+shift++") && map.zoomIn === "mod+=") return "zoomIn";
  if (combo === "mod+shift+p" && map.palette === "mod+k") return "palette";
  if ((event.key === "?" || event.key === "F1") && map.help === "f1") return "help";
  return null;
}

export function matchAction(
  event: KeyboardEvent,
  map: Record<ShortcutAction, string> = loadShortcuts(),
  ctx: ShortcutContext = DEFAULT_SHORTCUT_CONTEXT,
): ShortcutAction | null {
  const combo = comboFromEvent(event);
  for (const action of SHORTCUT_ACTIONS) {
    if (map[action] !== combo) continue;
    if (!shortcutActive(action, ctx)) continue;
    return action;
  }
  const alias = aliasAction(combo, map, event);
  if (alias && shortcutActive(alias, ctx)) return alias;
  return null;
}
