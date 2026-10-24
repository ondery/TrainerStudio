/** Keep in step with trainer_studio/nav.py. */
export function nextId(ordered: string[], current: string, anchor: number, direction: 1 | -1) {
  if (ordered.includes(current)) {
    const index = ordered.indexOf(current) + direction;
    return index >= 0 && index < ordered.length ? ordered[index] : null;
  }
  if (direction > 0) return anchor >= 0 && anchor < ordered.length ? ordered[anchor] : null;
  const index = anchor - 1;
  return index >= 0 && index < ordered.length ? ordered[index] : null;
}
