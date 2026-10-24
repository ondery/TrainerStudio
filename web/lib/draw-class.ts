/** The class a new shape receives. The class popup does not change it. */

export function drawClassId(active: string | null, ids: string[], classPopup = false): string | null {
  void classPopup;
  if (active && ids.includes(active)) return active;
  return ids[0] ?? null;
}
