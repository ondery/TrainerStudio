"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTranslation } from "react-i18next";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Popover from "@radix-ui/react-popover";
import * as Select from "@radix-ui/react-select";
import {
  Car,
  Check,
  Circle,
  Flag,
  Keyboard,
  MoreHorizontal,
  Plus,
  Search,
  Signpost,
  Square,
  Star,
  Tag,
  Triangle,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { api } from "@/lib/api";
import { useStudio } from "@/lib/store";
import { displayTitle } from "@/lib/titles";
import type { ClassRow } from "@/lib/types";
import { cn } from "@/lib/utils";

const ICONS: { name: string; Icon: LucideIcon }[] = [
  { name: "Tag", Icon: Tag },
  { name: "Circle", Icon: Circle },
  { name: "Square", Icon: Square },
  { name: "Triangle", Icon: Triangle },
  { name: "Star", Icon: Star },
  { name: "Car", Icon: Car },
  { name: "Signpost", Icon: Signpost },
  { name: "Flag", Icon: Flag },
];
const SWATCHES = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#14b8a6", "#0ea5e9", "#3b82f6", "#6366f1", "#a855f7", "#ec4899", "#64748b", "#0f172a"];
const KEY = /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/;
const NONE = "__none";
const COMPACT = 56;
const OPEN = 88;
const FALLBACK_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "q", "w", "e", "r", "t", "y", "u", "i", "o", "p"];

type Preview = {
  op: string;
  files: number;
  fileNames: string[];
  droppedBoxes: number;
  rewrittenBoxes: number;
  body: Record<string, unknown>;
};

type Drafts = Record<string, Partial<Record<"id" | "title" | "titleEn" | "attrs", string>>>;

type TableApi = {
  t: (key: string, opts?: Record<string, unknown>) => string;
  language: string;
  classes: ClassRow[];
  drafts: Drafts;
  setDraft: (id: string, field: "id" | "title" | "titleEn" | "attrs", value: string) => void;
  style: (row: ClassRow, patch: Record<string, unknown>) => Promise<void>;
  rename: (row: ClassRow, next: string) => Promise<void>;
  ask: (op: string, body: Record<string, unknown>) => Promise<void>;
};

function isDirty(row: ClassRow, draft?: Drafts[string]) {
  if (!draft) return false;
  return (
    (draft.id !== undefined && draft.id !== row.id)
    || (draft.title !== undefined && draft.title !== row.title)
    || (draft.titleEn !== undefined && draft.titleEn !== row.titleEn)
    || (draft.attrs !== undefined && draft.attrs !== (row.attrs || ""))
  );
}

