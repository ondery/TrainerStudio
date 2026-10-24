"use client";

import * as ContextMenu from "@radix-ui/react-context-menu";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowDownAZ,
  BadgeCheck,
  CircleDot,
  ClipboardCheck,
  Copy,
  Eye,
  EyeOff,
  Flag,
  FolderOpen,
  Hand,
  Hash,
  Image,
  ImageOff,
  Images,
  LayoutGrid,
  Link2,
  List,
  LocateFixed,
  Lock,
  LockOpen,
  MousePointer2,
  Pentagon,
  PersonStanding,
  Sparkles,
  Square,
  SquareDashed,
  Tags,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAppearance, patchAppearance } from "@/lib/appearance";
import { drawCommands } from "@/lib/draw";
import { toggleFlag, toggleReviewed, useMarks, flaggedSet, reviewedSet } from "@/lib/flags";
import { selectImages, useStudio } from "@/lib/store";
import type { ClassRow, Tool } from "@/lib/types";
import { displayTitle } from "@/lib/titles";
import { cn } from "@/lib/utils";
import { IconButton, TextInput, Tip } from "@/components/ui";
import { Grid, GridItem } from "./grid-view";
import { ImageMarks, marksTitle } from "./image-marks";

const IMAGE_FILTERS: { id: "all" | "unlabeled" | "labeled" | "review" | "flagged" | "reviewed"; icon: LucideIcon; key: string }[] = [
  { id: "all", icon: Images, key: "filters.all" },
  { id: "unlabeled", icon: ImageOff, key: "filters.unlabeled" },
  { id: "labeled", icon: Image, key: "filters.labeled" },
  { id: "review", icon: ClipboardCheck, key: "filters.review" },
  { id: "flagged", icon: Flag, key: "filters.flagged" },
  { id: "reviewed", icon: BadgeCheck, key: "filters.reviewed" },
];

const TOOLS: { id: Tool; key: string; icon: typeof Square }[] = [
  { id: "select", key: "tools.select", icon: MousePointer2 },
  { id: "bbox", key: "tools.bbox", icon: Square },
  { id: "polygon", key: "tools.polygon", icon: Pentagon },
  { id: "pose", key: "tools.pose", icon: PersonStanding },
  { id: "obb", key: "tools.obb", icon: SquareDashed },
  { id: "sam", key: "tools.sam", icon: Sparkles },
  { id: "pan", key: "tools.pan", icon: Hand },
  { id: "link", key: "tool.link", icon: Link2 },
];

export function classTitle(row: ClassRow, language: string) {
  return displayTitle(row, language);
}

export function ToolRail() {
  const { t } = useTranslation();
  const tool = useStudio((state) => state.ui.tool);
  const setTool = useStudio((state) => state.setTool);
  return (
    <div className="flex w-10 shrink-0 flex-col items-center gap-0.5 border-e border-line bg-panel pb-1 pt-3" data-testid="tool-rail">
      {TOOLS.map((item) => {
        const Glyph = item.icon;
        return (
          <IconButton key={item.id} label={t(item.key)} active={tool === item.id} onClick={() => {
            if (item.id !== "link") {
              setTool(item.id);
              return;
            }
            void api("/api/ee/link").then(() => setTool("link")).catch((error: Error) => useStudio.getState().setNotice(error.message, "error"));
          }}>
            <Glyph className="h-4 w-4" />
          </IconButton>
        );
      })}
      <IconButton label={t("view.zoomIn")} onClick={() => drawCommands.zoom(1)}><ZoomIn className="h-4 w-4" /></IconButton>
      <IconButton label={t("view.zoomOut")} onClick={() => drawCommands.zoom(-1)}><ZoomOut className="h-4 w-4" /></IconButton>
    </div>
  );
}

