"use client";

import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTranslation } from "react-i18next";
import * as Switch from "@radix-ui/react-switch";
import { BringToFront, Calendar, Check, Combine, CopyPlus, Eye, EyeOff, Hash, Link, List, ListChecks, Lock, LockOpen, MousePointer2, Palette, Plus, SendToBack, SlidersHorizontal, Tags, ToggleLeft, Trash2, Type, X, type LucideIcon } from "lucide-react";
import { api } from "@/lib/api";
import { copyAnnotations } from "@/lib/clipboard";
import { runCommand } from "@/lib/commands";
import { deleteSelected, pasteIntoImage } from "@/lib/draw";
import { Icon, classIconName } from "@/lib/icons";
import { boundsOf } from "@/lib/geom";
import { useStudio } from "@/lib/store";
import type { Annotation, Field, FieldOption } from "@/lib/types";
import { cn, formatNumber } from "@/lib/utils";
import { Modal, Tip } from "@/components/ui";
import { ClassCombo } from "./class-combo";
import { classTitle } from "./lists";

function fieldLabel(field: Field, language: string) {
  return language.startsWith("tr") ? field.label : field.labelEn || field.label;
}

function applies(field: Field, classId: string) {
  if (!field.appliesTo?.length) return true;
  return field.appliesTo.includes(classId);
}

function visible(field: Field, attributes: Annotation["attributes"]) {
  const rule = field.visibleWhen;
  if (!rule) return true;
  const current = attributes[rule.field];
  if (rule.op === "neq") return current !== rule.value;
  return current === rule.value;
}

const ANN_DRAG = "application/x-signlens-ann";
const ANN_DRAG_MANY = "application/x-signlens-ann-many";

function hasAnnDrag(transfer: DataTransfer, many = false) {
  const types = Array.from(transfer.types);
  if (many) return types.includes(ANN_DRAG_MANY);
  return types.includes(ANN_DRAG) || types.includes(ANN_DRAG_MANY);
}

function readAnnIds(transfer: DataTransfer) {
  const raw = transfer.getData(ANN_DRAG) || transfer.getData("text/plain");
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return parsed.filter((id): id is string => typeof id === "string" && id.length > 0);
  } catch {
    return raw.split(",").map((id) => id.trim()).filter(Boolean);
  }
  return [];
}

function settleReview(mode: "accept" | "reject", ids?: string[]) {
  const studio = useStudio.getState();
  const next = studio.editor.annotations.flatMap((row) => {
    const pending = row.attributes?.review === "pending";
    if (ids && !ids.includes(row.id)) return [row];
    if (!pending) return [row];
    if (mode === "reject") return [];
    const attributes = { ...row.attributes };
    delete attributes.review;
    return [{ ...row, attributes, updatedAt: new Date().toISOString() }];
  });
  studio.commit(next, "review");
}