export function ClassTable() {
  const { t, i18n } = useTranslation();
  const classes = useStudio((state) => state.classes);
  const styleFiles = useStudio((state) => state.styleFiles);
  const projectId = useStudio((state) => state.project?.id);
  const active = useStudio((state) => state.ui.activeClass);
  const setActiveClass = useStudio((state) => state.setActiveClass);
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<Preview | null>(null);
  const [drafts, setDrafts] = useState<Drafts>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<TableApi>(null!);
  const needle = query.trim().toLowerCase();
  const rows = useMemo(
    () => classes.filter((row) => `${row.index} ${row.id} ${row.title} ${row.titleEn}`.toLowerCase().includes(needle)),
    [classes, needle],
  );

  function setDraft(id: string, field: "id" | "title" | "titleEn" | "attrs", value: string) {
    setDrafts((current) => ({ ...current, [id]: { ...current[id], [field]: value } }));
  }

  async function style(row: ClassRow, patch: Record<string, unknown>) {
    if (!projectId) return;
    try {
      await api(`/api/projects/${projectId}/classes/${encodeURIComponent(row.id)}`, { method: "PATCH", body: JSON.stringify(patch) });
      await useStudio.getState().reloadClasses();
    } catch (error) {
      useStudio.getState().setNotice(error instanceof Error ? error.message : String(error), "error");
    }
  }

  async function rename(row: ClassRow, next: string) {
    if (!projectId || next === row.id) return;
    if (!KEY.test(next)) {
      useStudio.getState().setNotice(t("class.badKey"), "error");
      return;
    }
    try {
      await api(`/api/projects/${projectId}/classes/apply`, { method: "POST", body: JSON.stringify({ op: "rename", key: row.id, next }) });
      setDrafts((current) => {
        const copy = { ...current };
        delete copy[row.id];
        return copy;
      });
      await useStudio.getState().refresh(projectId);
      useStudio.getState().setNotice(t("class.appended"), "update");
    } catch (error) {
      useStudio.getState().setNotice(error instanceof Error ? error.message : String(error), "error");
    }
  }

  async function ask(op: string, body: Record<string, unknown>) {
    if (!projectId) return;
    try {
      const preview = await api<Preview>(`/api/projects/${projectId}/classes/preview`, { method: "POST", body: JSON.stringify({ op, ...body }) });
      setPending({ ...preview, op, body: { op, ...body } });
    } catch (error) {
      useStudio.getState().setNotice(error instanceof Error ? error.message : String(error), "error");
    }
  }

  async function confirm() {
    if (!projectId || !pending) return;
    try {
      await api(`/api/projects/${projectId}/classes/apply`, { method: "POST", body: JSON.stringify({ ...pending.body, confirm: true }) });
      setPending(null);
      await useStudio.getState().refresh(projectId);
    } catch (error) {
      useStudio.getState().setNotice(error instanceof Error ? error.message : String(error), "error");
    }
  }

  async function undo() {
    if (!projectId) return;
    try {
      await api(`/api/projects/${projectId}/classes/undo`, { method: "POST", body: "{}" });
      await useStudio.getState().refresh(projectId);
    } catch (error) {
      useStudio.getState().setNotice(error instanceof Error ? error.message : String(error), "error");
    }
  }

  apiRef.current = { t, language: i18n.language, classes, drafts, setDraft, style, rename, ask };
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (index) => {
      const row = rows[index];
      if (!row) return COMPACT;
      return active === row.id || isDirty(row, drafts[row.id]) ? OPEN : COMPACT;
    },
    overscan: 10,
  });

  useEffect(() => {
    virtualizer.measure();
  }, [active, drafts, rows, virtualizer]);

  return (
    <div data-testid="class-table" className="flex h-full min-h-0 flex-col text-[13px]">
      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-line px-2">
        <label className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute start-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
          <input
            aria-label={t("common.search")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("common.search")}
            className="h-7 w-full rounded-md border border-line bg-panel-2 pe-2 ps-7 text-[12px] outline-none placeholder:text-muted"
          />
        </label>
        {styleFiles.length ? (
          <span data-testid="class-style-files" className="sr-only">{t("class.files", { files: styleFiles.join(", ") })}</span>
        ) : null}
        <span className="shrink-0 px-1 text-[11px] tabular-nums text-muted" title={styleFiles.join(", ")}>{classes.length}</span>
        <button type="button" title={t("class.undo")} aria-label={t("class.undo")} className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted hover:bg-panel-2 hover:text-ink" onClick={() => void undo()}>
          <Undo2 className="h-3.5 w-3.5" />
        </button>
        <button type="button" data-testid="classes-edit" title={t("class.add")} aria-label={t("class.add")} className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-accent text-accent-ink hover:bg-accent" onClick={() => useStudio.getState().patchUi({ dialog: "add-class" })}>
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
      <div ref={scrollRef} className="scroll-thin min-h-0 flex-1 overflow-auto">
        {rows.length === 0 ? (
          <div className="flex h-full min-h-[12rem] flex-col items-center justify-center gap-2 px-6 text-center">
            <Tag className="h-4 w-4 text-muted" />
            <p className="text-muted">{t("panel.empty")}</p>
          </div>
        ) : (
          <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
            {virtualizer.getVirtualItems().map((item) => {
              const row = rows[item.index];
              const table = apiRef.current;
              const draft = drafts[row.id];
              const dirty = isDirty(row, draft);
              const selected = active === row.id;
              const open = selected || dirty;
              const name = draft?.id ?? row.id;
              const title = draft?.title ?? row.title;
              const titleEn = draft?.titleEn ?? row.titleEn;
              const attrs = draft?.attrs ?? (row.attrs || "");
              return (
                <div
                  key={row.id}
                  data-index={item.index}
                  data-class-id={row.id}
                  data-deprecated={row.visible ? "0" : "1"}
                  data-dirty={dirty ? "1" : "0"}
                  className="absolute inset-x-0 px-1"
                  style={{ top: item.start, height: item.size }}
                  onClick={() => setActiveClass(row.id)}
                >
                  <div
                    className={cn(
                      "group relative flex h-full min-w-0 flex-col justify-center rounded-md px-1.5 py-1 transition-colors duration-[140ms]",
                      row.visible ? "" : "opacity-50",
                      selected ? "bg-panel-2" : "hover:bg-panel-2",
                    )}
                  >
                    {dirty ? <span data-dirty-dot="1" className="absolute start-0 top-2 bottom-2 w-0.5 rounded-full bg-accent" /> : <span data-dirty-dot="0" className="hidden" />}
                    <div className="flex h-12 min-w-0 items-center gap-2">
                      <span className="w-5 shrink-0 text-center text-[11px] tabular-nums text-muted">{row.index}</span>
                      <ColorCell row={row} api={table} />
                      <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
                        <TextCell
                          label={table.t("class.display")}
                          value={title}
                          saved={row.title}
                          weight
                          onChange={(next) => table.setDraft(row.id, "title", next)}
                          onCommit={(next) => { if (next !== row.title) void table.style(row, { title: next }); }}
                        />
                        <div className="flex min-w-0 items-center gap-1">
                          <div className="w-[38%] min-w-0">
                            <TextCell
                              label={table.t("class.name")}
                              value={name}
                              saved={row.id}
                              muted
                              onChange={(next) => table.setDraft(row.id, "id", next)}
                              onCommit={(next) => void table.rename(row, next.trim())}
                            />
                          </div>
                          <span className="text-[11px] text-muted">·</span>
                          <div className="min-w-0 flex-1">
                            <TextCell
                              label={table.t("class.titleEn")}
                              value={titleEn}
                              saved={row.titleEn}
                              muted
                              onChange={(next) => table.setDraft(row.id, "titleEn", next)}
                              onCommit={(next) => { if (next !== row.titleEn) void table.style(row, { titleEn: next }); }}
                            />
                          </div>
                        </div>
                      </div>
                      <span className="w-8 shrink-0 text-end text-[12px] tabular-nums text-muted">{row.count || 0}</span>
                      <HotkeyCell row={row} api={table} />
                      <RowMenu row={row} api={table} />
                    </div>
                    {open ? (
                      <div className="flex h-7 min-w-0 items-center gap-1 ps-7">
                        <IconCell row={row} api={table} />
                        <div className="min-w-0 max-w-[9rem] flex-1">
                          <GroupCell row={row} api={table} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <TextCell
                            label={table.t("class.attrs")}
                            value={attrs}
                            saved={row.attrs || ""}
                            muted
                            onChange={(next) => table.setDraft(row.id, "attrs", next)}
                            onCommit={(next) => { if (next !== (row.attrs || "")) void table.style(row, { attrs: next }); }}
                          />
                        </div>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      {pending ? (
        <div data-testid="class-confirm" className="grid gap-2 border-t border-line bg-panel-2 p-3 text-[13px]">
          <p className="font-medium">{t("class.confirmTitle")}</p>
          <p className="text-muted">{t("class.confirmBody", { files: pending.files, boxes: pending.rewrittenBoxes, dropped: pending.droppedBoxes })}</p>
          <p className="truncate text-[11px] text-muted">{(pending.fileNames || []).join(", ")}</p>
          <div className="flex gap-2">
            <button type="button" data-testid="class-confirm-yes" className="inline-flex h-8 items-center rounded-md bg-accent px-3 text-[12px] font-medium text-accent-ink" onClick={() => void confirm()}>{t("class.confirmTitle")}</button>
            <button type="button" className="inline-flex h-8 items-center rounded-md border border-line px-3 text-[12px] hover:bg-panel" onClick={() => setPending(null)}>{t("common.cancel")}</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TextCell({
  label, value, saved, weight, muted, onChange, onCommit,
}: {
  label: string;
  value: string;
  saved: string;
  weight?: boolean;
  muted?: boolean;
  onChange: (value: string) => void;
  onCommit: (value: string) => void;
}) {
  const skip = useRef(false);
  const dirty = value !== saved;
  return (
    <input
      aria-label={label}
      value={value}
      placeholder={muted ? "" : label}
      className={cn(
        "h-5 w-full min-w-0 rounded-md border bg-transparent px-1 outline-none transition-colors duration-[140ms] placeholder:text-muted",
        weight ? "h-6 font-medium" : "",
        muted ? "text-[11px] text-muted" : "text-[13px]",
        dirty ? "border-accent/70 bg-panel-2" : "border-transparent hover:bg-panel-2 focus:border-line focus:bg-panel-2",
      )}
      onChange={(event) => onChange(event.target.value)}
      onFocus={(event) => event.currentTarget.select()}
      onBlur={() => {
        if (skip.current) {
          skip.current = false;
          return;
        }
        if (value !== saved) onCommit(value);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          skip.current = true;
          onChange(saved);
          event.currentTarget.blur();
          return;
        }
        if (event.key === "Enter" && !event.ctrlKey && !event.metaKey) {
          event.preventDefault();
          event.stopPropagation();
          skip.current = true;
          onCommit(value.trim());
          event.currentTarget.blur();
        }
      }}
    />
  );
}

function glyph(name?: string) {
  return ICONS.find((item) => item.name === name)?.Icon || Tag;
}

function ColorCell({ row, api }: { row: ClassRow; api: TableApi }) {
  return (
    <Popover.Root modal={false}>
      <Popover.Trigger asChild>
        <button
          type="button"
          data-testid="class-color"
          aria-label={api.t("class.color")}
          className="h-5 w-5 shrink-0 rounded-sm border border-line shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]"
          style={{ background: row.color }}
        />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content data-testid="class-color-popover" className="z-[80] w-52 rounded-md border border-line bg-panel p-2 shadow-pop" side="bottom" sideOffset={8} collisionPadding={8}>
          <div className="grid grid-cols-6 gap-1.5">
            {SWATCHES.map((color) => {
              const on = color.toLowerCase() === row.color.toLowerCase();
              return (
                <button
                  key={color}
                  type="button"
                  aria-label={color}
                  className={cn("relative h-7 w-7 rounded-md border border-line", on && "ring-2 ring-accent ring-offset-1 ring-offset-panel")}
                  style={{ background: color }}
                  onClick={() => void api.style(row, { color })}
                >
                  {on ? <Check className="absolute inset-0 m-auto h-3.5 w-3.5 text-white mix-blend-difference" /> : null}
                </button>
              );
            })}
          </div>
          <label className="mt-2 flex items-center justify-between gap-2 text-[11px] text-muted">
            <span>{api.t("class.color")}</span>
            <input aria-label={api.t("class.color")} type="color" value={row.color} className="h-7 w-10 cursor-pointer rounded bg-transparent" onChange={(event) => void api.style(row, { color: event.target.value })} />
          </label>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function IconCell({ row, api }: { row: ClassRow; api: TableApi }) {
  const Current = glyph(row.icon?.name);
  return (
    <Popover.Root modal={false}>
      <Popover.Trigger asChild>
        <button type="button" data-testid="class-icon" aria-label={api.t("class.icon")} className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-panel-2 hover:text-ink">
          <Current className="h-3.5 w-3.5" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content data-testid="class-icon-popover" className="z-[80] grid grid-cols-4 gap-1 rounded-md border border-line bg-panel p-2 shadow-pop" side="bottom" sideOffset={8} collisionPadding={8}>
          {ICONS.map(({ name, Icon }) => (
            <button key={name} type="button" aria-label={name} className={cn("inline-flex h-8 w-8 items-center justify-center rounded-md", (row.icon?.name || "Tag") === name ? "bg-accent text-accent-ink" : "text-muted hover:bg-panel-2 hover:text-ink")} onClick={() => void api.style(row, { icon: { kind: "lucide", name } })}>
              <Icon className="h-4 w-4" />
            </button>
          ))}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function HotkeyCell({ row, api }: { row: ClassRow; api: TableApi }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        setArmed(false);
        return;
      }
      if (event.key === "Backspace" || event.key === "Delete") {
        setArmed(false);
        void api.style(row, { hotkey: "" });
        return;
      }
      if (event.key.length === 1) {
        setArmed(false);
        void api.style(row, { hotkey: event.key.toLowerCase() });
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [armed, api, row]);
  return (
    <button
      type="button"
      aria-label={api.t("class.hotkey")}
      data-hotkey-arm={armed ? "1" : "0"}
      title={api.t("class.hotkey")}
      className={cn(
        "inline-flex h-7 min-w-7 items-center justify-center rounded-[3px] border px-1.5 text-[11px] font-medium uppercase tabular-nums",
        armed ? "border-accent bg-panel-2 text-ink" : "border-line bg-panel-2 text-muted hover:text-ink",
      )}
      onClick={() => setArmed(true)}
    >
      {armed ? <span className="text-[10px] normal-case tracking-normal">{api.t("class.pressKey")}</span> : (row.hotkey || FALLBACK_KEYS[row.index] || <Keyboard className="h-3.5 w-3.5 opacity-60" />)}
    </button>
  );
}

function GroupCell({ row, api }: { row: ClassRow; api: TableApi }) {
  const others = api.classes.filter((item) => item.id !== row.id);
  const current = others.find((item) => item.id === row.parent);
  return (
    <Select.Root value={row.parent || NONE} onValueChange={(value) => void api.style(row, { parent: value === NONE ? "" : value })}>
      <Select.Trigger aria-label={api.t("class.group")} className="inline-flex h-7 w-full min-w-0 items-center rounded-md px-1.5 text-start text-[12px] text-muted outline-none hover:bg-panel-2 hover:text-ink">
        <span className="min-w-0 flex-1 truncate">{current ? displayTitle(current, api.language) : api.t("class.groupNone")}</span>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content className="z-[80] max-h-64 min-w-40 overflow-auto rounded-md border border-line bg-panel p-1 text-[13px] shadow-pop" position="popper">
          <Select.Viewport>
            <Select.Item value={NONE} className="cursor-pointer rounded-md px-2 py-1.5 outline-none data-[highlighted]:bg-panel-2">{api.t("class.groupNone")}</Select.Item>
            {others.map((item) => (
              <Select.Item key={item.id} value={item.id} className="cursor-pointer whitespace-nowrap rounded-md px-2 py-1.5 outline-none data-[highlighted]:bg-panel-2">
                {displayTitle(item, api.language)}
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}

function RowMenu({ row, api }: { row: ClassRow; api: TableApi }) {
  const index = api.classes.findIndex((item) => item.id === row.id);
  const keys = api.classes.map((item) => item.id);
  const others = api.classes.filter((item) => item.id !== row.id);
  const itemClass = "flex h-8 cursor-pointer items-center whitespace-nowrap rounded-md px-2 outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[highlighted]:bg-panel-2";
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button type="button" data-testid="class-row-menu" aria-label={api.t("class.actions")} className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-panel-2 hover:text-ink" onPointerDown={(event) => event.stopPropagation()}>
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content data-testid="class-row-menu-panel" className="z-[80] min-w-44 rounded-md border border-line bg-panel p-1 text-[13px] shadow-pop" side="bottom" sideOffset={8} align="end" collisionPadding={8}>
          <DropdownMenu.Item className={itemClass} onSelect={() => void api.style(row, { visible: !row.visible })}>
            {row.visible ? api.t("class.deprecate") : api.t("class.deprecated")}
          </DropdownMenu.Item>
          <DropdownMenu.Item className={cn(itemClass, "text-danger")} onSelect={() => void api.ask("delete", { key: row.id })}>
            {api.t("class.remove")}
          </DropdownMenu.Item>
          <DropdownMenu.Sub>
            <DropdownMenu.SubTrigger className={itemClass}>{api.t("class.merge")}</DropdownMenu.SubTrigger>
            <DropdownMenu.Portal>
              <DropdownMenu.SubContent className="z-[80] max-h-64 min-w-40 overflow-auto rounded-md border border-line bg-panel p-1 text-[13px] shadow-pop">
                {others.map((item) => (
                  <DropdownMenu.Item key={item.id} className={itemClass} onSelect={() => void api.ask("merge", { source: row.id, target: item.id })}>
                    {displayTitle(item, api.language)}
                  </DropdownMenu.Item>
                ))}
              </DropdownMenu.SubContent>
            </DropdownMenu.Portal>
          </DropdownMenu.Sub>
          <DropdownMenu.Item className={itemClass} disabled={index <= 0} onSelect={() => void api.ask("reorder", { keys: swap(keys, index, index - 1) })}>
            {api.t("class.reorderUp")}
          </DropdownMenu.Item>
          <DropdownMenu.Item className={itemClass} disabled={index < 0 || index >= api.classes.length - 1} onSelect={() => void api.ask("reorder", { keys: swap(keys, index, index + 1) })}>
            {api.t("class.reorderDown")}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function swap(keys: string[], from: number, to: number): string[] {
  const next = [...keys];
  if (to < 0 || to >= next.length || from < 0 || from >= next.length) return next;
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