export function ToolBar() {
  const { t } = useTranslation();
  const tool = useStudio((state) => state.ui.tool);
  const setTool = useStudio((state) => state.setTool);
  return (
    <div className="flex flex-wrap gap-0.5 border-b border-line p-1">
      {TOOLS.map((item) => {
        const Glyph = item.icon;
        return (
          <IconButton key={item.id} label={t(item.key)} showLabel active={tool === item.id} onClick={() => setTool(item.id)}>
            <Glyph className="h-4 w-4" />
          </IconButton>
        );
      })}
    </div>
  );
}

export function ImageList() {
  const { t, i18n } = useTranslation();
  const allImages = useStudio((state) => state.images);
  const filter = useStudio((state) => state.ui.filter);
  const query = useStudio((state) => state.ui.query);
  const classFilter = useStudio((state) => state.ui.classFilter);
  const projectId = useStudio((state) => state.project?.id);
  const look = useAppearance();
  const marks = useMarks();
  const images = useMemo(
    () => selectImages(allImages, { filter, query, classFilter }, projectId),
    [allImages, filter, query, classFilter, projectId, look.imageSort, marks],
  );
  const flags = projectId ? flaggedSet(projectId) : new Set<string>();
  const reviewed = projectId ? reviewedSet(projectId) : new Set<string>();
  const current = useStudio((state) => state.editor.imageId);
  const openImage = useStudio((state) => state.openImage);
  const patchUi = useStudio((state) => state.patchUi);
  const parentRef = useRef<HTMLDivElement>(null);
  const thumbView = look.imageView === "thumbs";
  const rowSize = thumbView ? 64 : 32;
  const virtualizer = useVirtualizer({
    count: images.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowSize,
    getItemKey: (index) => images[index]?.id ?? index,
    gap: 4,
    overscan: Math.max(2, look.overscan || 8),
  });
  const imagesRef = useRef(images);
  const virtualizerRef = useRef(virtualizer);
  imagesRef.current = images;
  virtualizerRef.current = virtualizer;
  const pendingReveal = useRef<string | null>(null);
  const revealImage = (id?: string | null) => {
    const target = id || useStudio.getState().editor.imageId;
    if (!target) return;
    const index = imagesRef.current.findIndex((row) => row.id === target);
    if (index >= 0) {
      pendingReveal.current = null;
      requestAnimationFrame(() => {
        virtualizerRef.current.scrollToIndex(index, { align: "center" });
      });
      return;
    }
    pendingReveal.current = target;
    const ui = useStudio.getState().ui;
    if (ui.filter !== "all" || ui.query || ui.classFilter) {
      patchUi({ filter: "all", query: "", classFilter: null });
    }
  };
  useLayoutEffect(() => {
    virtualizerRef.current.measure();
  }, [rowSize]);
  useEffect(() => {
    const onReveal = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      revealImage(detail);
    };
    window.addEventListener("studio-reveal-image", onReveal);
    revealImage(useStudio.getState().editor.imageId);
    return () => window.removeEventListener("studio-reveal-image", onReveal);
  }, [patchUi]);
  useEffect(() => {
    if (!pendingReveal.current) return;
    const index = images.findIndex((row) => row.id === pendingReveal.current);
    if (index < 0) return;
    pendingReveal.current = null;
    requestAnimationFrame(() => {
      virtualizerRef.current.scrollToIndex(index, { align: "center" });
    });
  }, [images]);
  useEffect(() => {
    const node = parentRef.current;
    if (!node) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (!node.contains(target) && document.activeElement !== node && !node.contains(document.activeElement)) return;
      const list = imagesRef.current;
      const index = list.findIndex((row) => row.id === useStudio.getState().editor.imageId);
      const next = index < 0
        ? (event.key === "ArrowDown" ? 0 : list.length - 1)
        : Math.max(0, Math.min(list.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)));
      const row = list[next];
      event.preventDefault();
      event.stopPropagation();
      if (row && row.id !== useStudio.getState().editor.imageId) void openImage(row.id, next);
      if (next >= 0) virtualizerRef.current.scrollToIndex(next, { align: "auto" });
      node.focus({ preventScroll: true });
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [openImage]);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="grid gap-1 px-2 pt-2">
        <div className="flex min-w-0 items-center gap-1">
          <TextInput className="min-w-0 flex-1" value={query} onChange={(event) => patchUi({ query: event.target.value })} placeholder={t("filters.search")} aria-label={t("filters.search")} />
          <Tip label={t(look.imageSort === "count" ? "m.sortCount" : look.imageSort === "status" ? "m.sortStatus" : "m.sortName")}>
            <button
              type="button"
              aria-label={t(look.imageSort === "count" ? "m.sortCount" : look.imageSort === "status" ? "m.sortStatus" : "m.sortName")}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted hover:bg-panel-2 hover:text-ink"
              onClick={() => patchAppearance({ imageSort: look.imageSort === "name" ? "count" : look.imageSort === "count" ? "status" : "name" })}
            >
              {look.imageSort === "count" ? <Hash className="h-3.5 w-3.5" /> : look.imageSort === "status" ? <CircleDot className="h-3.5 w-3.5" /> : <ArrowDownAZ className="h-3.5 w-3.5" />}
            </button>
          </Tip>
          <Tip label={t(thumbView ? "m.thumbs" : "m.list")}>
            <button
              type="button"
              aria-label={t(thumbView ? "m.thumbs" : "m.list")}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted hover:bg-panel-2 hover:text-ink"
              onClick={() => patchAppearance({ imageView: thumbView ? "list" : "thumbs" })}
            >
              {thumbView ? <LayoutGrid className="h-3.5 w-3.5" /> : <List className="h-3.5 w-3.5" />}
            </button>
          </Tip>
          <Tip label={t("images.locate")}>
            <button
              type="button"
              data-testid="images-locate"
              aria-label={t("images.locate")}
              disabled={!current}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted hover:bg-panel-2 hover:text-ink disabled:opacity-40"
              onClick={() => revealImage(current)}
            >
              <LocateFixed className="h-3.5 w-3.5" />
            </button>
          </Tip>
        </div>
        <div className="flex flex-wrap gap-1">
          {IMAGE_FILTERS.map((item) => {
            const Glyph = item.icon;
            const label = t(item.key);
            const active = filter === item.id;
            return (
              <button
                key={item.id}
                type="button"
                title={label}
                aria-label={label}
                aria-pressed={active}
                onClick={() => patchUi({ filter: item.id })}
                className={cn(
                  "inline-flex h-7 min-w-0 flex-1 basis-[calc(33.333%-0.25rem)] items-center justify-center gap-1 rounded-md px-1.5 text-[11px]",
                  active ? "bg-accent text-accent-ink" : "bg-panel-2 text-muted hover:bg-panel hover:text-ink",
                )}
              >
                <Glyph className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{label}</span>
              </button>
            );
          })}
        </div>
        <div className="text-xs text-muted">{t("images.count", { count: images.length })}</div>
      </div>
      <div ref={parentRef} tabIndex={0} className="scroll-thin min-h-0 flex-1 overflow-auto outline-none">
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualizer.getVirtualItems().map((item) => {
            const row = images[item.index];
            if (!row) return null;
            const active = row.id === current;
            const flagged = flags.has(row.id);
            const isReviewed = reviewed.has(row.id);
            const review = row.status === "review";
            return (
              <ContextMenu.Root key={item.key}>
              <ContextMenu.Trigger asChild>
              <button
                type="button"
                title={marksTitle(row.name, { flagged, reviewed: isReviewed, review }, t)}
                data-flagged={flagged ? "1" : "0"}
                data-reviewed={isReviewed ? "1" : "0"}
                data-review={review ? "1" : "0"}
                onClick={() => {
                  parentRef.current?.focus({ preventScroll: true });
                  void openImage(row.id, item.index);
                }}
                className={cn(
                  "absolute left-1 right-1 flex items-center gap-2 whitespace-nowrap rounded-md px-2 text-start",
                  active ? "bg-accent text-accent-ink" : "hover:bg-panel-2",
                )}
                style={{ transform: `translateY(${item.start}px)`, height: rowSize }}
              >
                {projectId ? (
                  <span className={cn("shrink-0 overflow-hidden rounded bg-panel-2", thumbView ? "h-12 w-16" : "h-6 w-8")}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img alt="" src={`/api/projects/${projectId}/images/${row.id}/thumb`} decoding="async" draggable={false} className="h-full w-full object-cover" />
                  </span>
                ) : null}
                <span className="min-w-0 flex-1 truncate">{row.name}</span>
                <ImageMarks flagged={flagged} reviewed={isReviewed} review={review} />
                <span className="shrink-0 text-[11px] opacity-70">{row.annCount}</span>
              </button>
              </ContextMenu.Trigger>
              <ContextMenu.Portal>
                <ContextMenu.Content className="z-[80] min-w-44 rounded-md border border-line bg-panel p-1 text-ink shadow-pop">
                  <ContextMenu.Item className="flex h-8 items-center gap-2 rounded px-2 outline-none data-[highlighted]:bg-panel-2" onSelect={() => void openImage(row.id, item.index)}>
                    <FolderOpen className="h-4 w-4" />
                    <span className="truncate">{t("context.openImage")}</span>
                  </ContextMenu.Item>
                  <ContextMenu.Item className="flex h-8 items-center gap-2 rounded px-2 outline-none data-[highlighted]:bg-panel-2" onSelect={() => void navigator.clipboard.writeText(row.name)}>
                    <Copy className="h-4 w-4" />
                    <span className="truncate">{t("context.copyName")}</span>
                  </ContextMenu.Item>
                </ContextMenu.Content>
              </ContextMenu.Portal>
              </ContextMenu.Root>
            );
          })}
        </div>
      </div>
      <span className="sr-only">{i18n.language}</span>
    </div>
  );
}

