import { api } from "./api";
import { copyAnnotations } from "./clipboard";
import { copyPrevious } from "./commands";
import { drawCommands, pasteIntoImage } from "./draw";
import { newAnnotation, useStudio } from "./store";
import { blendBox } from "./track";
import type { ShortcutAction } from "./shortcuts";
import type { Annotation } from "./types";

const LEGACY = new Set<ShortcutAction>([
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
]);

function ghost(row: Annotation) {
  const review = String(row.attributes?.review || "");
  return review === "pending" || review === "proposed";
}

function clearReview(rows: Annotation[], ids: Set<string>, onlySelected: boolean) {
  const stamp = new Date().toISOString();
  return rows.map((row) => {
    if (!ghost(row)) return row;
    if (onlySelected && !ids.has(row.id)) return row;
    const attributes = { ...row.attributes };
    delete attributes.review;
    return { ...row, attributes, updatedAt: stamp };
  });
}

export function runLegacyAction(action: ShortcutAction): boolean | null {
  if (!LEGACY.has(action)) return null;
  const studio = useStudio.getState();
  const selected = new Set(studio.editor.selected);
  if (action === "copyPrev") {
    void copyPrevious();
    return true;
  }
  if (action === "track") {
    void blendTrack();
    return true;
  }
  if (action === "skipTask") {
    const imageId = studio.editor.imageId;
    if (!imageId) return false;
    const key = "trainer-studio.skipped";
    const current = JSON.parse(window.localStorage.getItem(key) || "[]") as string[];
    if (!current.includes(imageId)) current.push(imageId);
    window.localStorage.setItem(key, JSON.stringify(current));
    void studio.step(1);
    return true;
  }
  if (action === "reviewReject") {
    const next = studio.editor.annotations.filter((row) => !(selected.has(row.id) && ghost(row)));
    if (next.length === studio.editor.annotations.length) return false;
    studio.commit(next, "delete");
    return true;
  }
  if (action === "reviewFix") {
    if (!studio.editor.annotations.some((row) => selected.has(row.id) && ghost(row))) return false;
    studio.commit(clearReview(studio.editor.annotations, selected, true), "review");
    return true;
  }
  if (action === "cycle" || action === "cycleBack") {
    const rows = studio.editor.annotations;
    if (!rows.length) return false;
    const index = rows.findIndex((row) => row.id === studio.editor.selected[0]);
    const step = action === "cycleBack" ? -1 : 1;
    const next = rows[(index + step + rows.length) % rows.length];
    studio.select([next.id]);
    return true;
  }
  if (action === "acceptGhost") {
    const onlySelected = studio.editor.annotations.some((row) => selected.has(row.id) && ghost(row));
    studio.commit(clearReview(studio.editor.annotations, selected, onlySelected), "review");
    return true;
  }
  if (action === "rejectGhost") {
    const chosen = studio.editor.annotations.some((row) => selected.has(row.id) && ghost(row));
    const next = studio.editor.annotations.filter((row) => !ghost(row) || (chosen && !selected.has(row.id)));
    studio.commit(next, "delete");
    return true;
  }
  if (action === "help") {
    studio.patchUi({ dialog: "shortcuts" });
    return true;
  }
  if (action === "zoom100") drawCommands.zoomTo(1);
  else if (action === "zoomIn") drawCommands.zoom(1);
  else if (action === "zoomOut") drawCommands.zoom(-1);
  else if (action === "zoom200") drawCommands.zoomTo(2);
  else if (action === "zoomSelection") drawCommands.zoomSelection();
  else if (action === "floatPanel") window.dispatchEvent(new CustomEvent("studio-float", { detail: "layers" }));
  else if (action === "propagate") void propagateForward();
  else if (action === "quickOpen") studio.patchUi({ palette: true });
  else if (action === "layers") window.dispatchEvent(new CustomEvent("studio-toggle-panel", { detail: "layers" }));
  else if (action === "navigator") window.dispatchEvent(new CustomEvent("studio-toggle-panel", { detail: "minimap" }));
  else if (action === "filmstrip") window.dispatchEvent(new CustomEvent("studio-toggle-panel", { detail: "filmstrip" }));
  else if (action === "nextUnlabeled") {
    const rows = studio.visibleImages();
    const index = rows.findIndex((row) => row.id === studio.editor.imageId);
    const next = rows.slice(index + 1).find((row) => row.status !== "labeled") || rows.find((row) => row.status !== "labeled");
    if (!next) return false;
    void studio.openImage(next.id);
  }
  return true;
}

async function blendTrack() {
  const studio = useStudio.getState();
  const project = studio.project;
  const imageId = studio.editor.imageId;
  if (!project || !imageId) return;
  const rows = studio.visibleImages();
  const index = rows.findIndex((row) => row.id === imageId);
  const upcoming = rows[index + 1];
  if (!upcoming) return;
  const detail = await api<{ annotations: Annotation[] }>(`/api/projects/${project.id}/images/${upcoming.id}`);
  const current = studio.editor.annotations.filter((row) => row.geometry.type === "bbox");
  const next = (detail.annotations || []).filter((row) => row.geometry.type === "bbox");
  const count = Math.min(current.length, next.length);
  if (!count) return;
  const added = [];
  for (let ordinal = 0; ordinal < count; ordinal += 1) {
    const left = current[ordinal].geometry;
    const right = next[ordinal].geometry;
    if (left.type !== "bbox" || right.type !== "bbox") continue;
    added.push(newAnnotation(imageId, current[ordinal].classId, { type: "bbox", ...blendBox(left, right) }, { review: "pending", track: true }));
  }
  if (!added.length) return;
  const fresh = useStudio.getState();
  fresh.commit([...fresh.editor.annotations, ...added], "paste");
  fresh.select(added.map((row) => row.id));
}

async function propagateForward() {
  const studio = useStudio.getState();
  const rows = studio.editor.annotations.filter((row) => studio.editor.selected.includes(row.id));
  if (!rows.length) return;
  copyAnnotations(rows);
  await studio.step(1);
  pasteIntoImage();
}
