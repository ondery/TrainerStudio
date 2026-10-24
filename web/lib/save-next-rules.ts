/** Ctrl/Cmd+Enter saves everywhere except while Monaco is in edit mode. */

export function shouldConfirmNext(input: { combo: string; monacoEdit: boolean }): boolean {
  return input.combo === "mod+enter" && !input.monacoEdit;
}

/** A class hotkey must not fire while a field, the picker filter, or a select has focus. */

export function classHotkeyAllowed(tagName: string, editable = false): boolean {
  if (editable) return false;
  const tag = tagName.toUpperCase();
  return tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT";
}

/**
 * The class Ctrl+Enter may write.
 * Highlight, the first filtered row, and hover are not choices.
 * `explicitClassId` is set only by a click, Enter on a row, or that row's hotkey in this picker session.
 */
export function continueDecision(input: {
  pickerOpen: boolean;
  explicitClassId: string | null;
  shapeClassId: string;
}): { classId: string | null; step: "save" | "stay"; closePicker: boolean; focusPicker: boolean } {
  if (input.explicitClassId) {
    return { classId: input.explicitClassId, step: "save", closePicker: true, focusPicker: false };
  }
  if (!input.shapeClassId) {
    return { classId: null, step: "stay", closePicker: false, focusPicker: true };
  }
  return { classId: null, step: "save", closePicker: input.pickerOpen, focusPicker: false };
}

/** Scrolling a class control must not change the shape. */

export function wheelWritesClass(): boolean {
  return false;
}

let explicit: { shapeId: string; classId: string } | null = null;

export function markExplicit(shapeId: string, classId: string) {
  if (!shapeId || !classId) return;
  explicit = { shapeId, classId };
}

export function explicitClass(shapeId: string): string | null {
  if (!explicit || explicit.shapeId !== shapeId) return null;
  return explicit.classId;
}

export function clearExplicit() {
  explicit = null;
}