export function ClassList() {
  const { t, i18n } = useTranslation();
  const classes = useStudio((state) => state.classes);
  const active = useStudio((state) => state.ui.activeClass);
  const setActiveClass = useStudio((state) => state.setActiveClass);
  const look = useAppearance();
  const [query, setQuery] = useState("");
  const rows = classes
    .filter((row) => {
      if (look.hideEmpty && !(row.count || 0)) return false;
      const blob = `${row.id} ${row.title} ${row.titleEn}`.toLowerCase();
      return blob.includes(query.trim().toLowerCase());
    })
    .sort((a, b) => {
      if (look.sortClasses === "count") return (b.count || 0) - (a.count || 0) || a.index - b.index;
      if (look.sortClasses === "name") return classTitle(a, i18n.language).localeCompare(classTitle(b, i18n.language));
      return a.index - b.index;
    });
  function toggle(kind: "hiddenClasses" | "lockedClasses", id: string) {
    const current = new Set(look[kind]);
    if (current.has(id)) current.delete(id);
    else current.add(id);
    patchAppearance({ [kind]: [...current] });
  }
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="p-2">
        <TextInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("common.search")} aria-label={t("common.search")} />
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-auto px-1 pb-2">
        {rows.map((row) => {
          const hidden = look.hiddenClasses.includes(row.id);
          const locked = look.lockedClasses.includes(row.id);
          const title = classTitle(row, i18n.language);
          return (
          <ContextMenu.Root key={row.id}>
          <ContextMenu.Trigger asChild>
          <div className={cn("flex items-center gap-1 rounded-md px-1", active === row.id ? "bg-panel-2" : "hover:bg-panel-2", hidden && "opacity-50")}>
            <button type="button" title={`${row.index} ${title}`} onClick={() => setActiveClass(row.id)} className="min-w-0 flex-1 text-start">
              <Grid cols={12} gap={8} className="h-8 items-center">
                <GridItem span={1}><span className="block h-3 w-3 rounded-sm" style={{ background: row.color }} /></GridItem>
                {look.showIndexes ? <GridItem span={1}><span className="text-[11px] text-muted">{row.index}</span></GridItem> : null}
                <GridItem span={look.showIndexes ? 6 : 7}><span className="block truncate">{title}</span></GridItem>
                <GridItem span={2}><span className="block text-end text-[11px] text-muted">{row.count || 0}</span></GridItem>
                <GridItem span={2}><span className="block text-end text-[11px] text-muted">{look.classHotkeys && row.index < 9 ? row.index + 1 : ""}</span></GridItem>
              </Grid>
            </button>
            <button type="button" aria-label={t("m.hideClass")} className="inline-flex h-7 w-7 items-center justify-center" onClick={() => toggle("hiddenClasses", row.id)}>{hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}</button>
            <button type="button" aria-label={t("m.lockClass")} className="inline-flex h-7 w-7 items-center justify-center" onClick={() => toggle("lockedClasses", row.id)}>{locked ? <Lock className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5" />}</button>
          </div>
          </ContextMenu.Trigger>
          <ContextMenu.Portal>
            <ContextMenu.Content className="z-[80] min-w-44 rounded-md border border-line bg-panel p-1 text-ink shadow-pop">
              <ContextMenu.Item className="flex h-8 items-center gap-2 rounded px-2 outline-none data-[highlighted]:bg-panel-2" onSelect={() => setActiveClass(row.id)}>
                <Tags className="h-4 w-4" />
                <span className="truncate">{t("context.activateClass")}</span>
              </ContextMenu.Item>
              <ContextMenu.Item className="flex h-8 items-center gap-2 rounded px-2 outline-none data-[highlighted]:bg-panel-2" onSelect={() => void navigator.clipboard.writeText(row.id)}>
                <Copy className="h-4 w-4" />
                <span className="truncate">{t("context.copyKey")}</span>
              </ContextMenu.Item>
            </ContextMenu.Content>
          </ContextMenu.Portal>
          </ContextMenu.Root>
          );
        })}
      </div>
    </div>
  );
}

