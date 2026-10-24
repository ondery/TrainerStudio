"use client";

import * as ContextMenu from "@radix-ui/react-context-menu";
import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTranslation } from "react-i18next";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Flag,
  FolderOpen,
  FolderPlus,
  Pencil,
  RefreshCw,
  type LucideIcon,
} from "lucide-react";
import { TreeIcon } from "./tree-icon";
import { ImageMarks, marksTitle } from "./image-marks";
import { api } from "@/lib/api";
import { flaggedSet, reviewedSet, toggleFlag, toggleReviewed, useMarks } from "@/lib/flags";
import { useStudio } from "@/lib/store";
import type { ImageRow } from "@/lib/types";

type Entry = { name: string; path: string; kind: "dir" | "file"; color: string; icon: string; imageId: string };
type Row = Entry & { depth: number; image?: ImageRow };

const menuClass = "z-[90] min-w-56 overflow-hidden rounded-md border border-line bg-panel p-1 text-ink shadow-pop";
const itemClass = "flex h-7 w-full items-center gap-2 whitespace-nowrap rounded-sm px-3 text-[13px] leading-none outline-none data-[highlighted]:bg-panel-2 data-[disabled]:opacity-40";

function joinPath(root: string, rel: string) {
  const slash = root.includes("\\") && !root.includes("/") ? "\\" : "/";
  return `${root.replace(/[\\/]+$/, "")}${slash}${rel.replace(/^[\\/]+/, "")}`;
}

function visibleRows(entries: Entry[], images: ImageRow[], query: string, closed: Set<string>): Row[] {
  const byId = new Map(images.map((image) => [image.id, image]));
  const needle = query.trim().toLowerCase();
  const rows: Row[] = [];
  let hideBelow = -1;
  for (const entry of entries) {
    const depth = entry.path.split("/").filter(Boolean).length - 1;
    if (hideBelow >= 0) {
      if (depth > hideBelow) continue;
      hideBelow = -1;
    }
    const image = entry.imageId ? byId.get(entry.imageId) : undefined;
    if (needle && !`${entry.name} ${entry.path}`.toLowerCase().includes(needle)) {
      if (entry.kind === "dir") rows.push({ ...entry, depth, image });
      continue;
    }
    rows.push({ ...entry, depth, image });
    if (entry.kind === "dir" && closed.has(entry.path)) hideBelow = depth;
  }
  return rows;
}

function nextFileIndex(rows: Row[], currentId: string | undefined, direction: 1 | -1): number {
  const current = rows.findIndex((row) => row.image && row.image.id === currentId);
  const start = current >= 0 ? current : direction > 0 ? -1 : rows.length;
  for (let i = start + direction; i >= 0 && i < rows.length; i += direction) {
    if (rows[i]?.image) return i;
  }
  return current;
}

function MenuRow({ icon: Icon, label, disabled, active, onSelect }: { icon: LucideIcon; label: string; disabled?: boolean; active?: boolean; onSelect: () => void }) {
  return (
    <ContextMenu.Item disabled={disabled} onSelect={onSelect} className={itemClass} data-active={active ? "1" : "0"}>
      <Icon className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {active ? <Check className="h-3.5 w-3.5 shrink-0 text-accent" /> : null}
    </ContextMenu.Item>
  );
}