function BarIcon({
  label,
  disabled,
  many,
  danger,
  onClick,
  onDropIds,
  children,
}: {
  label: string;
  disabled?: boolean;
  many?: boolean;
  danger?: boolean;
  onClick: () => void;
  onDropIds?: (ids: string[]) => void;
  children: ReactNode;
}) {
  const [over, setOver] = useState(false);
  return (
    <Tip label={label}>
      <button
        type="button"
        aria-label={label}
        aria-disabled={disabled && !over}
        onClick={() => {
          if (disabled) return;
          onClick();
        }}
        onDragEnter={(event) => {
          if (!onDropIds || !hasAnnDrag(event.dataTransfer, many)) return;
          event.preventDefault();
          setOver(true);
        }}
        onDragOver={(event) => {
          if (!onDropIds || !hasAnnDrag(event.dataTransfer, many)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
          if (!over) setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          if (!onDropIds) return;
          event.preventDefault();
          setOver(false);
          const ids = readAnnIds(event.dataTransfer);
          if (many && ids.length < 2) return;
          if (ids.length) onDropIds(ids);
        }}
        className={cn(
          "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted transition-colors duration-[140ms] hover:bg-panel-2 hover:text-ink [&_svg]:pointer-events-none",
          disabled && !over && "opacity-40",
          over && (danger ? "bg-danger/15 text-ink" : "bg-accent/15 text-ink"),
        )}
      >
        {children}
      </button>
    </Tip>
  );
}

export function ObjectList() {
  const { t, i18n } = useTranslation();
  const annotations = useStudio((state) => state.editor.annotations);
  const selected = useStudio((state) => state.editor.selected);
  const classes = useStudio((state) => state.classes);
  const select = useStudio((state) => state.select);
  const patchAnnotation = useStudio((state) => state.patchAnnotation);
  const pending = annotations.some((row) => row.attributes?.review === "pending");
  const parent = useRef<HTMLDivElement>(null);
  const hoveredRef = useRef<string | null>(null);
  const overRef = useRef(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const [dragIds, setDragIds] = useState<string[] | null>(null);
  const virtualizer = useVirtualizer({ count: annotations.length, getScrollElement: () => parent.current, estimateSize: () => 32, overscan: 8 });

  function setHover(id: string | null) {
    hoveredRef.current = id;
    setHovered(id);
  }

  function targetIds() {
    const studio = useStudio.getState();
    const hover = hoveredRef.current;
    if (hover && studio.editor.annotations.some((row) => row.id === hover)) {
      if (studio.editor.selected.includes(hover)) return studio.editor.selected;
      return [hover];
    }
    return studio.editor.selected;
  }

  function aim(ids?: string[]) {
    const chosen = ids ?? targetIds();
    if (!chosen.length) return [];
    const studio = useStudio.getState();
    const current = studio.editor.selected;
    const same = chosen.length === current.length && chosen.every((id) => current.includes(id));
    if (!same) studio.select(chosen);
    return chosen;
  }

  function beginDrag(event: DragEvent<HTMLDivElement>, id: string) {
    const origin = event.target as HTMLElement;
    if (origin.closest("[data-no-drag]")) {
      event.preventDefault();
      return;
    }
    const studio = useStudio.getState();
    const ids = studio.editor.selected.includes(id) ? [...studio.editor.selected] : [id];
    event.dataTransfer.effectAllowed = "copy";
    event.dataTransfer.setData(ANN_DRAG, JSON.stringify(ids));
    if (ids.length >= 2) event.dataTransfer.setData(ANN_DRAG_MANY, "1");
    event.dataTransfer.setData("text/plain", ids.join(","));
    setDragIds(ids);
    setHover(id);
  }

  function endDrag() {
    setDragIds(null);
  }

  function act(kind: "delete" | "duplicate" | "hide" | "lock" | "front" | "back" | "merge" | "copy", ids?: string[]) {
    if (!aim(ids).length) return;
    if (kind === "delete") deleteSelected();
    else if (kind === "duplicate") {
      copyAnnotations(useStudio.getState().editor.annotations.filter((row) => useStudio.getState().editor.selected.includes(row.id)));
      pasteIntoImage();
    } else if (kind === "copy") copyAnnotations(useStudio.getState().editor.annotations.filter((row) => useStudio.getState().editor.selected.includes(row.id)));
    else if (kind === "hide") runCommand("ann.hide");
    else if (kind === "lock") runCommand("ann.lock");
    else if (kind === "front") runCommand("ann.front");
    else if (kind === "back") runCommand("ann.back");
    else if (kind === "merge") runCommand("ann.merge");
  }

  useEffect(() => {
    if (hovered && !annotations.some((row) => row.id === hovered)) setHover(null);
  }, [annotations, hovered]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!overRef.current) return;
      const node = event.target as HTMLElement | null;
      if (node && (node.tagName === "INPUT" || node.tagName === "TEXTAREA" || node.tagName === "SELECT" || node.isContentEditable)) return;
      const mod = event.metaKey || event.ctrlKey;
      const key = event.key;
      const kind =
        key === "Delete" || key === "Backspace" ? "delete"
        : mod && key.toLowerCase() === "d" ? "duplicate"
        : mod && key.toLowerCase() === "h" ? "hide"
        : mod && key.toLowerCase() === "l" ? "lock"
        : mod && key.toLowerCase() === "c" ? "copy"
        : key === "]" ? "front"
        : key === "[" ? "back"
        : null;
      if (kind) {
        event.preventDefault();
        event.stopPropagation();
        act(kind);
        return;
      }
      if (hoveredRef.current && !mod && key.length === 1) aim();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  const targets = targetIds();
  const targetRows = annotations.filter((row) => targets.includes(row.id));
  const hasTarget = targetRows.length > 0;
  const allHidden = hasTarget && targetRows.every((row) => row.attributes?.hidden);
  const allLocked = hasTarget && targetRows.every((row) => row.attributes?.locked);
  function dropAct(kind: "delete" | "duplicate" | "hide" | "lock" | "front" | "back" | "merge") {
    return (ids: string[]) => {
      const known = ids.filter((id) => useStudio.getState().editor.annotations.some((row) => row.id === id));
      if (!known.length) return;
      if (kind === "merge" && known.length < 2) return;
      act(kind, known);
    };
  }

  function pickRow(event: { shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }, index: number, id: string) {
    if (event.shiftKey && selected.length) {
      const anchor = annotations.findIndex((row) => row.id === selected[selected.length - 1]);
      const from = Math.min(Math.max(anchor, 0), index);
      const to = Math.max(Math.max(anchor, 0), index);
      select(annotations.slice(from, to + 1).map((row) => row.id));
      return;
    }
    if (event.metaKey || event.ctrlKey) {
      select(selected.includes(id) ? selected.filter((item) => item !== id) : [...selected, id]);
      return;
    }
    select([id]);
  }

  return (
    <div
      data-testid="object-list"
      className="flex h-full min-h-0 flex-col"
      onMouseOver={() => {
        overRef.current = true;
      }}
      onMouseLeave={() => {
        overRef.current = false;
        setHover(null);
      }}
    >
      <div className="flex items-center gap-1 px-2 pt-2 text-xs text-muted">
        <span className="min-w-0 flex-1 truncate">{t("objects.count", { count: annotations.length })}</span>
        {pending ? (
          <>
            <button type="button" title={t("review.acceptAll")} className="inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-md px-1 hover:bg-panel-2" onClick={() => settleReview("accept")}>
              <Check className="h-4 w-4 shrink-0" />
              <span className="max-w-24 truncate">{t("review.acceptAll")}</span>
            </button>
            <button type="button" title={t("review.rejectAll")} className="inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-md px-1 hover:bg-panel-2" onClick={() => settleReview("reject")}>
              <X className="h-4 w-4 shrink-0" />
              <span className="max-w-24 truncate">{t("review.rejectAll")}</span>
            </button>
          </>
        ) : null}
      </div>
      <div ref={parent} className="scroll-thin min-h-0 flex-1 overflow-auto p-1">
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
        {virtualizer.getVirtualItems().map((item) => {
          const row = annotations[item.index];
          const index = item.index;
          const klass = classes.find((item) => item.id === row.classId);
          const waiting = row.attributes?.review === "pending";
          const hidden = Boolean(row.attributes?.hidden);
          const locked = Boolean(row.attributes?.locked);
          const box = boundsOf(row.geometry);
          const area = box ? Math.round(Math.abs(box.width * box.height)) : 0;
          const active = selected.includes(row.id);
          return (
            <div
              key={row.id}
              draggable
              aria-grabbed={dragIds?.includes(row.id) || undefined}
              onDragStart={(event) => beginDrag(event, row.id)}
              onDragEnd={endDrag}
              onMouseOver={() => {
                if (hoveredRef.current !== row.id) setHover(row.id);
              }}
              onClick={(event) => {
                if ((event.target as HTMLElement).closest("[data-no-drag]")) return;
                pickRow(event, index, row.id);
              }}
              className={cn(
                "absolute left-0 flex h-8 w-full cursor-grab items-center gap-1 whitespace-nowrap rounded-md px-1 active:cursor-grabbing",
                active ? "bg-panel-2" : hovered === row.id ? "bg-panel-2/70" : "hover:bg-panel-2",
                (hidden || dragIds?.includes(row.id)) && "opacity-50",
              )}
              style={{ transform: `translateY(${item.start}px)` }}
            >
              <button type="button" data-no-drag aria-label={t("m.hide")} className="inline-flex h-7 w-7 items-center justify-center" onClick={() => patchAnnotation(row.id, { attributes: { ...row.attributes, hidden: !hidden } })}>
                {hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
              <button type="button" data-no-drag aria-label={t("m.lock")} className="inline-flex h-7 w-7 items-center justify-center" onClick={() => patchAnnotation(row.id, { attributes: { ...row.attributes, locked: !locked } })}>
                {locked ? <Lock className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5" />}
              </button>
              <div
                role="button"
                tabIndex={0}
                title={klass ? classTitle(klass, i18n.language) : row.classId}
                className="flex h-8 min-w-0 flex-1 items-center gap-2 text-start"
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  pickRow(event, index, row.id);
                }}
              >
                <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: klass?.color || "#0a84ff" }} />
                <Icon name={classIconName(klass?.icon)} />
                <span className="w-5 shrink-0 text-[11px] text-muted">{index + 1}</span>
                <span className="min-w-0 flex-1 truncate">{klass ? classTitle(klass, i18n.language) : row.classId || "RAW"}</span>
                <span className="shrink-0 text-[11px] text-muted">{formatNumber(area, i18n.language)}</span>
                {waiting ? <span className="shrink-0 text-[11px] text-warn">{t("review.pending")}</span> : null}
              </div>
              {active ? (
                <div data-no-drag>
                  <ClassCombo label={t("props.class")} value={row.classId} onChange={(classId) => patchAnnotation(row.id, { classId })} />
                </div>
              ) : null}
              {waiting ? (
                <>
                  <button type="button" data-no-drag title={t("review.accept")} aria-label={t("review.accept")} className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-panel" onClick={() => settleReview("accept", [row.id])}>
                    <Check className="h-4 w-4" />
                  </button>
                  <button type="button" data-no-drag title={t("review.reject")} aria-label={t("review.reject")} className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-panel" onClick={() => settleReview("reject", [row.id])}>
                    <X className="h-4 w-4" />
                  </button>
                </>
              ) : null}
            </div>
          );
        })}
        </div>
      </div>
      <div data-testid="object-list-bar" className="flex h-8 shrink-0 items-center gap-0.5 border-t border-line px-1">
        <BarIcon label={t("m.hide")} disabled={!hasTarget} onClick={() => act("hide")} onDropIds={dropAct("hide")}>
          {allHidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </BarIcon>
        <BarIcon label={t("m.lock")} disabled={!hasTarget} onClick={() => act("lock")} onDropIds={dropAct("lock")}>
          {allLocked ? <Lock className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5" />}
        </BarIcon>
        <span className="mx-0.5 h-4 w-px shrink-0 bg-line" />
        <BarIcon label={t("m.back")} disabled={!hasTarget} onClick={() => act("back")} onDropIds={dropAct("back")}>
          <SendToBack className="h-3.5 w-3.5" />
        </BarIcon>
        <BarIcon label={t("m.front")} disabled={!hasTarget} onClick={() => act("front")} onDropIds={dropAct("front")}>
          <BringToFront className="h-3.5 w-3.5" />
        </BarIcon>
        <span className="ms-auto" />
        <BarIcon label={t("m.merge")} disabled={targetRows.length < 2} many onClick={() => act("merge")} onDropIds={dropAct("merge")}>
          <Combine className="h-3.5 w-3.5" />
        </BarIcon>
        <BarIcon label={t("m.duplicate")} disabled={!hasTarget} onClick={() => act("duplicate")} onDropIds={dropAct("duplicate")}>
          <CopyPlus className="h-3.5 w-3.5" />
        </BarIcon>
        <BarIcon label={t("edit.delete")} disabled={!hasTarget} danger onClick={() => act("delete")} onDropIds={dropAct("delete")}>
          <Trash2 className="h-3.5 w-3.5" />
        </BarIcon>
      </div>
    </div>
  );
}

const RESERVED_ATTR_KEYS = new Set(["hidden", "locked", "review", "source", "linkedTo", "relation", "score", "split", "links", "sourceUrl", "timestamp"]);

type AttrMap = Annotation["attributes"];
type AttrValue = AttrMap[string];

const CONTROL =
  "h-7 w-full min-w-0 rounded-md border border-transparent bg-transparent px-1.5 text-[13px] outline-none transition-colors duration-[140ms] placeholder:text-muted hover:border-line focus:border-accent";

function slugField(raw: string, fallback: string) {
  return raw.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^[^a-z]+/, "") || fallback;
}

function dropKey(record: AttrMap, key: string): AttrMap {
  const next = { ...record };
  delete next[key];
  return next;
}

function extraEntries(values: AttrMap, fields: Field[]) {
  const known = new Set(fields.map((field) => field.id));
  return Object.entries(values).filter(([key]) => !known.has(key) && !RESERVED_ATTR_KEYS.has(key));
}

async function putFields(next: Field[]) {
  const studio = useStudio.getState();
  if (!studio.project) return null;
  try {
    const body = await api<{ fields: Field[] }>(`/api/projects/${studio.project.id}/schema`, {
      method: "PUT",
      body: JSON.stringify({ fields: next }),
    });
    const fields = body.fields || next;
    useStudio.setState({ fields });
    return fields;
  } catch (error) {
    studio.setNotice(error instanceof Error ? error.message : String(error), "error");
    return null;
  }
}

function writeSelected(mutate: (row: Annotation) => Annotation, name = "edit") {
  const studio = useStudio.getState();
  const ids = new Set(studio.editor.selected);
  studio.commit(
    studio.editor.annotations.map((row) => (ids.has(row.id) ? mutate(row) : row)),
    name,
  );
}

function writeSelectedAttrs(mutate: (attrs: AttrMap) => AttrMap) {
  writeSelected((row) => ({ ...row, attributes: mutate(row.attributes || {}), updatedAt: new Date().toISOString() }));
}

function geometryLabel(type: Annotation["geometry"]["type"], t: (key: string) => string) {
  if (type === "bbox") return t("tools.bbox");
  if (type === "polygon") return t("tools.polygon");
  if (type === "obb") return t("tools.obb");
  if (type === "pose") return t("tools.pose");
  return type;
}

export function Properties({ mode = "all" }: { mode?: "all" | "geometry" | "attributes" }) {
  const { t, i18n } = useTranslation();
  const editor = useStudio((state) => state.editor);
  const fields = useStudio((state) => state.fields);
  const classes = useStudio((state) => state.classes);
  const images = useStudio((state) => state.images);
  const setImageAttributes = useStudio((state) => state.setImageAttributes);
  const language = i18n.language;
  const picked = useMemo(
    () => editor.annotations.filter((row) => editor.selected.includes(row.id)),
    [editor.annotations, editor.selected],
  );
  const selected = picked[0];
  const image = images.find((row) => row.id === editor.imageId);
  const showGeometry = mode !== "attributes";
  const showAttrs = mode !== "geometry";
  const mixedClass = picked.length > 1 && new Set(picked.map((row) => row.classId)).size > 1;
  const klass = selected ? classes.find((row) => row.id === selected.classId) : undefined;
  const pending = Boolean(selected?.attributes?.review === "pending" || selected?.attributes?.review === "proposed");
  const hidden = Boolean(selected?.attributes?.hidden);
  const locked = Boolean(selected?.attributes?.locked);
  const annotationFields = selected
    ? fields.filter((field) => field.scope === "annotation" && applies(field, selected.classId) && visible(field, selected.attributes))
    : [];
  const imageFields = fields.filter((field) => field.scope === "image");
  const annotationExtras = selected ? extraEntries(selected.attributes || {}, fields) : [];
  const imageExtras = extraEntries(editor.imageAttributes || {}, fields);

  return (
    <div data-testid="properties" className="scroll-thin h-full overflow-auto">
      {selected ? (
        <div className="border-b border-line px-2 py-2">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: klass?.color || "var(--line)" }} />
            <div className="min-w-0 flex-1 [&_button]:flex [&_button]:h-8 [&_button]:w-full [&_button]:items-center [&_button]:justify-start [&_button]:px-2 [&_button]:text-[13px]">
              <ClassCombo
                label={mixedClass ? t("props.mixed") : t("props.class")}
                value={mixedClass ? "" : selected.classId}
                onChange={(classId) => writeSelected((row) => ({ ...row, classId, updatedAt: new Date().toISOString() }), "class")}
              />
            </div>
            <BarIcon label={t("m.hide")} onClick={() => runCommand("ann.hide")}>
              {hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </BarIcon>
            <BarIcon label={t("m.lock")} onClick={() => runCommand("ann.lock")}>
              {locked ? <Lock className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5" />}
            </BarIcon>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            <span className="inline-flex h-5 items-center rounded px-1.5 text-[11px] text-muted">{geometryLabel(selected.geometry.type, t)}</span>
            {picked.length > 1 ? (
              <span className="inline-flex h-5 items-center rounded bg-panel-2 px-1.5 text-[11px] text-accent">{t("props.selectedCount", { count: picked.length })}</span>
            ) : null}
            {pending ? (
              <>
                <span className="inline-flex h-5 items-center rounded bg-panel-2 px-1.5 text-[11px] text-warn">{t("review.pending")}</span>
                <BarIcon label={t("review.accept")} onClick={() => settleReview("accept", editor.selected)}>
                  <Check className="h-3.5 w-3.5" />
                </BarIcon>
                <BarIcon label={t("review.reject")} onClick={() => settleReview("reject", editor.selected)}>
                  <X className="h-3.5 w-3.5" />
                </BarIcon>
              </>
            ) : null}
            {typeof selected.attributes?.source === "string" && selected.attributes.source ? (
              <span className="inline-flex h-5 max-w-[8rem] truncate rounded px-1.5 text-[11px] text-muted" title={String(selected.attributes.source)}>
                {String(selected.attributes.source)}
              </span>
            ) : null}
          </div>
        </div>
      ) : showGeometry || showAttrs ? (
        <div className="flex flex-col items-center gap-1.5 border-b border-line px-3 py-5 text-center">
          <MousePointer2 className="h-5 w-5 text-muted" />
          <p className="text-[13px] font-medium">{t("props.none")}</p>
          <p className="text-[11px] leading-4 text-muted">{t("props.selectHint")}</p>
        </div>
      ) : null}

      {selected && showGeometry ? (
        <InspectorSection title={t("props.geometry")}>
          <CoordinateBlock annotation={selected} locale={language} />
          {selected.geometry.type === "pose" ? (
            <div className="mt-1">
              <div className="px-2 pb-1 text-[11px] font-medium text-muted">{t("props.visibility")}</div>
              {selected.geometry.keypoints.map((point, index) => (
                <InspectorRow key={index} label={String(index + 1)}>
                  <select
                    className={CONTROL}
                    value={point.visibility}
                    onChange={(event) => {
                      if (selected.geometry.type !== "pose") return;
                      const visibility = Number(event.target.value) as 0 | 1 | 2;
                      const keypoints = selected.geometry.keypoints.map((item, itemIndex) => (itemIndex === index ? { ...item, visibility } : item));
                      useStudio.getState().patchAnnotation(selected.id, { geometry: { ...selected.geometry, keypoints } });
                    }}
                  >
                    <option value={2}>{t("visibility.v2")}</option>
                    <option value={1}>{t("visibility.v1")}</option>
                    <option value={0}>{t("visibility.v0")}</option>
                  </select>
                </InspectorRow>
              ))}
            </div>
          ) : null}
        </InspectorSection>
      ) : null}

      {selected && showAttrs ? (
        <InspectorSection
          title={t("props.attributes")}
          count={annotationFields.length + annotationExtras.length}
          actions={
            <BarIcon label={t("props.schema")} onClick={() => runCommand("ann.schema")}>
              <SlidersHorizontal className="h-3.5 w-3.5" />
            </BarIcon>
          }
        >
          {annotationFields.map((field) => (
            <AttributeEditor
              key={field.id}
              field={field}
              language={language}
              value={selected.attributes[field.id]}
              onChange={(value) => writeSelectedAttrs((attrs) => ({ ...attrs, [field.id]: value }))}
              onClear={() => writeSelectedAttrs((attrs) => dropKey(attrs, field.id))}
              onRemove={() => {
                void putFields(useStudio.getState().fields.filter((item) => item.id !== field.id));
              }}
            />
          ))}
          {annotationExtras.map(([key, value]) => (
            <ExtraEditor
              key={key}
              name={key}
              value={value}
              onChange={(next) => writeSelectedAttrs((attrs) => ({ ...attrs, [key]: next }))}
              onRemove={() => writeSelectedAttrs((attrs) => dropKey(attrs, key))}
            />
          ))}
          {!annotationFields.length && !annotationExtras.length ? (
            <p className="px-2 py-2 text-[11px] leading-4 text-muted">{t("props.emptyAttrs")}</p>
          ) : null}
          <AddAttrForm
            scope="annotation"
            taken={new Set([...annotationFields.map((field) => field.id), ...annotationExtras.map(([key]) => key), ...RESERVED_ATTR_KEYS])}
            onObject={(key, value) => writeSelectedAttrs((attrs) => ({ ...attrs, [key]: value }))}
          />
        </InspectorSection>
      ) : null}

      {showAttrs ? (
        <InspectorSection
          title={t("props.image")}
          count={image ? imageFields.length + imageExtras.length : undefined}
          actions={
            <BarIcon label={t("props.schema")} onClick={() => runCommand("ann.schema")}>
              <SlidersHorizontal className="h-3.5 w-3.5" />
            </BarIcon>
          }
        >
          {image ? (
            <>
              <InspectorRow label={t("props.file")}>
                <span className="block truncate px-1.5 text-[13px]" title={image.name}>{image.name}</span>
              </InspectorRow>
              <InspectorRow label={t("props.size")}>
                <span className="px-1.5 text-[13px] tabular-nums">
                  {image.width} × {image.height}
                </span>
              </InspectorRow>
              {imageFields.map((field) => (
                <AttributeEditor
                  key={field.id}
                  field={field}
                  language={language}
                  value={editor.imageAttributes[field.id]}
                  onChange={(value) => setImageAttributes({ ...editor.imageAttributes, [field.id]: value })}
                  onClear={() => setImageAttributes(dropKey(editor.imageAttributes, field.id))}
                  onRemove={() => {
                    void putFields(useStudio.getState().fields.filter((item) => item.id !== field.id));
                  }}
                />
              ))}
              {imageExtras.map(([key, value]) => (
                <ExtraEditor
                  key={key}
                  name={key}
                  value={value}
                  onChange={(next) => setImageAttributes({ ...editor.imageAttributes, [key]: next })}
                  onRemove={() => setImageAttributes(dropKey(editor.imageAttributes, key))}
                />
              ))}
              {!imageFields.length && !imageExtras.length ? (
                <p className="px-2 py-2 text-[11px] leading-4 text-muted">{t("props.emptyImage")}</p>
              ) : null}
              <AddAttrForm
                scope="image"
                taken={new Set([...imageFields.map((field) => field.id), ...imageExtras.map(([key]) => key), ...RESERVED_ATTR_KEYS])}
                onObject={(key, value) => setImageAttributes({ ...editor.imageAttributes, [key]: value })}
              />
            </>
          ) : (
            <p className="px-2 py-2 text-[11px] leading-4 text-muted">{t("props.openImage")}</p>
          )}
        </InspectorSection>
      ) : null}
    </div>
  );
}

function InspectorSection({ title, count, actions, children }: { title: string; count?: number; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="border-b border-line last:border-b-0">
      <header className="flex h-8 items-center gap-1 px-2">
        <h3 className="min-w-0 flex-1 truncate text-[11px] font-semibold uppercase tracking-wide text-muted">{title}</h3>
        {count != null ? <span className="text-[11px] tabular-nums text-muted">{count}</span> : null}
        {actions}
      </header>
      <div className="pb-1">{children}</div>
    </section>
  );
}

function InspectorRow({ label, icon, stacked, actions, children }: { label: string; icon?: string; stacked?: boolean; actions?: ReactNode; children: ReactNode }) {
  const tools = actions ? (
    <div className="flex h-7 w-14 shrink-0 items-center justify-end opacity-0 transition-opacity duration-[140ms] group-hover:opacity-100 group-focus-within:opacity-100">
      {actions}
    </div>
  ) : null;
  return (
    <div className={cn("group flex gap-1 rounded-md px-1 py-0.5 hover:bg-panel-2", stacked ? "flex-col items-stretch" : "min-h-8 items-center")}>
      <div className={cn("flex min-w-0 items-center gap-1.5", stacked ? "h-8 px-1" : "w-[5.75rem] shrink-0")}>
        {icon ? <Icon name={icon} className="h-3.5 w-3.5 shrink-0 text-muted" /> : null}
        <span className="min-w-0 truncate text-[11px] text-muted" title={label}>{label}</span>
        {stacked ? <span className="ms-auto">{tools}</span> : null}
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-0.5">{children}</div>
      {stacked ? null : tools}
    </div>
  );
}

function RowActions({ onClear, onRemove, clearLabel, removeLabel }: { onClear?: () => void; onRemove?: () => void; clearLabel: string; removeLabel: string }) {
  return (
    <>
      {onClear ? (
        <BarIcon label={clearLabel} onClick={onClear}>
          <X className="h-3.5 w-3.5" />
        </BarIcon>
      ) : null}
      {onRemove ? (
        <BarIcon label={removeLabel} onClick={onRemove}>
          <Trash2 className="h-3.5 w-3.5" />
        </BarIcon>
      ) : null}
    </>
  );
}

function CoordinateBlock({ annotation, locale }: { annotation: Annotation; locale: string }) {
  const { t } = useTranslation();
  const box = boundsOf(annotation.geometry);
  const patch = useStudio((state) => state.patchAnnotation);
  if (!box) return null;
  const area = Math.abs(box.width * box.height);
  const editable = annotation.geometry.type === "bbox";
  function write(key: "x" | "y" | "width" | "height", value: number) {
    if (annotation.geometry.type !== "bbox" || !Number.isFinite(value)) return;
    patch(annotation.id, { geometry: { ...annotation.geometry, [key]: value } });
  }
  const cells = [
    { key: "x" as const, label: "X" },
    { key: "y" as const, label: "Y" },
    { key: "width" as const, label: "W" },
    { key: "height" as const, label: "H" },
  ];
  return (
    <div>
      <div className="grid grid-cols-2 gap-x-1 px-1">
        {cells.map((cell) => (
          <label key={cell.key} className="flex h-8 min-w-0 items-center gap-1.5 rounded-md px-1 hover:bg-panel-2">
            <span className="w-3.5 shrink-0 text-[11px] font-medium text-muted">{cell.label}</span>
            <input
              aria-label={cell.key}
              type="number"
              className="h-7 min-w-0 flex-1 bg-transparent text-[13px] tabular-nums outline-none"
              value={Math.round(box[cell.key] * 10) / 10}
              readOnly={!editable}
              onChange={(event) => write(cell.key, Number(event.target.value))}
            />
          </label>
        ))}
      </div>
      <div className="flex items-center justify-between px-2 py-1 text-[11px] text-muted">
        <span>{t("props.area")}</span>
        <span className="tabular-nums">{formatNumber(area, locale)}</span>
      </div>
      {annotation.geometry.type === "polygon" ? (
        <div className="flex items-center justify-between px-2 py-1 text-[11px] text-muted">
          <span>{t("props.points")}</span>
          <span className="tabular-nums">{annotation.geometry.points.length}</span>
        </div>
      ) : null}
    </div>
  );
}

function AttributeEditor({
  field,
  language,
  value,
  onChange,
  onClear,
  onRemove,
}: {
  field: Field;
  language: string;
  value: AttrValue | undefined;
  onChange: (value: AttrValue) => void;
  onClear?: () => void;
  onRemove?: () => void;
}) {
  const { t } = useTranslation();
  const label = fieldLabel(field, language);
  const icon = classIconName(field.icon);
  const filled = value !== undefined && value !== "" && value !== false && !(Array.isArray(value) && value.length === 0);
  const actions = (
    <RowActions
      onClear={filled ? onClear : undefined}
      onRemove={onRemove}
      clearLabel={t("props.clear")}
      removeLabel={t("props.removeField")}
    />
  );
  if (field.type === "multi") {
    const current = Array.isArray(value) ? value : [];
    return (
      <InspectorRow label={label} icon={icon} stacked actions={actions}>
        <div className="flex min-w-0 flex-1 flex-wrap gap-1 px-1 pb-1">
          {(field.options || []).map((option) => {
            const on = current.includes(option.id);
            const text = language.startsWith("tr") ? option.label : option.labelEn || option.label;
            return (
              <button
                key={option.id}
                type="button"
                title={text}
                onClick={() => onChange(on ? current.filter((item) => item !== option.id) : [...current, option.id])}
                className={cn(
                  "inline-flex h-6 max-w-full items-center gap-1 whitespace-nowrap rounded-full border px-2 text-[11px] transition-colors duration-[140ms]",
                  on ? "border-accent bg-accent text-accent-ink" : "border-line text-ink hover:bg-panel",
                )}
              >
                <Icon name={classIconName(option.icon)} className="h-3 w-3" />
                <span className="truncate">{option.abbr || text}</span>
              </button>
            );
          })}
        </div>
      </InspectorRow>
    );
  }
  if (field.type === "boolean") {
    return (
      <InspectorRow label={label} icon={icon} actions={actions}>
        <div className="flex min-w-0 flex-1 justify-end">
          <Switch.Root
            checked={Boolean(value)}
            onCheckedChange={(checked) => onChange(checked)}
            aria-label={label}
            className="h-5 w-9 shrink-0 rounded-full bg-line transition-colors duration-[140ms] data-[state=checked]:bg-accent"
          >
            <Switch.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-white transition-transform duration-[140ms] data-[state=checked]:translate-x-4 rtl:data-[state=checked]:-translate-x-4" />
          </Switch.Root>
        </div>
      </InspectorRow>
    );
  }
  if (field.type === "single" || field.type === "class_ref") {
    const classes = useStudio.getState().classes;
    const options = field.type === "class_ref" ? classes.map((row) => ({ id: row.id, label: row.title, labelEn: row.titleEn })) : field.options || [];
    return (
      <InspectorRow label={label} icon={icon} actions={actions}>
        <select className={CONTROL} value={String(value || "")} onChange={(event) => onChange(event.target.value)} aria-label={label}>
          <option value="" />
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {language.startsWith("tr") ? option.label : option.labelEn || option.label}
            </option>
          ))}
        </select>
      </InspectorRow>
    );
  }
  const inputType = field.type === "number" ? "number" : field.type === "date" ? "date" : field.type === "color" ? "color" : field.type === "url" ? "url" : "text";
  return (
    <InspectorRow label={label} icon={icon} actions={actions}>
      <input
        type={inputType}
        aria-label={label}
        value={value === undefined || Array.isArray(value) ? "" : String(value)}
        onChange={(event) => onChange(field.type === "number" ? Number(event.target.value) : event.target.value)}
        className={cn(CONTROL, field.type === "number" && "tabular-nums", field.type === "color" && "h-7 w-full p-0.5")}
      />
    </InspectorRow>
  );
}

