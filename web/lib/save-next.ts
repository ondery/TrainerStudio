import { drawCommands } from "./draw";
import { i18n } from "./i18n";
import { flashToast } from "./runline";
import { clearExplicit, continueDecision, explicitClass } from "./save-next-rules";
import { useDraft, useStudio } from "./store";

export { clearExplicit, continueDecision, explicitClass, markExplicit, shouldConfirmNext } from "./save-next-rules";

/** Commit an explicit picker choice, or leave the shape's class untouched, then save and go to the next image. */

export function saveAndContinue() {
  const popup = useDraft.getState().popup;
  const studio = useStudio.getState();
  const shapeId = (popup?.open && popup.shapeId) || studio.editor.selected[0] || "";
  const shape = studio.editor.annotations.find((row) => row.id === shapeId);
  const decision = continueDecision({
    pickerOpen: Boolean(popup?.open),
    explicitClassId: shapeId ? explicitClass(shapeId) : null,
    shapeClassId: shape?.classId || "",
  });
  clearExplicit();
  if (decision.step === "stay") {
    flashToast(i18n.t("label.unclassed"));
    if (shapeId && !useDraft.getState().popup?.open) {
      useDraft.getState().openPopup(Math.round(window.innerWidth / 2), Math.round(window.innerHeight / 3), shapeId);
    }
    window.setTimeout(() => {
      const node = document.querySelector("[data-testid='class-popup-search']");
      if (node instanceof HTMLElement) node.focus();
    }, 0);
    return;
  }
  if (decision.classId && shapeId) {
    studio.patchAnnotation(shapeId, { classId: decision.classId });
    studio.setActiveClass(decision.classId);
  }
  if (decision.closePicker) useDraft.getState().closePopup();
  const fresh = useStudio.getState();
  const selected = new Set(fresh.editor.selected);
  const confirmScan = fresh.editor.holdSave;
  const pending = fresh.editor.annotations.some((row) => (confirmScan || selected.has(row.id)) && (row.attributes?.review === "pending" || row.attributes?.review === "proposed"));
  if (pending) {
    const next = fresh.editor.annotations.map((row) => {
      if ((!confirmScan && !selected.has(row.id)) || (row.attributes?.review !== "pending" && row.attributes?.review !== "proposed")) return row;
      const attributes = { ...row.attributes };
      delete attributes.review;
      return { ...row, attributes, updatedAt: new Date().toISOString() };
    });
    fresh.commit(next, "review");
  } else drawCommands.commit();
  const armed = useStudio.getState();
  void armed.flush(true).then(() => armed.step(1));
}