export function ExplorerPanel() {
  const { t } = useTranslation();
  const project = useStudio((state) => state.project);
  const images = useStudio((state) => state.images);
  const currentId = useStudio((state) => state.editor.imageId);
  const openImage = useStudio((state) => state.openImage);
  const refresh = useStudio((state) => state.refresh);
  useMarks();
  const flags = project ? flaggedSet(project.id) : new Set<string>();
  const reviewed = project ? reviewedSet(project.id) : new Set<string>();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [query, setQuery] = useState("");
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState("");
  const [draft, setDraft] = useState("");
  useEffect(() => {
    if (!project) return undefined;
    let cancel = false;
    void api<{ entries: Entry[] }>(`/api/projects/${project.id}/tree`)
      .then((body) => {
        if (!cancel) setEntries(body.entries || []);
      })
      .catch((error: Error) => useStudio.getState().setNotice(error.message, "error"));
    return () => {
      cancel = true;
    };
  }, [project]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (event.key !== "F2" || !project) return;
      const imageId = useStudio.getState().editor.imageId;
      const image = images.find((item) => item.id === imageId);
      if (!image) return;
      event.preventDefault();
      setEditing(image.relPath || image.name);
      setDraft(image.name);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [images, project]);
  const parent = useRef<HTMLDivElement>(null);
  const rows = useMemo(() => visibleRows(entries, images, query, closed), [closed, entries, images, query]);
  const virtualizer = useVirtualizer({ count: rows.length, getScrollElement: () => parent.current, estimateSize: () => 24, overscan: 12 });
  const rowsRef = useRef(rows);
  const virtualizerRef = useRef(virtualizer);
  rowsRef.current = rows;
  virtualizerRef.current = virtualizer;
  useEffect(() => {
    const node = parent.current;
    if (!node) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp" && event.key !== "Enter") return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (!node.contains(target) && document.activeElement !== node && !node.contains(document.activeElement)) return;
      const currentId = useStudio.getState().editor.imageId;
      const list = rowsRef.current;
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Enter") {
        const row = list.find((item) => item.image && item.image.id === currentId) || list.find((item) => item.image);
        if (row?.image) void openImage(row.image.id);
        return;
      }
      const index = nextFileIndex(list, currentId ?? undefined, event.key === "ArrowDown" ? 1 : -1);
      const row = list[index];
      if (row?.image && row.image.id !== currentId) void openImage(row.image.id);
      if (index >= 0) virtualizerRef.current.scrollToIndex(index, { align: "auto" });
      node.focus({ preventScroll: true });
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [openImage]);
  const toggle = (path: string) => {
    setClosed((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };
  const reload = () => {
    if (!project) return;
    void refresh(project.id);
    void api<{ entries: Entry[] }>(`/api/projects/${project.id}/tree`).then((body) => setEntries(body.entries || [])).catch((error: Error) => useStudio.getState().setNotice(error.message, "error"));
  };
  const copyText = (value: string) => {
    if (!value) return;
    void navigator.clipboard.writeText(value);
  };
  const reveal = (path: string) => {
    if (!project || !path) return;
    void api("/api/fs/reveal", { method: "POST", body: JSON.stringify({ project: project.id, path }) })
      .then(() => useStudio.getState().setNotice(t("explorer.revealed")))
      .catch((error: Error) => useStudio.getState().setNotice(error.message, "error"));
  };
  const makeFolder = (base = "") => {
    if (!project) return;
    const name = window.prompt(t("explorer.folder"));
    if (!name) return;
    const path = base ? `${base.replace(/[\\/]+$/, "")}/${name.replace(/^[\\/]+/, "")}` : name;
    void api(`/api/projects/${project.id}/folders`, { method: "POST", body: JSON.stringify({ path }) }).then(reload).catch((error: Error) => useStudio.getState().setNotice(error.message, "error"));
  };
  const rename = (row: Row) => {
    setEditing(row.path);
    setDraft(row.name);
  };
  const fullPath = (rel: string) => (project?.root ? joinPath(project.root, rel) : rel);
  const treeMenu = (
    <>
      <MenuRow icon={FolderPlus} label={t("explorer.folder")} disabled={!project} onSelect={() => makeFolder()} />
      <MenuRow icon={RefreshCw} label={t("explorer.refresh")} onSelect={reload} />
      <MenuRow icon={ChevronDown} label={t("explorer.collapse")} onSelect={() => setClosed(new Set(rows.filter((row) => row.kind === "dir").map((row) => row.path)))} />
    </>
  );
  const rowMenu = (row: Row) => {
    const dir = row.kind === "dir";
    return (
      <>
        {dir ? (
          <MenuRow icon={closed.has(row.path) ? ChevronRight : ChevronDown} label={t("explorer.open")} onSelect={() => toggle(row.path)} />
        ) : row.image ? (
          <MenuRow icon={FolderOpen} label={t("explorer.open")} onSelect={() => void openImage(row.image!.id)} />
        ) : null}
        {dir ? <MenuRow icon={FolderPlus} label={t("explorer.folder")} disabled={!project} onSelect={() => makeFolder(row.path)} /> : null}
        <MenuRow icon={FolderOpen} label={t("explorer.reveal")} disabled={!project} onSelect={() => reveal(row.path)} />
        <ContextMenu.Separator className="my-1 h-px bg-line" />
        <MenuRow icon={Copy} label={t("context.copyName")} onSelect={() => copyText(row.name)} />
        <MenuRow icon={Copy} label={t("tabs.copyRelative")} onSelect={() => copyText(row.path)} />
        <MenuRow icon={Copy} label={t("tabs.copyPath")} onSelect={() => copyText(fullPath(row.path))} />
        <ContextMenu.Separator className="my-1 h-px bg-line" />
        <MenuRow icon={Pencil} label={t("explorer.rename")} disabled={!project} onSelect={() => rename(row)} />
        {row.image && project ? (
          <>
            <ContextMenu.Separator className="my-1 h-px bg-line" />
            <MenuRow icon={Check} label={t("explorer.reviewed")} active={reviewed.has(row.image.id)} onSelect={() => toggleReviewed(project.id, row.image!.id)} />
            <MenuRow icon={Flag} label={t("explorer.flagged")} active={flags.has(row.image.id)} onSelect={() => toggleFlag(project.id, row.image!.id)} />
            <ContextMenu.Sub>
              <ContextMenu.SubTrigger className={itemClass}>
                <Copy className="h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{t("explorer.split")}</span>
              </ContextMenu.SubTrigger>
              <ContextMenu.Portal>
                <ContextMenu.SubContent className={menuClass}>
                  {["train", "val", "test"].map((split) => (
                    <ContextMenu.Item
                      key={split}
                      className={itemClass}
                      onSelect={() => {
                        void api(`/api/projects/${project.id}/images/${row.image!.id}/split`, { method: "POST", body: JSON.stringify({ split }) }).then(() => refresh(project.id));
                      }}
                    >
                      {split}
                    </ContextMenu.Item>
                  ))}
                </ContextMenu.SubContent>
              </ContextMenu.Portal>
            </ContextMenu.Sub>
          </>
        ) : null}
      </>
    );
  };
  return (
    <div data-testid="explorer" className="flex h-full min-h-0 flex-col text-xs">
      <div className="flex items-center gap-1 border-b border-line px-1 py-1">
        <span className="min-w-0 flex-1 truncate px-1 text-[11px] uppercase tracking-wide text-muted">{t("explorer.dataset")}</span>
        <button type="button" title={t("explorer.collapse")} aria-label={t("explorer.collapse")} className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-panel-2" onClick={() => setClosed(new Set(rows.filter((row) => row.kind === "dir").map((row) => row.path)))}>
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
        <button type="button" title={t("explorer.refresh")} aria-label={t("explorer.refresh")} className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-panel-2" onClick={reload}>
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
        <button type="button" title={t("explorer.folder")} aria-label={t("explorer.folder")} className="inline-flex h-6 w-6 items-center justify-center rounded hover:bg-panel-2" onClick={() => makeFolder()}>
          <FolderPlus className="h-3.5 w-3.5" />
        </button>
      </div>
      <input aria-label={t("explorer.filter")} placeholder={t("explorer.filter")} value={query} onChange={(event) => setQuery(event.target.value)} className="mx-1 my-1 h-7 rounded border border-line bg-panel-2 px-2" />
      <ContextMenu.Root>
        <ContextMenu.Trigger asChild>
          <div ref={parent} data-testid="explorer-tree" tabIndex={0} className="scroll-thin min-h-0 flex-1 overflow-auto outline-none">
            <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
              {virtualizer.getVirtualItems().map((item) => {
                const row = rows[item.index];
                const open = Boolean(row.image && currentId === row.image.id);
                const flagged = Boolean(row.image && flags.has(row.image.id));
                const isReviewed = Boolean(row.image && reviewed.has(row.image.id));
                const review = row.image?.status === "review";
                return (
                  <ContextMenu.Root key={row.path}>
                    <ContextMenu.Trigger asChild>
                      <button
                        type="button"
                        title={row.image ? marksTitle(row.name, { flagged, reviewed: isReviewed, review }, t) : row.name}
                        data-kind={row.kind}
                        data-icon={row.icon}
                        data-open={row.kind === "dir" && !closed.has(row.path) ? "1" : "0"}
                        data-flagged={flagged ? "1" : "0"}
                        data-reviewed={isReviewed ? "1" : "0"}
                        data-review={review ? "1" : "0"}
                        className={`absolute left-0 flex h-6 w-full items-center gap-1 px-1 text-start hover:bg-panel-2 ${open ? "bg-panel-2" : ""}`}
                        style={{ top: item.start, paddingInlineStart: 4 + row.depth * 12 }}
                        onClick={() => {
                          parent.current?.focus({ preventScroll: true });
                          if (row.kind === "dir") toggle(row.path);
                          else if (row.image) void openImage(row.image.id);
                        }}
                      >
                        {row.kind === "dir" ? (closed.has(row.path) ? <ChevronRight className="h-3 w-3 shrink-0" /> : <ChevronDown className="h-3 w-3 shrink-0" />) : null}
                        <TreeIcon name={row.icon} color={row.color} open={row.kind === "dir" && !closed.has(row.path)} />
                        <span className="min-w-0 flex-1 truncate">{row.name}</span>
                        {row.image ? <ImageMarks flagged={flagged} reviewed={isReviewed} review={review} /> : null}
                        {row.image ? <span className="shrink-0 text-[10px] text-muted">{row.image.annCount}</span> : null}
                      </button>
                    </ContextMenu.Trigger>
                    <ContextMenu.Portal>
                      <ContextMenu.Content data-testid="explorer-menu" collisionPadding={8} className={menuClass}>
                        {rowMenu(row)}
                      </ContextMenu.Content>
                    </ContextMenu.Portal>
                  </ContextMenu.Root>
                );
              })}
            </div>
          </div>
        </ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Content data-testid="explorer-menu" collisionPadding={8} className={menuClass}>
            {treeMenu}
          </ContextMenu.Content>
        </ContextMenu.Portal>
      </ContextMenu.Root>
      {editing ? (
        <form
          className="border-t border-line p-1"
          onSubmit={(event) => {
            event.preventDefault();
            if (!project || !draft.trim()) return;
            void api(`/api/projects/${project.id}/rename`, { method: "POST", body: JSON.stringify({ path: editing, name: draft.trim() }) })
              .then(reload)
              .catch((error: Error) => useStudio.getState().setNotice(error.message, "error"));
            setEditing("");
          }}
        >
          <input aria-label={t("explorer.rename")} data-testid="explorer-rename" value={draft} autoFocus onChange={(event) => setDraft(event.target.value)} className="h-7 w-full rounded border border-line bg-panel-2 px-2" />
        </form>
      ) : null}
    </div>
  );
}
