import { appearance } from "./appearance";
import { pasteAnnotations } from "./clipboard";
import { drawClassId } from "./draw-class";
import { i18n } from "./i18n";
import { beginRun } from "./runline";
import { newAnnotation, useDraft, useStudio } from "./store";
import type { Geometry } from "./types";

export const drawCommands = {
  cancel: () => undefined as void,
  commit: () => undefined as void,
  backspace: () => undefined as void,
  fit: () => undefined as void,
  center: () => undefined as void,
  zoom: (_direction: number) => undefined as void,
  zoomTo: (_scale: number) => undefined as void,
  zoomSelection: () => undefined as void,
  setCamera: (_next: { scale: number; x: number; y: number }) => undefined as void,
  space: (_down: boolean) => undefined as void,
};

export function finishGeometry(geometry: Geometry, clientX: number, clientY: number) {
  const studio = useStudio.getState();
  const imageId = studio.editor.imageId;
  const classId = drawClassId(studio.ui.activeClass, studio.classes.map((row) => row.id), studio.ui.classPopup);
  if (!imageId || !classId) return;
  const created = acceptGeometry(geometry, classId);
  if (studio.ui.classPopup && created) useDraft.getState().openPopup(clientX, clientY, created);
}

export function acceptGeometry(geometry: Geometry, classId: string) {
  const studio = useStudio.getState();
  const imageId = studio.editor.imageId;
  if (!imageId) return null;
  const created = newAnnotation(imageId, classId, geometry, {});
  const classColor = studio.classes.find((row) => row.id === classId)?.color || "#0a84ff";
  beginRun({ key: created.id, kind: "save", geometry, classColor });
  studio.setActiveClass(classId);
  studio.commit([...studio.editor.annotations, created], "draw");
  studio.select([created.id]);
  useDraft.getState().clear();
  const look = appearance();
  if (!look.keepTool) studio.setTool("select");
  if (!useStudio.getState().ui.classPopup && (look.advanceOnDraw || useStudio.getState().ui.autoAdvance)) void useStudio.getState().step(1);
  return created.id;
}

export function deleteSelected() {
  const studio = useStudio.getState();
  const drop = new Set(studio.editor.selected);
  if (!drop.size) return;
  if (appearance().confirmDelete && !window.confirm(i18n.t("m.confirmDelete"))) return;
  studio.commit(studio.editor.annotations.filter((row) => !drop.has(row.id)), "delete");
  studio.select([]);
}

export function pasteIntoImage() {
  const studio = useStudio.getState();
  if (!studio.editor.imageId) return;
  const added = pasteAnnotations(studio.editor.imageId);
  if (!added.length) return;
  studio.commit([...studio.editor.annotations, ...added], "paste");
  studio.select(added.map((row) => row.id));
}
