"use client";

import {
  Archive,
  Braces,
  Cpu,
  Database,
  File,
  FileArchive,
  FileCode,
  FileText,
  Film,
  FlaskConical,
  Folder,
  FolderOpen,
  Image as ImageIcon,
  Images,
  Inbox,
  Package,
  Puzzle,
  Settings,
  Sparkles,
  Table,
  Tag,
  Terminal,
  type LucideIcon,
} from "lucide-react";
import { treeGlyph } from "@/lib/tree-glyph";

const ICONS: Record<string, LucideIcon> = {
  archive: Archive,
  braces: Braces,
  cpu: Cpu,
  database: Database,
  file: File,
  "file-archive": FileArchive,
  "file-code": FileCode,
  "file-text": FileText,
  film: Film,
  flask: FlaskConical,
  "flask-conical": FlaskConical,
  folder: Folder,
  "folder-open": FolderOpen,
  image: ImageIcon,
  images: Images,
  inbox: Inbox,
  package: Package,
  puzzle: Puzzle,
  settings: Settings,
  sparkles: Sparkles,
  table: Table,
  tag: Tag,
  terminal: Terminal,
};

export function TreeIcon({ name, color, open = false }: { name?: string; color?: string; open?: boolean }) {
  const key = treeGlyph(name, open);
  const Icon = ICONS[key] || File;
  return <Icon data-glyph={key} size={14} color={color || "currentColor"} strokeWidth={1.75} aria-hidden className="shrink-0" />;
}