function ExtraEditor({
  name,
  value,
  onChange,
  onRemove,
}: {
  name: string;
  value: AttrValue;
  onChange: (value: AttrValue) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const actions = <RowActions onRemove={onRemove} clearLabel={t("props.clear")} removeLabel={t("actions.delete")} />;
  if (typeof value === "boolean") {
    return (
      <InspectorRow label={name} actions={actions}>
        <div className="flex min-w-0 flex-1 justify-end">
          <Switch.Root
            checked={value}
            onCheckedChange={(checked) => onChange(checked)}
            aria-label={name}
            className="h-5 w-9 shrink-0 rounded-full bg-line transition-colors duration-[140ms] data-[state=checked]:bg-accent"
          >
            <Switch.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-white transition-transform duration-[140ms] data-[state=checked]:translate-x-4 rtl:data-[state=checked]:-translate-x-4" />
          </Switch.Root>
        </div>
      </InspectorRow>
    );
  }
  const numeric = typeof value === "number";
  return (
    <InspectorRow label={name} actions={actions}>
      <input
        type={numeric ? "number" : "text"}
        aria-label={name}
        value={Array.isArray(value) ? value.join(", ") : String(value)}
        onChange={(event) => onChange(numeric ? Number(event.target.value) : event.target.value)}
        className={cn(CONTROL, numeric && "tabular-nums")}
      />
    </InspectorRow>
  );
}

const FIELD_TYPES: { id: Field["type"]; icon: LucideIcon }[] = [
  { id: "text", icon: Type },
  { id: "number", icon: Hash },
  { id: "boolean", icon: ToggleLeft },
  { id: "single", icon: List },
  { id: "multi", icon: ListChecks },
  { id: "date", icon: Calendar },
  { id: "color", icon: Palette },
  { id: "url", icon: Link },
  { id: "class_ref", icon: Tags },
];

const VEHICLE_OPTIONS: FieldOption[] = [
  { id: "car", label: "Otomobil", labelEn: "Car", abbr: "OTO" },
  { id: "van", label: "Panelvan", labelEn: "Van", abbr: "PAN" },
  { id: "minibus", label: "Minibüs", labelEn: "Minibus", abbr: "MNB" },
  { id: "bus", label: "Otobüs", labelEn: "Bus", abbr: "OTB" },
  { id: "pickup", label: "Kamyonet", labelEn: "Pickup", abbr: "KMT" },
  { id: "truck", label: "Kamyon", labelEn: "Truck", abbr: "KAM" },
  { id: "motorcycle", label: "Motosiklet", labelEn: "Motorcycle", abbr: "MOT" },
  { id: "tractor", label: "Traktör", labelEn: "Tractor", abbr: "TRK" },
];

function uniqueFieldId(raw: string, taken: Set<string>, fallback: string) {
  const base = slugField(raw, fallback);
  if (!taken.has(base)) return base;
  let index = 2;
  while (taken.has(`${base}_${index}`)) index += 1;
  return `${base}_${index}`;
}

function AddAttrForm({
  scope,
  taken,
  onObject,
}: {
  scope: "annotation" | "image";
  taken: Set<string>;
  onObject: (key: string, value: AttrValue) => void;
}) {
  const { t, i18n } = useTranslation();
  const classes = useStudio((state) => state.classes);
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [labelEn, setLabelEn] = useState("");
  const [key, setKey] = useState("");
  const [keyTouched, setKeyTouched] = useState(false);
  const [type, setType] = useState<Field["type"]>("text");
  const [target, setTarget] = useState<"object" | "schema">("schema");
  const [options, setOptions] = useState<FieldOption[]>([]);
  const [optionDraft, setOptionDraft] = useState("");
  const [applies, setApplies] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const needsOptions = type === "single" || type === "multi";
  const objectOnly = type === "text" || type === "number" || type === "boolean";
  const saveTo = objectOnly ? target : "schema";
  const id = slugField(key || label, "");
  const blocked = !id || taken.has(id) || RESERVED_ATTR_KEYS.has(id) || (needsOptions && options.length < 2);

  function reset() {
    setOpen(false);
    setLabel("");
    setLabelEn("");
    setKey("");
    setKeyTouched(false);
    setType("text");
    setTarget("schema");
    setOptions([]);
    setOptionDraft("");
    setApplies([]);
    setError("");
    setBusy(false);
  }

  function writeName(value: string) {
    setLabel(value);
    if (!keyTouched) setKey(slugField(value, ""));
  }

  function applyPreset(kind: "vehicle" | "choice" | "flag") {
    if (kind === "vehicle") {
      setType("single");
      setTarget("schema");
      setLabel(t("props.presetVehicle"));
      setLabelEn("Vehicle type");
      setKey(uniqueFieldId("vehicle_type", taken, "vehicle_type"));
      setKeyTouched(true);
      setOptions(VEHICLE_OPTIONS.map((row) => ({ ...row })));
      setError("");
      return;
    }
    if (kind === "flag") {
      setType("boolean");
      setLabel(t("props.presetFlag"));
      setLabelEn("Flag");
      setKey(uniqueFieldId("flag", taken, "flag"));
      setKeyTouched(true);
      setOptions([]);
      setError("");
      return;
    }
    setType("single");
    setTarget("schema");
    setLabel(t("props.presetChoice"));
    setLabelEn("Choice");
    setKey(uniqueFieldId("choice", taken, "choice"));
    setKeyTouched(true);
    setOptions([]);
    setError("");
  }

  function addOption() {
    const text = optionDraft.trim();
    if (!text) return;
    const nextId = uniqueFieldId(text, new Set(options.map((row) => row.id)), "opt");
    if (options.some((row) => row.id === nextId || row.label.toLowerCase() === text.toLowerCase())) return;
    setOptions([...options, { id: nextId, label: text, labelEn: text }]);
    setOptionDraft("");
  }

  async function submit() {
    if (busy) return;
    if (!slugField(label || key, "")) {
      setError(t("props.needName"));
      return;
    }
    if (taken.has(id) || RESERVED_ATTR_KEYS.has(id)) {
      setError(t("props.taken"));
      return;
    }
    if (needsOptions && options.length < 2) {
      setError(t("props.needOptions"));
      return;
    }
    setError("");
    setBusy(true);
    const value: AttrValue = type === "boolean" ? false : type === "number" ? 0 : type === "multi" ? [] : "";
    const title = label.trim() || id;
    if (saveTo === "schema") {
      const field: Field = {
        id,
        scope,
        type,
        label: title,
        labelEn: labelEn.trim() || title,
        options: needsOptions ? options : undefined,
        appliesTo: applies.length ? applies : undefined,
      };
      const fields = await putFields([...useStudio.getState().fields, field]);
      setBusy(false);
      if (!fields) return;
      if (objectOnly) onObject(id, value);
    } else {
      onObject(id, value);
      setBusy(false);
    }
    reset();
  }

  return (
    <>
      <button
        type="button"
        data-testid={`properties-add-${scope}`}
        className="mt-1 flex h-8 w-full items-center gap-1.5 rounded-md px-2 text-[12px] text-muted transition-colors duration-[140ms] hover:bg-panel-2 hover:text-ink"
        onClick={() => setOpen(true)}
      >
        <Plus className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{t("props.add")}</span>
      </button>
      <Modal flush open={open} title={t("props.addTitle")} onClose={reset}>
        <form
          data-testid="add-attr-dialog"
          className="flex max-h-[min(36rem,calc(84vh-2.75rem))] flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
          onKeyDown={(event) => {
            if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
              event.preventDefault();
              void submit();
            }
          }}
        >
          <div className="min-h-0 flex-1 overflow-auto p-4">
            <div className="flex flex-wrap gap-1">
              <button type="button" className="inline-flex h-7 items-center rounded-md border border-line px-2 text-[12px] hover:bg-panel-2" onClick={() => applyPreset("vehicle")}>
                {t("props.presetVehicle")}
              </button>
              <button type="button" className="inline-flex h-7 items-center rounded-md border border-line px-2 text-[12px] hover:bg-panel-2" onClick={() => applyPreset("choice")}>
                {t("props.presetChoice")}
              </button>
              <button type="button" className="inline-flex h-7 items-center rounded-md border border-line px-2 text-[12px] hover:bg-panel-2" onClick={() => applyPreset("flag")}>
                {t("props.presetFlag")}
              </button>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-1">
              {FIELD_TYPES.map((item) => {
                const IconType = item.icon;
                const selected = type === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => {
                      setType(item.id);
                      if (item.id !== "single" && item.id !== "multi") setOptions([]);
                      if (item.id !== "text" && item.id !== "number" && item.id !== "boolean") setTarget("schema");
                    }}
                    className={cn(
                      "flex h-14 flex-col items-start justify-center gap-1 rounded-md border px-2 text-start transition-colors duration-[140ms]",
                      selected ? "border-accent bg-accent/10 text-ink" : "border-line text-muted hover:bg-panel-2 hover:text-ink",
                    )}
                  >
                    <IconType className="h-4 w-4 shrink-0" />
                    <span className="w-full truncate text-[12px]">{t(`fields.${item.id === "class_ref" ? "classRef" : item.id}`)}</span>
                  </button>
                );
              })}
            </div>
            <label className="mt-3 block">
              <span className="mb-1 block text-[11px] font-medium text-muted">{t("props.key")}</span>
              <input
                autoFocus
                value={label}
                onChange={(event) => writeName(event.target.value)}
                className="h-8 w-full rounded-md border border-line bg-panel px-2 text-[13px] outline-none placeholder:text-muted focus:border-accent"
              />
            </label>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label>
                <span className="mb-1 block text-[11px] font-medium text-muted">{t("props.nameEn")}</span>
                <input
                  value={labelEn}
                  onChange={(event) => setLabelEn(event.target.value)}
                  className="h-8 w-full rounded-md border border-line bg-panel px-2 text-[13px] outline-none focus:border-accent"
                />
              </label>
              <label>
                <span className="mb-1 block text-[11px] font-medium text-muted">{t("props.fieldKey")}</span>
                <input
                  value={key}
                  onChange={(event) => {
                    setKeyTouched(true);
                    setKey(slugField(event.target.value, event.target.value));
                  }}
                  className="h-8 w-full rounded-md border border-line bg-panel px-2 text-[13px] outline-none focus:border-accent"
                />
              </label>
            </div>
            {objectOnly ? (
              <div className="mt-3">
                <span className="mb-1 block text-[11px] font-medium text-muted">{t("props.saveTo")}</span>
                <div className="grid grid-cols-2 gap-1">
                  <button
                    type="button"
                    aria-pressed={saveTo === "object"}
                    className={cn("h-8 rounded-md border px-2 text-[12px]", saveTo === "object" ? "border-accent bg-accent/10" : "border-line hover:bg-panel-2")}
                    onClick={() => setTarget("object")}
                  >
                    {scope === "image" ? t("props.scopeImage") : t("props.scopeObject")}
                  </button>
                  <button
                    type="button"
                    aria-pressed={saveTo === "schema"}
                    className={cn("h-8 rounded-md border px-2 text-[12px]", saveTo === "schema" ? "border-accent bg-accent/10" : "border-line hover:bg-panel-2")}
                    onClick={() => setTarget("schema")}
                  >
                    {t("props.scopeSchema")}
                  </button>
                </div>
              </div>
            ) : null}
            {saveTo === "schema" && scope === "annotation" && classes.length ? (
              <div className="mt-3">
                <span className="mb-1 block text-[11px] font-medium text-muted">{t("props.appliesTo")}</span>
                <p className="mb-1.5 text-[11px] text-muted">{applies.length ? t("props.appliesSome") : t("props.appliesAll")}</p>
                <div className="flex max-h-24 flex-wrap gap-1 overflow-auto">
                  {classes.map((row) => {
                    const on = applies.includes(row.id);
                    return (
                      <button
                        key={row.id}
                        type="button"
                        title={classTitle(row, i18n.language)}
                        onClick={() => setApplies(on ? applies.filter((item) => item !== row.id) : [...applies, row.id])}
                        className={cn(
                          "inline-flex h-6 max-w-full items-center gap-1 rounded-full border px-2 text-[11px]",
                          on ? "border-accent bg-accent/10 text-ink" : "border-line text-muted hover:text-ink",
                        )}
                      >
                        <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: row.color || "#0a84ff" }} />
                        <span className="truncate">{classTitle(row, i18n.language)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
            {needsOptions ? (
              <div className="mt-3">
                <span className="mb-1 block text-[11px] font-medium text-muted">{t("schema.options")}</span>
                <ul className="grid gap-1">
                  {options.map((row) => (
                    <li key={row.id} className="flex h-8 items-center gap-2 rounded-md border border-line px-2">
                      <span className="min-w-0 flex-1 truncate text-[13px]">{row.label}</span>
                      <button type="button" aria-label={t("actions.delete")} className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-panel-2 hover:text-ink" onClick={() => setOptions(options.filter((item) => item.id !== row.id))}>
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="mt-1 flex gap-1">
                  <input
                    value={optionDraft}
                    placeholder={t("props.optionAdd")}
                    onChange={(event) => setOptionDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter") return;
                      event.preventDefault();
                      addOption();
                    }}
                    className="h-8 min-w-0 flex-1 rounded-md border border-line bg-panel px-2 text-[13px] outline-none placeholder:text-muted focus:border-accent"
                  />
                  <button type="button" className="inline-flex h-8 items-center rounded-md border border-line px-2 text-[12px] hover:bg-panel-2" onClick={addOption}>
                    {t("actions.add")}
                  </button>
                </div>
              </div>
            ) : null}
            {error ? <p className="mt-3 text-[12px] text-danger">{error}</p> : null}
          </div>
          <div className="flex h-12 shrink-0 items-center justify-end gap-2 border-t border-line px-4">
            <button type="button" className="inline-flex h-8 items-center rounded-md px-2 text-[13px] text-muted hover:bg-panel-2" onClick={reset}>
              {t("actions.close")}
            </button>
            <button type="submit" disabled={blocked || busy} className="inline-flex h-8 items-center rounded-md bg-accent px-3 text-[13px] text-accent-ink disabled:opacity-40">
              {t("actions.add")}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
