"use client";

import { appearance, patchAppearance } from "./appearance";
import { copyAnnotations } from "./clipboard";
import { api } from "./api";
import { deleteSelected, drawCommands, pasteIntoImage } from "./draw";
import { toggleFlag, toggleReviewed } from "./flags";
import { boundsOf } from "./geom";
import { PANELS } from "./grid";
import { runEnterprise } from "./ee-actions";
import { i18n } from "./i18n";
import {
  getCommand,
  registerCommand,
  registerPrefix,
  runRegistered,
} from "./registry";
import { formatCombo, loadShortcuts, type ShortcutAction } from "./shortcuts";
import { newAnnotation, useStudio } from "./store";
import type { Annotation, Geometry, Point } from "./types";

function boxOf(geometry: Geometry): Geometry | null {
  const bounds = boundsOf(geometry);
  if (!bounds || bounds.width < 1 || bounds.height < 1) return null;
  return { type: "bbox", ...bounds };
}

function polyOf(geometry: Geometry): Geometry | null {
  if (geometry.type === "polygon" && geometry.points.length >= 3)
    return geometry;
  if (geometry.type === "obb")
    return { type: "polygon", points: [...geometry.corners] };
  const bounds = boundsOf(geometry);
  if (!bounds) return null;
  const points: Point[] = [
    { x: bounds.x, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y },
    { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
    { x: bounds.x, y: bounds.y + bounds.height },
  ];
  return { type: "polygon", points };
}

function obbOf(geometry: Geometry): Geometry | null {
  if (geometry.type === "obb") return geometry;
  const poly = polyOf(geometry);
  if (!poly || poly.type !== "polygon") return null;
  const [a, b, c, d] = poly.points;
  if (!a || !b || !c || !d) return null;
  return { type: "obb", corners: [a, b, c, d] };
}

function rewrite(kind: "bbox" | "polygon" | "obb") {
  const studio = useStudio.getState();
  const selected = new Set(studio.editor.selected);
  if (!selected.size) return;
  const convert = kind === "bbox" ? boxOf : kind === "polygon" ? polyOf : obbOf;
  studio.commit(
    studio.editor.annotations.map((row) => {
      if (!selected.has(row.id)) return row;
      const geometry = convert(row.geometry);
      return geometry
        ? { ...row, geometry, updatedAt: new Date().toISOString() }
        : row;
    }),
    kind,
  );
}

function selectedRows(): Annotation[] {
  const studio = useStudio.getState();
  const ids = new Set(studio.editor.selected);
  return studio.editor.annotations.filter((row) => ids.has(row.id));
}

function dispatch(id: string) {
  const studio = useStudio.getState();
  const open = (
    dialog:
      | ""
      | "settings"
      | "schema"
      | "export"
      | "jobs"
      | "qc"
      | "create"
      | "shortcuts"
      | "history"
      | "open"
      | "add-class"
      | "wizard"
      | "tasks",
  ) => {
    studio.patchUi({ dialog });
  };
  if (id === "file.new") open("create");
  else if (id === "file.open" || id === "import.yolo") open("open");
  else if (id === "import.legacy") open("settings");
  else if (id === "import.coco") {
    studio.setNotice(i18n.t("m.cocoNote"));
    open("open");
  } else if (id === "import.voc") {
    studio.setNotice(i18n.t("m.vocNote"));
    open("open");
  } else if (id === "file.close") studio.closeProject();
  else if (id === "file.save" || id === "file.saveAll") void studio.flush(true);
  else if (id === "file.revert" && studio.editor.imageId)
    void studio.openImage(studio.editor.imageId, studio.editor.anchor, true);
  else if (id === "export.tasks" || id === "import.tasks") open("tasks");
  else if (
    id === "export.yolo" ||
    id === "export.coco" ||
    id === "export.voc"
  ) {
    patchAppearance({ exportFormat: id.slice(7) as "yolo" });
    open("export");
  } else if (id === "export.grouped") {
    patchAppearance({ exportGrouped: true });
    open("export");
  } else if (id === "file.split" || id === "dataset.split") open("export");
  else if (id === "file.snapshot" || id === "dataset.snapshot") open("export");
  else if (id === "file.settings" || id === "help.about") open("settings");
  else if (id === "edit.undo") studio.undo();
  else if (id === "edit.redo") studio.redo();
  else if (id === "edit.cut") {
    copyAnnotations(selectedRows());
    deleteSelected();
  } else if (id === "edit.copy") copyAnnotations(selectedRows());
  else if (id === "edit.paste" || id === "edit.duplicate") {
    if (id === "edit.duplicate") copyAnnotations(selectedRows());
    pasteIntoImage();
  } else if (id === "edit.delete") deleteSelected();
  else if (id === "edit.all")
    studio.select(studio.editor.annotations.map((row) => row.id));
  else if (id === "edit.invert") {
    const have = new Set(studio.editor.selected);
    studio.select(
      studio.editor.annotations
        .filter((row) => !have.has(row.id))
        .map((row) => row.id),
    );
  } else if (id === "edit.class") {
    const classId = studio.ui.activeClass;
    studio.select(
      studio.editor.annotations
        .filter((row) => row.classId === classId)
        .map((row) => row.id),
    );
  } else if (id === "edit.prev") void copyPrevious();
  else if (id === "edit.palette" || id === "tools.palette")
    studio.patchUi({ palette: true });
  else if (id === "view.fit" || id === "image.fit") drawCommands.fit();
  else if (id === "view.in") drawCommands.zoom(1);
  else if (id === "view.out") drawCommands.zoom(-1);
  else if (id === "view.100" || id === "image.100") drawCommands.zoomTo(1);
  else if (id === "view.labels")
    patchAppearance({ showLabels: !appearance().showLabels });
  else if (id === "view.names")
    patchAppearance({ showClassNames: !appearance().showClassNames });
  else if (id === "view.fill")
    patchAppearance({ fillOpacity: appearance().fillOpacity > 0 ? 0 : 0.13 });
  else if (id === "view.grid") window.dispatchEvent(new Event("studio-grid"));
  else if (id === "view.minimap")
    window.dispatchEvent(
      new CustomEvent("studio-toggle-panel", { detail: "minimap" }),
    );
  else if (id.startsWith("panel."))
    window.dispatchEvent(
      new CustomEvent("studio-toggle-panel", { detail: id.slice(6) }),
    );
  else if (id === "view.dark" || id === "view.light")
    window.dispatchEvent(
      new CustomEvent("studio-theme", { detail: id.slice(5) }),
    );
  else if (id === "view.compact")
    window.dispatchEvent(
      new CustomEvent("studio-density", { detail: "compact" }),
    );
  else if (id === "view.cross")
    window.dispatchEvent(new CustomEvent("studio-cross", { detail: "guides" }));
  else if (id === "view.cursor")
    window.dispatchEvent(new CustomEvent("studio-cross", { detail: "cursor" }));
  else if (id === "file.wizard") open("wizard");
  else if (id === "view.system") patchAppearance({ theme: "system" });
  else if (id === "view.ribbon")
    patchAppearance({
      chrome: appearance().chrome === "ribbon" ? "classic" : "ribbon",
    });
  else if (id.startsWith("ee.")) void runEnterprise(id);
  else if (id === "image.prev") void studio.step(-1);
  else if (id === "image.next" || id === "image.skip") void studio.step(1);
  else if (id === "image.first" || id === "image.last") {
    const rows = studio.visibleImages();
    const row = id === "image.first" ? rows[0] : rows[rows.length - 1];
    if (row) void studio.openImage(row.id);
  } else if (id === "image.goto") {
    const raw = window.prompt(i18n.t("m.goto"));
    const index = Number(raw);
    const row = studio.visibleImages()[index - 1];
    if (row) void studio.openImage(row.id);
  } else if (
    (id === "image.flag" || id === "image.reviewed") &&
    studio.project &&
    studio.editor.imageId
  ) {
    if (id === "image.flag")
      toggleFlag(studio.project.id, studio.editor.imageId);
    else toggleReviewed(studio.project.id, studio.editor.imageId);
  } else if (id === "image.rotate") {
    const order = [0, 90, 180, 270] as const;
    const current = appearance().viewRotate;
    const next =
      order[(Math.max(0, order.indexOf(current)) + 1) % order.length];
    patchAppearance({ viewRotate: next });
  } else if (id.startsWith("tool.")) studio.setTool(id.slice(5) as "select");
  else if (id === "ann.box") rewrite("bbox");
  else if (id === "ann.poly") rewrite("polygon");
  else if (id === "ann.obb") rewrite("obb");
  else if (id === "ann.merge") mergeSelected();
  else if (id === "ann.split") splitSelected();
  else if (id === "ann.lock" || id === "ann.hide")
    toggleAttr(id === "ann.lock" ? "locked" : "hidden");
  else if (id === "ann.front" || id === "ann.back") reorder(id === "ann.front");
  else if (id === "ann.class") changeClass();
  else if (id === "ann.schema" || id === "classes.schema") open("schema");
  else if (id === "classes.add") open("add-class");
  else if (id === "classes.hide" || id === "classes.lock")
    toggleClass(id === "classes.lock");
  else if (id === "tools.shortcuts" || id === "help.shortcuts")
    open("shortcuts");
  else if (id === "tools.qc" || id === "dataset.qc") open("qc");
  else if (id === "tools.history")
    window.dispatchEvent(
      new CustomEvent("studio-toggle-panel", { detail: "history" }),
    );
  else if (id === "ai.jobs" || id === "ai.install") open("jobs");
  else if (id === "window.save")
    window.dispatchEvent(new CustomEvent("studio-layout", { detail: "save" }));
  else if (id.startsWith("layout."))
    window.dispatchEvent(
      new CustomEvent("studio-layout", { detail: id.slice(7) }),
    );
}

export async function copyPrevious() {
  const studio = useStudio.getState();
  const project = studio.project;
  const imageId = studio.editor.imageId;
  if (!project || !imageId) return;
  const rows = studio.visibleImages();
  const index = rows.findIndex((row) => row.id === imageId);
  const prev = rows[index - 1];
  if (!prev) return;
  const detail = await api<{ annotations: Annotation[] }>(
    `/api/projects/${project.id}/images/${prev.id}`,
  );
  const added = (detail.annotations || []).map((row) =>
    newAnnotation(imageId, row.classId, row.geometry, { ...row.attributes }),
  );
  if (!added.length) return;
  studio.commit([...studio.editor.annotations, ...added], "paste");
  studio.select(added.map((row) => row.id));
}

function mergeSelected() {
  const studio = useStudio.getState();
  const rows = selectedRows();
  const boxes = rows
    .map((row) => boundsOf(row.geometry))
    .filter((box): box is NonNullable<typeof box> => Boolean(box));
  if (boxes.length < 2) return;
  const x = Math.min(...boxes.map((box) => box.x));
  const y = Math.min(...boxes.map((box) => box.y));
  const x2 = Math.max(...boxes.map((box) => box.x + box.width));
  const y2 = Math.max(...boxes.map((box) => box.y + box.height));
  const keep = rows[0];
  const drop = new Set(rows.slice(1).map((row) => row.id));
  const geometry: Geometry = {
    type: "bbox",
    x,
    y,
    width: x2 - x,
    height: y2 - y,
  };
  studio.commit(
    studio.editor.annotations
      .filter((row) => !drop.has(row.id))
      .map((row) =>
        row.id === keep.id
          ? { ...row, geometry, updatedAt: new Date().toISOString() }
          : row,
      ),
    "merge",
  );
  studio.select([keep.id]);
}

function splitSelected() {
  const studio = useStudio.getState();
  const row = selectedRows().find((item) => boundsOf(item.geometry));
  const bounds = row ? boundsOf(row.geometry) : undefined;
  if (!row || !bounds || !studio.editor.imageId) return;
  const left: Geometry = {
    type: "bbox",
    x: bounds.x,
    y: bounds.y,
    width: bounds.width / 2,
    height: bounds.height,
  };
  const right: Geometry = {
    type: "bbox",
    x: bounds.x + bounds.width / 2,
    y: bounds.y,
    width: bounds.width / 2,
    height: bounds.height,
  };
  const created = newAnnotation(studio.editor.imageId, row.classId, right, {
    ...row.attributes,
  });
  studio.commit(
    studio.editor.annotations.flatMap((item) =>
      item.id === row.id
        ? [
            { ...item, geometry: left, updatedAt: new Date().toISOString() },
            created,
          ]
        : [item],
    ),
    "split",
  );
  studio.select([row.id, created.id]);
}

function toggleAttr(key: "locked" | "hidden") {
  const studio = useStudio.getState();
  const ids = new Set(studio.editor.selected);
  if (!ids.size) return;
  studio.commit(
    studio.editor.annotations.map((row) => {
      if (!ids.has(row.id)) return row;
      const attributes = { ...row.attributes, [key]: !row.attributes[key] };
      return { ...row, attributes, updatedAt: new Date().toISOString() };
    }),
    key,
  );
}

function reorder(front: boolean) {
  const studio = useStudio.getState();
  const ids = new Set(studio.editor.selected);
  if (!ids.size) return;
  const picked = studio.editor.annotations.filter((row) => ids.has(row.id));
  const rest = studio.editor.annotations.filter((row) => !ids.has(row.id));
  studio.commit(front ? [...rest, ...picked] : [...picked, ...rest], "order");
}

function changeClass() {
  const studio = useStudio.getState();
  const classId = studio.ui.activeClass;
  const ids = new Set(studio.editor.selected);
  if (!classId || !ids.size) return;
  studio.commit(
    studio.editor.annotations.map((row) =>
      ids.has(row.id)
        ? { ...row, classId, updatedAt: new Date().toISOString() }
        : row,
    ),
    "class",
  );
}

function toggleClass(lock: boolean) {
  const studio = useStudio.getState();
  const classId = studio.ui.activeClass;
  if (!classId) return;
  const look = appearance();
  const key = lock ? "lockedClasses" : "hiddenClasses";
  const current = new Set(look[key]);
  if (current.has(classId)) current.delete(classId);
  else current.add(classId);
  patchAppearance({ [key]: [...current] });
}

type CatalogRow = {
  id: string;
  titleKey: string;
  category:
    | "file"
    | "edit"
    | "view"
    | "image"
    | "tool"
    | "ann"
    | "classes"
    | "tools"
    | "ai"
    | "layout"
    | "ee";
  shortcut?: ShortcutAction;
  order: number;
};

const CORE_COMMANDS: CatalogRow[] = [
  { id: "file.new", titleKey: "file.new", category: "file", order: 10 },
  { id: "file.wizard", titleKey: "m.wizard", category: "file", order: 20 },
  { id: "file.open", titleKey: "file.open", category: "file", order: 30 },
  { id: "import.yolo", titleKey: "m.yolo", category: "file", order: 40 },
  { id: "import.legacy", titleKey: "m.legacy", category: "file", order: 50 },
  { id: "import.coco", titleKey: "m.coco", category: "file", order: 60 },
  { id: "import.voc", titleKey: "m.voc", category: "file", order: 70 },
  {
    id: "import.tasks",
    titleKey: "dataset.tasks",
    category: "file",
    order: 80,
  },
  { id: "file.close", titleKey: "file.close", category: "file", order: 90 },
  { id: "file.save", titleKey: "m.save", category: "file", order: 100 },
  { id: "file.saveAll", titleKey: "m.saveAll", category: "file", order: 110 },
  { id: "file.revert", titleKey: "m.revert", category: "file", order: 120 },
  {
    id: "export.yolo",
    titleKey: "file.export",
    category: "file",
    shortcut: "export",
    order: 130,
  },
  { id: "export.coco", titleKey: "m.coco", category: "file", order: 140 },
  { id: "export.voc", titleKey: "m.voc", category: "file", order: 150 },
  {
    id: "export.tasks",
    titleKey: "dataset.tasks",
    category: "file",
    order: 160,
  },
  {
    id: "export.grouped",
    titleKey: "file.split",
    category: "file",
    order: 170,
  },
  { id: "file.split", titleKey: "file.split", category: "file", order: 180 },
  {
    id: "dataset.split",
    titleKey: "dataset.split",
    category: "file",
    order: 190,
  },
  {
    id: "file.snapshot",
    titleKey: "file.snapshot",
    category: "file",
    order: 200,
  },
  {
    id: "dataset.snapshot",
    titleKey: "dataset.snapshot",
    category: "file",
    order: 210,
  },
  {
    id: "file.settings",
    titleKey: "file.settings",
    category: "file",
    shortcut: "settings",
    order: 220,
  },
  {
    id: "edit.undo",
    titleKey: "edit.undo",
    category: "edit",
    shortcut: "undo",
    order: 10,
  },
  {
    id: "edit.redo",
    titleKey: "edit.redo",
    category: "edit",
    shortcut: "redo",
    order: 20,
  },
  { id: "edit.cut", titleKey: "m.cut", category: "edit", order: 30 },
  {
    id: "edit.copy",
    titleKey: "edit.copy",
    category: "edit",
    shortcut: "copy",
    order: 40,
  },
  {
    id: "edit.paste",
    titleKey: "edit.paste",
    category: "edit",
    shortcut: "paste",
    order: 50,
  },
  {
    id: "edit.duplicate",
    titleKey: "m.duplicate",
    category: "edit",
    shortcut: "duplicate",
    order: 60,
  },
  {
    id: "edit.delete",
    titleKey: "edit.delete",
    category: "edit",
    shortcut: "delete",
    order: 70,
  },
  {
    id: "edit.all",
    titleKey: "m.selectAll",
    category: "edit",
    shortcut: "selectAll",
    order: 80,
  },
  { id: "edit.invert", titleKey: "m.invert", category: "edit", order: 90 },
  { id: "edit.class", titleKey: "m.selectClass", category: "edit", order: 100 },
  {
    id: "edit.prev",
    titleKey: "m.copyPrev",
    category: "edit",
    shortcut: "copyPrev",
    order: 110,
  },
  {
    id: "edit.palette",
    titleKey: "edit.palette",
    category: "edit",
    shortcut: "palette",
    order: 120,
  },
  {
    id: "tools.palette",
    titleKey: "edit.palette",
    category: "tools",
    shortcut: "palette",
    order: 40,
  },
  {
    id: "view.fit",
    titleKey: "view.fit",
    category: "view",
    shortcut: "fit",
    order: 10,
  },
  {
    id: "image.fit",
    titleKey: "image.fit",
    category: "image",
    shortcut: "fit",
    order: 80,
  },
  {
    id: "view.in",
    titleKey: "view.zoomIn",
    category: "view",
    shortcut: "zoomIn",
    order: 20,
  },
  {
    id: "view.out",
    titleKey: "view.zoomOut",
    category: "view",
    shortcut: "zoomOut",
    order: 30,
  },
  {
    id: "view.100",
    titleKey: "m.zoom100",
    category: "view",
    shortcut: "zoom100",
    order: 40,
  },
  {
    id: "image.100",
    titleKey: "m.zoom100",
    category: "image",
    shortcut: "zoom100",
    order: 90,
  },
  { id: "view.labels", titleKey: "m.labels", category: "view", order: 50 },
  { id: "view.names", titleKey: "m.classNames", category: "view", order: 60 },
  { id: "view.fill", titleKey: "m.fill", category: "view", order: 70 },
  { id: "view.grid", titleKey: "view.grid", category: "view", order: 80 },
  { id: "view.minimap", titleKey: "view.panels", category: "view", order: 90 },
  { id: "view.dark", titleKey: "view.dark", category: "view", order: 100 },
  { id: "view.light", titleKey: "view.light", category: "view", order: 110 },
  { id: "view.system", titleKey: "view.light", category: "view", order: 120 },
  { id: "view.ribbon", titleKey: "view.compact", category: "view", order: 130 },
  {
    id: "view.compact",
    titleKey: "view.compact",
    category: "view",
    order: 140,
  },
  {
    id: "view.cross",
    titleKey: "view.crossFull",
    category: "view",
    shortcut: "guides",
    order: 150,
  },
  {
    id: "view.cursor",
    titleKey: "view.crossCursor",
    category: "view",
    shortcut: "crossCursor",
    order: 160,
  },
  {
    id: "image.prev",
    titleKey: "image.prev",
    category: "image",
    shortcut: "bracketPrev",
    order: 10,
  },
  {
    id: "image.next",
    titleKey: "image.next",
    category: "image",
    shortcut: "bracketNext",
    order: 20,
  },
  {
    id: "image.skip",
    titleKey: "image.next",
    category: "image",
    shortcut: "skipTask",
    order: 30,
  },
  { id: "image.first", titleKey: "image.prev", category: "image", order: 40 },
  { id: "image.last", titleKey: "image.next", category: "image", order: 50 },
  { id: "image.goto", titleKey: "m.goto", category: "image", order: 60 },
  { id: "image.flag", titleKey: "m.flag", category: "image", order: 70 },
  {
    id: "image.reviewed",
    titleKey: "m.reviewed",
    category: "image",
    order: 75,
  },
  { id: "image.rotate", titleKey: "m.rotate", category: "image", order: 78 },
  {
    id: "tool.select",
    titleKey: "tools.select",
    category: "tool",
    shortcut: "tool.select",
    order: 10,
  },
  {
    id: "tool.bbox",
    titleKey: "tools.bbox",
    category: "tool",
    shortcut: "tool.bbox",
    order: 20,
  },
  {
    id: "tool.polygon",
    titleKey: "tools.polygon",
    category: "tool",
    shortcut: "tool.polygon",
    order: 30,
  },
  {
    id: "tool.obb",
    titleKey: "tools.obb",
    category: "tool",
    shortcut: "tool.obb",
    order: 40,
  },
  {
    id: "tool.pose",
    titleKey: "tools.pose",
    category: "tool",
    shortcut: "tool.pose",
    order: 50,
  },
  {
    id: "tool.sam",
    titleKey: "tools.sam",
    category: "tool",
    shortcut: "tool.sam",
    order: 60,
  },
  {
    id: "tool.pan",
    titleKey: "tools.pan",
    category: "tool",
    shortcut: "tool.pan",
    order: 70,
  },
  { id: "ann.box", titleKey: "ann.box", category: "ann", order: 10 },
  { id: "ann.poly", titleKey: "ann.polygon", category: "ann", order: 20 },
  { id: "ann.obb", titleKey: "ann.obb", category: "ann", order: 30 },
  { id: "ann.merge", titleKey: "m.merge", category: "ann", order: 40 },
  { id: "ann.split", titleKey: "m.merge", category: "ann", order: 50 },
  { id: "ann.lock", titleKey: "m.lock", category: "ann", order: 60 },
  { id: "ann.hide", titleKey: "m.hide", category: "ann", order: 70 },
  { id: "ann.front", titleKey: "m.front", category: "ann", order: 80 },
  { id: "ann.back", titleKey: "m.back", category: "ann", order: 90 },
  { id: "ann.class", titleKey: "ann.box", category: "ann", order: 100 },
  { id: "ann.schema", titleKey: "ann.schema", category: "ann", order: 110 },
  {
    id: "classes.schema",
    titleKey: "ann.schema",
    category: "classes",
    order: 40,
  },
  {
    id: "classes.add",
    titleKey: "classes.add",
    category: "classes",
    order: 10,
  },
  {
    id: "classes.hide",
    titleKey: "classes.panel",
    category: "classes",
    order: 20,
  },
  {
    id: "classes.lock",
    titleKey: "classes.panel",
    category: "classes",
    order: 30,
  },
  {
    id: "tools.shortcuts",
    titleKey: "tools.shortcuts",
    category: "tools",
    shortcut: "shortcuts",
    order: 10,
  },
  {
    id: "help.shortcuts",
    titleKey: "help.shortcuts",
    category: "tools",
    shortcut: "shortcuts",
    order: 15,
  },
  {
    id: "tools.qc",
    titleKey: "tools.qc",
    category: "tools",
    shortcut: "qc",
    order: 20,
  },
  {
    id: "dataset.qc",
    titleKey: "tools.qc",
    category: "tools",
    shortcut: "qc",
    order: 25,
  },
  {
    id: "tools.history",
    titleKey: "tools.history",
    category: "tools",
    shortcut: "history",
    order: 30,
  },
  { id: "ai.jobs", titleKey: "ai.status", category: "ai", order: 10 },
  { id: "ai.install", titleKey: "ai.install", category: "ai", order: 20 },
  { id: "window.save", titleKey: "window.save", category: "layout", order: 10 },
  {
    id: "layout.default",
    titleKey: "window.default",
    category: "layout",
    order: 20,
  },
  {
    id: "layout.labeling",
    titleKey: "window.labeling",
    category: "layout",
    order: 30,
  },
  {
    id: "layout.review",
    titleKey: "window.review",
    category: "layout",
    order: 40,
  },
  {
    id: "layout.training",
    titleKey: "window.training",
    category: "layout",
    order: 50,
  },
  { id: "help.about", titleKey: "help.about", category: "tools", order: 50 },
  { id: "ee.video", titleKey: "ee.video", category: "ee", order: 10 },
  { id: "ee.camera", titleKey: "ee.camera", category: "ee", order: 20 },
  { id: "ee.remote", titleKey: "ee.remote", category: "ee", order: 30 },
  { id: "ee.rbac", titleKey: "ee.rbac", category: "ee", order: 40 },
  { id: "ee.review", titleKey: "ee.review", category: "ee", order: 50 },
  { id: "ee.queue", titleKey: "ee.queue", category: "ee", order: 60 },
];

let booted = false;

function bootCommands() {
  if (booted) return;
  booted = true;
  for (const spec of CORE_COMMANDS) {
    registerCommand({ ...spec, run: () => dispatch(spec.id) });
  }
  for (const id of PANELS) {
    registerCommand({
      id: `panel.${id}`,
      titleKey: `panel.${id}`,
      category: "view",
      order: 200,
      run: () => dispatch(`panel.${id}`),
    });
  }
  registerPrefix(
    (id) =>
      id.startsWith("panel.") ||
      id.startsWith("ee.") ||
      id.startsWith("tool.") ||
      id.startsWith("layout."),
    (id) => dispatch(id),
  );
}

export function runCommand(id: string) {
  bootCommands();
  runRegistered(id);
}

export function commandKbd(id: string): string {
  bootCommands();
  const spec = getCommand(id);
  if (!spec?.shortcut) return "";
  return formatCombo(loadShortcuts()[spec.shortcut]);
}

bootCommands();
