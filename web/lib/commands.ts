"use client";

import { appearance, patchAppearance } from "./appearance";
import { copyAnnotations } from "./clipboard";
import { api } from "./api";
import { deleteSelected, drawCommands, pasteIntoImage } from "./draw";
import { toggleFlag, toggleReviewed } from "./flags";
import { boundsOf } from "./geom";
import { runEnterprise } from "./ee-actions";
import { i18n } from "./i18n";
import { newAnnotation, useStudio } from "./store";
import type { Annotation, Geometry, Point } from "./types";

function boxOf(geometry: Geometry): Geometry | null {
  const bounds = boundsOf(geometry);
  if (!bounds || bounds.width < 1 || bounds.height < 1) return null;
  return { type: "bbox", ...bounds };
}

function polyOf(geometry: Geometry): Geometry | null {
  if (geometry.type === "polygon" && geometry.points.length >= 3) return geometry;
  if (geometry.type === "obb") return { type: "polygon", points: [...geometry.corners] };
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
      return geometry ? { ...row, geometry, updatedAt: new Date().toISOString() } : row;
    }),
    kind,
  );
}

function selectedRows(): Annotation[] {
  const studio = useStudio.getState();
  const ids = new Set(studio.editor.selected);
  return studio.editor.annotations.filter((row) => ids.has(row.id));
}

