/** Legacy explorer glyph name. A generic folder opens; typed folders keep their icon. */

export function treeGlyph(name: string | undefined, open: boolean): string {
  if (open && (name === "folder" || !name)) return "folder-open";
  return name || "file";
}
