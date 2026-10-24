import assert from "node:assert/strict";
import { classHotkeyAllowed, clearExplicit, continueDecision, explicitClass, markExplicit, wheelWritesClass } from "../web/lib/save-next-rules.ts";

const highlighted = continueDecision({ pickerOpen: true, explicitClassId: null, shapeClassId: "A" });
assert.equal(highlighted.classId, null);
assert.equal(highlighted.step, "save");
assert.equal(highlighted.closePicker, true);

const chosen = continueDecision({ pickerOpen: true, explicitClassId: "B", shapeClassId: "A" });
assert.equal(chosen.classId, "B");
assert.equal(chosen.step, "save");

const hovered = continueDecision({ pickerOpen: true, explicitClassId: null, shapeClassId: "A" });
assert.equal(hovered.classId, null);
assert.equal(hovered.step, "save");

const unclassed = continueDecision({ pickerOpen: true, explicitClassId: null, shapeClassId: "" });
assert.equal(unclassed.step, "stay");
assert.equal(unclassed.classId, null);
assert.equal(unclassed.focusPicker, true);
assert.equal(unclassed.closePicker, false);

const proposal = continueDecision({ pickerOpen: true, explicitClassId: null, shapeClassId: "sign" });
assert.equal(proposal.classId, null);
assert.equal(proposal.step, "save");

const explicitProposal = continueDecision({ pickerOpen: true, explicitClassId: "B", shapeClassId: "sign" });
assert.equal(explicitProposal.classId, "B");

assert.equal(classHotkeyAllowed("INPUT"), false);
assert.equal(classHotkeyAllowed("TEXTAREA"), false);
assert.equal(classHotkeyAllowed("SELECT"), false);
assert.equal(classHotkeyAllowed("DIV", true), false);
assert.equal(classHotkeyAllowed("BUTTON"), true);
assert.equal(wheelWritesClass(), false);

clearExplicit();
markExplicit("shape-1", "B");
assert.equal(explicitClass("shape-1"), "B");
assert.equal(explicitClass("shape-2"), null);
clearExplicit();
assert.equal(explicitClass("shape-1"), null);

console.log("save-next unit ok");