export function Filmstrip() {
  const allImages = useStudio((state) => state.images);
  const filter = useStudio((state) => state.ui.filter);
  const query = useStudio((state) => state.ui.query);
  const classFilter = useStudio((state) => state.ui.classFilter);
  const projectId = useStudio((state) => state.project?.id);
  const look = useAppearance();
  const marks = useMarks();
  const images = useMemo(
    () => selectImages(allImages, { filter, query, classFilter }, projectId),
    [allImages, filter, query, classFilter, projectId, look.imageSort, marks],
  );
  const current = useStudio((state) => state.editor.imageId);
  const openImage = useStudio((state) => state.openImage);
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    horizontal: true,
    count: images.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 104,
    overscan: Math.max(2, look.overscan || 8),
  });
  return (
    <div ref={parentRef} dir="ltr" className="scroll-thin h-full overflow-auto bg-panel">
      <div style={{ width: virtualizer.getTotalSize(), height: "100%", position: "relative" }}>
        {virtualizer.getVirtualItems().map((item) => {
          const row = images[item.index];
          const active = row.id === current;
          return (
            <button
              key={row.id}
              type="button"
              title={row.name}
              onClick={() => void openImage(row.id, item.index)}
              className={cn("absolute top-1 flex w-24 flex-col gap-1 rounded-md border p-1", active ? "border-accent" : "border-transparent hover:border-line")}
              style={{ transform: `translateX(${item.start}px)`, height: Math.max(48, look.filmstripHeight || 72) }}
            >
              {projectId ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img alt="" src={`/api/projects/${projectId}/images/${row.id}/thumb`} className="h-full min-h-0 w-full rounded object-cover" />
              ) : null}
              <span className="truncate text-[10px] text-muted">{row.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
