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
}

export function matchAction(event: KeyboardEvent, map: Record<ShortcutAction, string> = loadShortcuts()): ShortcutAction | null {
  const combo = comboFromEvent(event);
  for (const action of SHORTCUT_ACTIONS) {
    if (map[action] === combo) return action;
  }
  if (combo === "mod+y" && (map.redo === "mod+shift+z" || map.redo === "mod+y")) return "redo";
  if (combo === "backspace" && map.delete === "delete") return "delete";
  if (combo === "mod+1" && map.zoom100 === "mod+0") return "zoom100";
  if ((combo === "mod++" || combo === "mod+shift++") && map.zoomIn === "mod+=") return "zoomIn";
  if (combo === "mod+shift+p" && map.palette === "mod+k") return "palette";
  if ((event.key === "?" || event.key === "F1") && map.help === "f1") return "help";
  return null;
}
