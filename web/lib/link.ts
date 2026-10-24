export function linkPair(left: string, right: string): { from: string; to: string } {
  if (!left || !right || left === right) throw new Error("link.same");
  return { from: left, to: right };
}

let pending = "";

export function takeLink(id: string): { from: string; to: string } | null {
  if (!pending || pending === id) {
    pending = id;
    return null;
  }
  const pair = linkPair(pending, id);
  pending = "";
  return pair;
}