export function runCommand(id: string) {
  const studio = useStudio.getState();
  const open = (dialog: "" | "settings" | "schema" | "export" | "jobs" | "qc" | "create" | "shortcuts" | "history" | "open" | "add-class" | "wizard") => {
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
  else if (id === "file.revert" && studio.editor.imageId) void studio.openImage(studio.editor.imageId, studio.editor.anchor, true);
  else if (id === "export.yolo" || id === "export.coco" || id === "export.voc") {
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
  else if (id === "edit.all") studio.select(studio.editor.annotations.map((row) => row.id));
  else if (id === "edit.invert") {
    const have = new Set(studio.editor.selected);
    studio.select(studio.editor.annotations.filter((row) => !have.has(row.id)).map((row) => row.id));
  } else if (id === "edit.class") {
    const classId = studio.ui.activeClass;
    studio.select(studio.editor.annotations.filter((row) => row.classId === classId).map((row) => row.id));
  } else if (id === "edit.prev") void copyPrevious();
  else if (id === "edit.palette" || id === "tools.palette") studio.patchUi({ palette: true });
  else if (id === "view.fit" || id === "image.fit") drawCommands.fit();
  else if (id === "view.in") drawCommands.zoom(1);
  else if (id === "view.out") drawCommands.zoom(-1);
  else if (id === "view.100" || id === "image.100") drawCommands.zoomTo(1);
  else if (id === "view.labels") patchAppearance({ showLabels: !appearance().showLabels });
  else if (id === "view.names") patchAppearance({ showClassNames: !appearance().showClassNames });
  else if (id === "view.fill") patchAppearance({ fillOpacity: appearance().fillOpacity > 0 ? 0 : 0.13 });
  else if (id === "view.grid") window.dispatchEvent(new Event("studio-grid"));
  else if (id === "view.minimap") window.dispatchEvent(new CustomEvent("studio-toggle-panel", { detail: "minimap" }));
  else if (id.startsWith("panel.")) window.dispatchEvent(new CustomEvent("studio-toggle-panel", { detail: id.slice(6) }));
  else if (id === "view.dark" || id === "view.light") window.dispatchEvent(new CustomEvent("studio-theme", { detail: id.slice(5) }));
  else if (id === "view.compact") window.dispatchEvent(new CustomEvent("studio-density", { detail: "compact" }));
  else if (id === "view.cross") window.dispatchEvent(new CustomEvent("studio-cross", { detail: "guides" }));
  else if (id === "view.cursor") window.dispatchEvent(new CustomEvent("studio-cross", { detail: "cursor" }));
  else if (id === "file.wizard") open("wizard");
  else if (id === "view.system") patchAppearance({ theme: "system" });
  else if (id === "view.ribbon") patchAppearance({ chrome: appearance().chrome === "ribbon" ? "classic" : "ribbon" });
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
  } else if ((id === "image.flag" || id === "image.reviewed") && studio.project && studio.editor.imageId) {
    if (id === "image.flag") toggleFlag(studio.project.id, studio.editor.imageId);
    else toggleReviewed(studio.project.id, studio.editor.imageId);
  } else if (id === "image.rotate") {
    const order = [0, 90, 180, 270] as const;
    const current = appearance().viewRotate;
    const next = order[(Math.max(0, order.indexOf(current)) + 1) % order.length];
    patchAppearance({ viewRotate: next });
  } else if (id.startsWith("tool.")) studio.setTool(id.slice(5) as "select");
  else if (id === "ann.box") rewrite("bbox");
  else if (id === "ann.poly") rewrite("polygon");
  else if (id === "ann.obb") rewrite("obb");
  else if (id === "ann.merge") mergeSelected();
  else if (id === "ann.split") splitSelected();
  else if (id === "ann.lock" || id === "ann.hide") toggleAttr(id === "ann.lock" ? "locked" : "hidden");
  else if (id === "ann.front" || id === "ann.back") reorder(id === "ann.front");
  else if (id === "ann.class") changeClass();
  else if (id === "ann.schema" || id === "classes.schema") open("schema");
  else if (id === "classes.add") open("add-class");
  else if (id === "classes.hide" || id === "classes.lock") toggleClass(id === "classes.lock");
  else if (id === "tools.shortcuts" || id === "help.shortcuts") open("shortcuts");
  else if (id === "tools.qc" || id === "dataset.qc") open("qc");
  else if (id === "tools.history") window.dispatchEvent(new CustomEvent("studio-toggle-panel", { detail: "history" }));
  else if (id === "ai.jobs" || id === "ai.install") open("jobs");
  else if (id === "window.save") window.dispatchEvent(new CustomEvent("studio-layout", { detail: "save" }));
  else if (id.startsWith("layout.")) window.dispatchEvent(new CustomEvent("studio-layout", { detail: id.slice(7) }));
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
  const detail = await api<{ annotations: Annotation[] }>(`/api/projects/${project.id}/images/${prev.id}`);
  const added = (detail.annotations || []).map((row) => newAnnotation(imageId, row.classId, row.geometry, { ...row.attributes }));
  if (!added.length) return;
  studio.commit([...studio.editor.annotations, ...added], "paste");
  studio.select(added.map((row) => row.id));
}

function mergeSelected() {
  const studio = useStudio.getState();
  const rows = selectedRows();
  const boxes = rows.map((row) => boundsOf(row.geometry)).filter((box): box is NonNullable<typeof box> => Boolean(box));
  if (boxes.length < 2) return;
  const x = Math.min(...boxes.map((box) => box.x));
  const y = Math.min(...boxes.map((box) => box.y));
  const x2 = Math.max(...boxes.map((box) => box.x + box.width));
  const y2 = Math.max(...boxes.map((box) => box.y + box.height));
  const keep = rows[0];
  const drop = new Set(rows.slice(1).map((row) => row.id));
  const geometry: Geometry = { type: "bbox", x, y, width: x2 - x, height: y2 - y };
  studio.commit(
    studio.editor.annotations.filter((row) => !drop.has(row.id)).map((row) => (row.id === keep.id ? { ...row, geometry, updatedAt: new Date().toISOString() } : row)),
    "merge",
  );
  studio.select([keep.id]);
}

function splitSelected() {
  const studio = useStudio.getState();
  const row = selectedRows().find((item) => boundsOf(item.geometry));
  const bounds = row ? boundsOf(row.geometry) : undefined;
  if (!row || !bounds || !studio.editor.imageId) return;
  const left: Geometry = { type: "bbox", x: bounds.x, y: bounds.y, width: bounds.width / 2, height: bounds.height };
  const right: Geometry = { type: "bbox", x: bounds.x + bounds.width / 2, y: bounds.y, width: bounds.width / 2, height: bounds.height };
  const created = newAnnotation(studio.editor.imageId, row.classId, right, { ...row.attributes });
  studio.commit(
    studio.editor.annotations.flatMap((item) => (item.id === row.id ? [{ ...item, geometry: left, updatedAt: new Date().toISOString() }, created] : [item])),
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
    studio.editor.annotations.map((row) => (ids.has(row.id) ? { ...row, classId, updatedAt: new Date().toISOString() } : row)),
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
