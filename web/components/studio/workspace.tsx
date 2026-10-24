"use client";

import * as ContextMenu from "@radix-ui/react-context-menu";
import dynamic from "next/dynamic";
import { Fragment, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  ClipboardPaste,
  Copy,
  Eraser,
  FolderOpen,
  FolderPlus,
  Fullscreen,
  X,
  Package,
  Sparkles,
  Tags,
  Trash2,
} from "lucide-react";
import { Provider, TextButton, TextInput } from "@/components/ui";
import { api } from "@/lib/api";
import { appearance, bootAppearance, patchAppearance, subscribeCoords, useAppearance, usePointer } from "@/lib/appearance";
import { breakpointFor, loadLayout, withoutToolbar, type ShellTemplate } from "@/lib/grid";
import { FILTERS, attachTauriDrop, browse, deliverDrop, pathFromTransfer } from "@/lib/browse";
import { copyAnnotations } from "@/lib/clipboard";
import { acceptGeometry, deleteSelected, drawCommands, pasteIntoImage } from "@/lib/draw";
import { saveAndContinue, shouldConfirmNext } from "@/lib/save-next";
import { classHotkeyAllowed, clearExplicit, markExplicit } from "@/lib/save-next-rules";
import { moveAnnotation } from "@/lib/geom";
import { runLegacyAction } from "@/lib/legacy-actions";
import { comboFromEvent, matchAction, type ShortcutAction } from "@/lib/shortcuts";
import { openTab } from "@/lib/tabs";
import { useDraft, useStudio } from "@/lib/store";
import { useBoundDismiss } from "@/lib/overlay";
import { cn } from "@/lib/utils";
import { Dialogs } from "./dialogs";
import { Dock } from "./dock";
import { ActivityBar } from "./activity";
import { ClassBar } from "./chrome";
import { classTitle, ToolRail } from "./lists";
import { PathField, RecentPaths } from "./path-field";
import { MenuBar } from "./menubar";
import { ImageTabs } from "./tabs";
import { Palette } from "./palette";
import { PanelBody } from "./panels";

const Canvas = dynamic(() => import("./canvas").then((mod) => mod.Canvas), { ssr: false });

type PluginRow = {
  id: string;
  name: string;
  enabled: boolean;
  frontend: string;
  panels: { id?: string; title?: string }[];
};

declare global {
  interface Window {
    TrainerStudio?: {
      registerPlugin: (plugin: { id: string; mount: (el: HTMLElement) => void }) => void;
    };
  }
}

export function Workspace() {
  const { t } = useTranslation();
  const project = useStudio((state) => state.project);

  const imageId = useStudio((state) => state.editor.imageId);
  const images = useStudio((state) => state.images);
  useEffect(() => {
    bootAppearance();
  }, []);
  useEffect(() => {
    const row = images.find((item) => item.id === imageId);
    if (row) openTab(row.id, row.name);
  }, [imageId, images]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem("trainer-studio.ui");
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<ReturnType<typeof useStudio.getState>["ui"]>;
      useStudio.getState().patchUi(parsed);
    } catch {
      /* keep defaults */
    }
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const monacoEdit = Boolean(target?.closest?.("[data-monaco-edit='1']"));
      if (shouldConfirmNext({ combo: comboFromEvent(event), monacoEdit })) {
        event.preventDefault();
        saveAndContinue();
        return;
      }
      if (event.key === "Escape") {
        drawCommands.cancel();
        useDraft.getState().closePopup();
        useStudio.getState().patchUi({ palette: false, dialog: "" });
        return;
      }
      if (!classHotkeyAllowed(target?.tagName || "", Boolean(target?.isContentEditable))) return;
      if (event.code === "Space" && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        drawCommands.space(true);
        return;
      }
      const tool = useStudio.getState().ui.tool;
      if (!event.metaKey && !event.ctrlKey && !event.altKey && (event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "ArrowUp" || event.key === "ArrowDown")) {
        const studio = useStudio.getState();
        const ids = new Set(studio.editor.selected);
        if (ids.size) {
          event.preventDefault();
          const step = Math.max(1, appearance().nudge || 1);
          const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
          const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
          studio.commit(studio.editor.annotations.map((row) => (ids.has(row.id) ? moveAnnotation(row, dx, dy) : row)), "move");
          return;
        }
      }
      if (event.key === "Backspace" && !event.metaKey && !event.ctrlKey && !event.altKey && ["sam", "polygon", "pose"].includes(tool)) {
        event.preventDefault();
        drawCommands.backspace();
        return;
      }
      if (!event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey && event.key.length === 1) {
        const armed = useStudio.getState();
        const hot = armed.classes.find((item) => (item.hotkey || "").toLowerCase() === event.key.toLowerCase());
        if (hot) {
          event.preventDefault();
          if (armed.editor.selected.length) {
            const selected = new Set(armed.editor.selected);
            const popup = useDraft.getState().popup;
            if (popup?.open && popup.shapeId && selected.has(popup.shapeId)) markExplicit(popup.shapeId, hot.id);
            armed.commit(armed.editor.annotations.map((item) => (selected.has(item.id) ? { ...item, classId: hot.id, updatedAt: new Date().toISOString() } : item)), "class");
          } else armed.setActiveClass(hot.id);
          return;
        }
      }
      const action = matchAction(event);
      if (!action) return;
      if (runShortcut(action)) event.preventDefault();
    };
    const onUp = (event: KeyboardEvent) => {
      if (event.code === "Space") drawCommands.space(false);
    };
    const hidden = () => {
      if (document.hidden) void useStudio.getState().flush();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onUp);
    document.addEventListener("visibilitychange", hidden);
    const onCross = (event: Event) => {
      const which = String((event as CustomEvent).detail || "guides");
      const look = appearance();
      if (which === "cursor") patchAppearance({ crosshairCursor: !look.crosshairCursor });
      else patchAppearance({ guideLines: !look.guideLines });
    };
    const onTheme = (event: Event) => {
      const theme = (event as CustomEvent).detail === "light" ? "light" : "dark";
      patchAppearance({ theme });
      useStudio.getState().patchUi({ theme });
    };
    const onDensity = (event: Event) => {
      patchAppearance({ density: (event as CustomEvent).detail === "compact" ? "compact" : "comfortable" });
    };
    const onGrid = () => patchAppearance({ showGrid: !appearance().showGrid });
    window.addEventListener("studio-cross", onCross);
    window.addEventListener("studio-theme", onTheme);
    window.addEventListener("studio-density", onDensity);
    window.addEventListener("studio-grid", onGrid);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onUp);
      document.removeEventListener("visibilitychange", hidden);
      window.removeEventListener("studio-cross", onCross);
      window.removeEventListener("studio-theme", onTheme);
      window.removeEventListener("studio-density", onDensity);
      window.removeEventListener("studio-grid", onGrid);
    };
  }, []);

  useEffect(() => {
    void useStudio.getState().resumeLatest().catch((error: Error) => useStudio.getState().setNotice(error.message, "error"));
    const layout = appearance().startupLayout;
    if (layout !== "default") window.dispatchEvent(new CustomEvent("studio-layout", { detail: layout }));
  }, []);

  const [dragging, setDragging] = useState(0);
  useEffect(() => {
    const take = (path: string) => {
      if (!path) {
        useStudio.getState().setNotice(t("browse.noPath"));
        return;
      }
      if (deliverDrop(path)) return;
      const studio = useStudio.getState();
      if (!studio.project) {
        void studio.openPath(path).catch((error: Error) => studio.setNotice(error.message, "error"));
        return;
      }
      studio.setNotice(t("browse.dropped"));
    };
    let depth = 0;
    const over = (event: DragEvent) => {
      if (!event.dataTransfer?.types.includes("Files")) return;
      event.preventDefault();
    };
    const enter = (event: DragEvent) => {
      if (!event.dataTransfer?.types.includes("Files")) return;
      event.preventDefault();
      depth += 1;
      setDragging(depth);
    };
    const leave = () => {
      depth = Math.max(0, depth - 1);
      setDragging(depth);
    };
    const drop = (event: DragEvent) => {
      depth = 0;
      setDragging(0);
      if (!event.dataTransfer) return;
      event.preventDefault();
      take(pathFromTransfer(event.dataTransfer));
    };
    const failed = (event: Event) => {
      const code = String((event as CustomEvent).detail || "");
      useStudio.getState().setNotice(code === "dialog.unavailable" ? t("browse.unavailable") : t("browse.noPath"));
    };
    window.addEventListener("dragover", over);
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    window.addEventListener("studio-browse-error", failed);
    let unlisten: () => void = () => undefined;
    void attachTauriDrop(take).then((stop) => {
      unlisten = stop;
    });
    return () => {
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
      window.removeEventListener("studio-browse-error", failed);
      unlisten();
    };
  }, [t]);

  const lock = project?.labelLock;
  const lockMessage = lock && !lock.ok
    ? (lock.code ? t(`api.${lock.code}`, { ...(lock.params || {}), defaultValue: lock.message || t("lock.banner") }) : lock.message || t("lock.banner"))
    : "";

  return (
    <Provider>
      <AppShell
        lockMessage={lockMessage}
        dragging={dragging}
        dropLabel={t("browse.drop")}
        projectOpen={Boolean(project)}
        welcome={<Welcome />}
      />
      <Dialogs />
      <Palette />
      <ClassPopup />
    </Provider>
  );
}

function AppShell({
  lockMessage,
  dragging,
  dropLabel,
  projectOpen,
  welcome,
}: {
  lockMessage: string;
  dragging: number;
  dropLabel: string;
  projectOpen: boolean;
  welcome: ReactNode;
}) {
  const look = useAppearance();
  const [layout, setLayout] = useState(loadLayout);
  const [width, setWidth] = useState(1920);
  useEffect(() => {
    const sync = () => setLayout(loadLayout());
    const size = () => setWidth(window.innerWidth);
    sync();
    size();
    window.addEventListener("studio-layout-changed", sync);
    window.addEventListener("resize", size);
    return () => {
      window.removeEventListener("studio-layout-changed", sync);
      window.removeEventListener("resize", size);
    };
  }, []);
  const name = breakpointFor(width);
  const template = withoutToolbar(layout.templates[name]);
  return (
    <div data-testid="app-shell" data-breakpoint={name} className="relative h-screen max-h-screen w-full min-h-0 min-w-0 max-w-full overflow-hidden bg-bg text-ink" style={shellStyle(template)}>
      {dragging > 0 ? (
        <div data-testid="drop-overlay" className="pointer-events-none fixed inset-0 z-[80] flex items-center justify-center bg-bg/70 text-sm">
          {dropLabel}
        </div>
      ) : null}
      <header style={{ gridArea: "menu" }} className="min-w-0 overflow-hidden border-b border-line bg-panel">
        <MenuBar />
        {look.chrome === "ribbon" ? <Ribbon /> : null}
        {lockMessage ? <p className="truncate px-3 text-xs text-warn" title={lockMessage}>{lockMessage}</p> : null}
      </header>
      <aside style={{ gridArea: "palette" }} className="min-h-0 min-w-0 overflow-hidden border-e border-line bg-panel">
        <ActivityBar />
      </aside>
      <main style={{ gridArea: "workspace" }} className="min-h-0 min-w-0 overflow-hidden">
        {projectOpen ? (
          <Dock
            center={(
              <div className="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
                <ImageTabs />
                <div className="flex min-h-0 min-w-0 flex-1">
                  <ToolRail />
                  <div className="min-h-0 min-w-0 flex-1"><StageMenu><Canvas /></StageMenu></div>
                </div>
                <ClassBar trailing={<SamBar />} />
              </div>
            )}
            render={(id) => <PanelBody id={id} />}
          />
        ) : welcome}
      </main>
      <footer style={{ gridArea: "status" }} className="flex min-h-0 min-w-0 max-w-full flex-col overflow-hidden border-t border-line bg-panel">
        <PluginSlot />
        <StatusBar />
      </footer>
      {look.showGrid ? <ShellGuide template={template} /> : null}
    </div>
  );
}

function shellStyle(template: ShellTemplate): CSSProperties {
  return {
    display: "grid",
    gridTemplateColumns: template.columns.join(" "),
    gridTemplateRows: template.rows.join(" "),
    gridTemplateAreas: template.areas.map((row) => `"${row}"`).join(" "),
  };
}

function ShellGuide({ template }: { template: ShellTemplate }) {
  const names = [...new Set(template.areas.flatMap((row) => row.split(" ")))];
  return (
    <div data-testid="layout-grid-guide" className="pointer-events-none absolute inset-0 z-30 grid" style={shellStyle(template)}>
      {names.map((area) => (
        <div key={area} data-grid-area={area} style={{ gridArea: area }} className="border border-dashed border-accent/40">
          <span className="m-1 inline-block rounded bg-panel/80 px-1 text-[10px] uppercase tracking-wide text-accent">{area}</span>
        </div>
      ))}
    </div>
  );
}

function Ribbon() {
  const { t } = useTranslation();
  return (
    <div data-testid="ribbon" className="flex h-8 min-w-0 items-center gap-1 overflow-x-auto border-t border-line px-2 text-xs">
      <button type="button" className="h-6 rounded px-2 hover:bg-panel-2" onClick={() => drawCommands.fit()}>{t("ribbon.fit")}</button>
      <button type="button" className="h-6 rounded px-2 hover:bg-panel-2" onClick={() => useStudio.getState().setTool("bbox")}>{t("ribbon.box")}</button>
      <button type="button" className="h-6 rounded px-2 hover:bg-panel-2" onClick={() => useStudio.getState().undo()}>{t("ribbon.undo")}</button>
      <button type="button" className="h-6 rounded px-2 hover:bg-panel-2" onClick={() => void useStudio.getState().step(1)}>{t("ribbon.next")}</button>
    </div>
  );
}

function runShortcut(action: ShortcutAction): boolean {
  const legacy = runLegacyAction(action);
  if (legacy !== null) return legacy;
  const studio = useStudio.getState();
  if (action === "undo") studio.undo();
  else if (action === "redo") studio.redo();
  else if (action === "palette") studio.patchUi({ palette: true });
  else if (action === "copy") copyAnnotations(studio.editor.annotations.filter((row) => studio.editor.selected.includes(row.id)));
  else if (action === "paste") pasteIntoImage();
  else if (action === "delete") deleteSelected();
  else if (action === "selectAll") studio.select(studio.editor.annotations.map((row) => row.id));
  else if (action === "duplicate") {
    const rows = studio.editor.annotations.filter((row) => studio.editor.selected.includes(row.id));
    if (!rows.length) return false;
    copyAnnotations(rows);
    pasteIntoImage();
  } else if (action === "bracketPrev") void studio.step(-1);
  else if (action === "bracketNext") void studio.step(1);
  else if (action === "fit") drawCommands.fit();
  else if (action === "confirm") drawCommands.commit();
  else if (action === "confirmNext") saveAndContinue();
  else if (action === "sidebar") window.dispatchEvent(new CustomEvent("studio-activity", { detail: "toggle" }));
  else if (action === "guides") window.dispatchEvent(new CustomEvent("studio-cross", { detail: "guides" }));
  else if (action === "crossCursor") window.dispatchEvent(new CustomEvent("studio-cross", { detail: "cursor" }));
  else if (action === "next" || action === "prev") {
    if (studio.ui.tool !== "select" && studio.ui.tool !== "pan") return false;
    void studio.step(action === "next" ? 1 : -1);
  } else if (action.startsWith("tool.")) studio.setTool(action.slice(5) as typeof studio.ui.tool);
  else if (action === "export" || action === "qc" || action === "settings" || action === "shortcuts" || action === "history") {
    studio.patchUi({ dialog: action === "export" ? "export" : action === "qc" ? "qc" : action === "settings" ? "settings" : action === "shortcuts" ? "shortcuts" : "history" });
  } else if (action.startsWith("class.")) {
    if (!appearance().classHotkeys) return false;
    const row = studio.classes[Number(action.slice(6)) - 1];
    if (!row) return true;
    if (studio.editor.selected.length) {
      const selected = new Set(studio.editor.selected);
      const popup = useDraft.getState().popup;
      if (popup?.open && popup.shapeId && selected.has(popup.shapeId)) markExplicit(popup.shapeId, row.id);
      studio.commit(
        studio.editor.annotations.map((item) => (selected.has(item.id) ? { ...item, classId: row.id, updatedAt: new Date().toISOString() } : item)),
        "class",
      );
    } else studio.setActiveClass(row.id);
  } else if (action.startsWith("vehicle.")) toggleVehicle(action.slice(8));
  return true;
}

function toggleVehicle(digit: string) {
  const studio = useStudio.getState();
  const annotation = studio.editor.annotations.find((row) => row.id === studio.editor.selected[0]);
  if (!annotation || !annotation.classId.startsWith("speed_")) return;
  const field = studio.fields.find((item) => item.id === "vehicle" && item.type === "multi");
  const option = field?.options?.find((item) => item.shortcut === digit);
  if (!field || !option) return;
  const current = Array.isArray(annotation.attributes.vehicle) ? (annotation.attributes.vehicle as string[]) : [];
  const next = current.includes(option.id) ? current.filter((item) => item !== option.id) : [...current, option.id];
  studio.patchAnnotation(annotation.id, { attributes: { ...annotation.attributes, vehicle: next } });
}

function StageMenu({ children }: { children: React.ReactNode }) {
  const { t, i18n } = useTranslation();
  const classes = useStudio((state) => state.classes);
  const pick = (id: string) => {
    const studio = useStudio.getState();
    if (studio.editor.selected.length) {
      const selected = new Set(studio.editor.selected);
      studio.commit(studio.editor.annotations.map((row) => (selected.has(row.id) ? { ...row, classId: id, updatedAt: new Date().toISOString() } : row)), "class");
    }
    studio.setActiveClass(id);
  };
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <div className="h-full min-h-0">{children}</div>
      </ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className="z-[70] min-w-48 rounded-md border border-line bg-panel p-1 text-ink shadow-pop">
          <ContextMenu.Sub>
            <ContextMenu.SubTrigger className="flex h-8 items-center gap-2 whitespace-nowrap rounded px-2 outline-none data-[highlighted]:bg-panel-2 data-[state=open]:bg-panel-2">
              <Tags className="h-4 w-4 shrink-0" />
              <span className="truncate">{t("context.classes")}</span>
            </ContextMenu.SubTrigger>
            <ContextMenu.Portal>
              <ContextMenu.SubContent className="z-[70] max-h-80 min-w-56 overflow-auto rounded-md border border-line bg-panel p-1 shadow-pop">
                {classes.map((row) => (
                  <ContextMenu.Item
                    key={row.id}
                    onSelect={() => pick(row.id)}
                    className="flex h-8 items-center gap-2 whitespace-nowrap rounded px-2 outline-none data-[highlighted]:bg-panel-2"
                  >
                    <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: row.color }} />
                    <span className="truncate">{classTitle(row, i18n.language)}</span>
                  </ContextMenu.Item>
                ))}
              </ContextMenu.SubContent>
            </ContextMenu.Portal>
          </ContextMenu.Sub>
          <MenuRow icon={Copy} label={t("actions.copy")} onSelect={() => {
            const studio = useStudio.getState();
            copyAnnotations(studio.editor.annotations.filter((row) => studio.editor.selected.includes(row.id)));
          }} />
          <MenuRow icon={ClipboardPaste} label={t("actions.paste")} onSelect={pasteIntoImage} />
          <MenuRow icon={Trash2} label={t("actions.delete")} onSelect={deleteSelected} />
          <MenuRow icon={Fullscreen} label={t("actions.fit")} onSelect={() => drawCommands.fit()} />
          <MenuRow icon={Sparkles} label={t("actions.clearPoints")} onSelect={() => drawCommands.cancel()} />
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

function MenuRow({ icon: Icon, label, onSelect }: { icon: typeof Copy; label: string; onSelect: () => void }) {
  return (
    <ContextMenu.Item title={label} onSelect={onSelect} className="flex h-8 items-center gap-2 whitespace-nowrap rounded px-2 outline-none data-[highlighted]:bg-panel-2">
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{label}</span>
    </ContextMenu.Item>
  );
}

function SamBar() {
  const { t } = useTranslation();
  const tool = useStudio((state) => state.ui.tool);
  const samModel = useStudio((state) => state.ui.samModel);
  const samDevice = useStudio((state) => state.ui.samDevice);
  const patchUi = useStudio((state) => state.patchUi);
  const [status, setStatus] = useState<{ ultralytics?: boolean; cuda?: boolean; hint?: string; hintCode?: string; models?: { id: string; label: string }[] }>({});
  useEffect(() => {
    if (tool !== "sam") return;
    void api<typeof status>("/api/ai/status").then(setStatus).catch(() => setStatus({}));
  }, [tool]);
  if (tool !== "sam") return null;
  return (
    <div className="flex max-w-[min(28rem,50%)] shrink-0 flex-wrap items-center justify-end gap-1 text-xs">
      <label className="flex h-8 items-center gap-1 whitespace-nowrap">
        <Sparkles className="h-4 w-4 shrink-0" />
        <span className="sr-only">{t("sam.model")}</span>
        <select
          aria-label={t("sam.model")}
          title={t("sam.model")}
          className="h-8 max-w-40 rounded-md border border-line bg-panel-2 px-1"
          value={samModel}
          onChange={(event) => patchUi({ samModel: event.target.value })}
        >
          {(status.models || [{ id: samModel, label: samModel }]).map((row) => (
            <option key={row.id} value={row.id}>{row.label}</option>
          ))}
        </select>
      </label>
      <select
        aria-label={t("sam.device")}
        title={t("sam.device")}
        className="h-8 rounded-md border border-line bg-panel-2 px-1"
        value={samDevice}
        onChange={(event) => patchUi({ samDevice: event.target.value === "cuda" ? "cuda" : "cpu" })}
      >
        <option value="cpu">{t("sam.cpu")}</option>
        <option value="cuda" disabled={!status.cuda}>{t("sam.cuda")}</option>
      </select>
      <TextButton label={t("sam.clear")} icon={Eraser} onClick={() => drawCommands.cancel()} />
      {status.ultralytics === false ? (
        <>
          <span className="max-w-xs truncate text-warn" title={status.hintCode ? t(`api.${status.hintCode}`, { defaultValue: status.hint || t("sam.missing") }) : status.hint || t("sam.missing")}>
            {status.hintCode ? t(`api.${status.hintCode}`, { defaultValue: status.hint || t("sam.missing") }) : status.hint || t("sam.missing")}
          </span>
          <TextButton
            label={t("sam.install")}
            icon={Package}
            tone="accent"
            onClick={() => {
              void api("/api/ai/install", { method: "POST" })
                .then(() => patchUi({ dialog: "jobs" }))
                .catch((error: Error) => useStudio.getState().setNotice(error.message, "error"));
            }}
          />
        </>
      ) : null}
    </div>
  );
}

function formatBuildStamp(id: string): string {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(id);
  if (!match) return id;
  const [, year, month, day, hour, minute, second] = match;
  return `${year}-${month}-${day} ${hour}:${minute}:${second} UTC`;
}

function StatusSeparator() {
  return <span aria-hidden className="mx-1.5 h-3.5 w-px shrink-0 bg-muted opacity-60" />;
}

function StatusBar() {
  const { t } = useTranslation();
  const saving = useStudio((state) => state.saving);
  const dirty = useStudio((state) => state.editor.dirty);
  const holdSave = useStudio((state) => state.editor.holdSave);
  const notice = useStudio((state) => state.notice);
  const images = useStudio((state) => state.images);
  const filter = useStudio((state) => state.ui.filter);
  const query = useStudio((state) => state.ui.query);
  const imageId = useStudio((state) => state.editor.imageId);
  const selectedId = useStudio((state) => state.editor.selected[0]);
  const annotation = useStudio((state) => state.editor.annotations.find((row) => row.id === selectedId));
  const classRow = useStudio((state) => state.classes.find((row) => row.id === (annotation?.classId || state.ui.activeClass)));
  const pointer = usePointer();
  const look = useAppearance();
  const coordRef = useRef<HTMLSpanElement>(null);
  const [meta, setMeta] = useState({ build: "dev", cuda: false, ready: false });
  useEffect(() => {
    void api<{ build?: string }>("/api/health").then((body) => setMeta((prev) => ({ ...prev, build: body.build || "dev" }))).catch(() => undefined);
    void api<{ cuda?: boolean; ultralytics?: boolean }>("/api/ai/status").then((body) => {
      setMeta((prev) => ({ ...prev, cuda: Boolean(body.cuda), ready: Boolean(body.ultralytics) }));
      if (!body.cuda && appearance().trainDevice === "cuda") patchAppearance({ trainDevice: "cpu" });
    }).catch(() => undefined);
  }, []);
  const visible = images.filter((row) => (filter === "all" || row.status === filter) && (!query || row.name.toLowerCase().includes(query.toLowerCase())));
  const index = visible.findIndex((row) => row.id === imageId);
  const text = notice || (saving || (dirty && !holdSave) ? t("status.saving") : t("status.saved"));
  useEffect(() => {
    const stop = subscribeCoords((text) => {
      if (coordRef.current) coordRef.current.textContent = text || t("status.none");
    });
    return () => {
      stop();
    };
  }, [t]);
  const items: { key: string; node: ReactNode }[] = [
    { key: "index", node: <span className="shrink-0">{index >= 0 ? `${index + 1} / ${visible.length}` : `0 / ${visible.length}`}</span> },
    { key: "filter", node: <span className="shrink-0 truncate">{t(`filters.${filter}`)}</span> },
    { key: "zoom", node: <span className="shrink-0">{pointer.zoom}%</span> },
  ];
  if (look.showCursor) {
    items.push({
      key: "cursor",
      node: <span ref={coordRef} data-testid="coord-readout" className="shrink-0" title={t("status.cursor")}>{t("status.none")}</span>,
    });
  }
  items.push({
    key: "geometry",
    node: <span className="min-w-0 truncate">{annotation ? annotation.geometry.type : t("status.none")}</span>,
  });
  if (look.showClass) {
    items.push({
      key: "class",
      node: <span className="min-w-0 truncate">{classRow ? classRow.title : t("status.none")}</span>,
    });
  }
  items.push(
    {
      key: "notice",
      node: <span className={cn("min-w-0 flex-1 truncate", notice && "text-danger")} title={text}>{text}</span>,
    },
    {
      key: "ai",
      node: <span className="shrink-0">{meta.ready ? t("status.ready") : t("status.offline")}</span>,
    },
    {
      key: "device",
      node: <span className="shrink-0">{meta.cuda ? t("status.gpu") : t("status.cpu")}</span>,
    },
    {
      key: "build",
      node: <span className="shrink-0 truncate" title={meta.build}>{formatBuildStamp(meta.build)}</span>,
    },
  );
  return (
    <footer data-testid="status-bar" className="flex h-7 min-w-0 shrink-0 items-center overflow-hidden border-t border-line bg-panel px-2 text-xs text-muted">
      {items.map((item, itemIndex) => (
        <Fragment key={item.key}>
          {itemIndex > 0 ? <StatusSeparator /> : null}
          {item.node}
        </Fragment>
      ))}
    </footer>
  );
}

function Welcome() {
  const { t } = useTranslation();
  const openPath = useStudio((state) => state.openPath);
  const loadProjects = useStudio((state) => state.loadProjects);
  const patchUi = useStudio((state) => state.patchUi);
  const notice = useStudio((state) => state.notice);
  const progress = useStudio((state) => state.importProgress);
  const [path, setPath] = useState("");
  const [yaml, setYaml] = useState("");
  const [recent, setRecent] = useState<{ id: string; name: string; root: string }[]>([]);
  useEffect(() => {
    void loadProjects().then(setRecent).catch(() => setRecent([]));
  }, [loadProjects]);
  const open = (value: string) => {
    if (!value.trim()) return;
    void openPath(value).catch((error: Error) => useStudio.getState().setNotice(error.message, "error"));
  };
  async function openDataset() {
    const value = yaml.trim() || path.trim();
    if (value) {
      open(value);
      return;
    }
    try {
      const picked = await browse("folder", FILTERS.yaml, t("welcome.path"), appearance().dataDir);
      if (picked) open(picked);
    } catch (error) {
      useStudio.getState().setNotice(error instanceof Error ? error.message : String(error), "error");
    }
  }
  return (
    <div data-testid="welcome" className="h-full min-h-0 overflow-auto">
      <div className="mx-auto grid min-h-full max-w-[1100px] items-start gap-10 px-6 py-10 sm:px-10 lg:grid-cols-[minmax(18rem,22rem)_minmax(0,1fr)] lg:gap-16 lg:py-12">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="" className="h-10 w-10" />
            <div className="min-w-0">
              <h1 className="truncate text-[20px] font-semibold leading-6">{t("app.name")}</h1>
              <p className="mt-1 text-[13px] leading-5 text-muted">{t("welcome.tagline")}</p>
            </div>
          </div>
          <div className="mt-8 flex flex-col gap-1 [&_button]:h-9 [&_button]:w-full [&_button]:justify-start">
            <TextButton testId="welcome-open" label={t("welcome.open")} icon={FolderOpen} tone="accent" onClick={() => void openDataset()} />
            <TextButton label={t("welcome.create")} icon={FolderPlus} onClick={() => patchUi({ dialog: "create" })} />
            <TextButton label={t("welcome.wizard")} icon={Sparkles} onClick={() => patchUi({ dialog: "wizard" })} />
          </div>
          <div className="mt-6 flex flex-col gap-3">
            <PathField testId="path-dataset" label={t("welcome.path")} value={path} filters={FILTERS.yaml} onChange={setPath} />
            <PathField testId="path-yaml" label={t("path.yaml")} value={yaml} filters={FILTERS.yaml} onChange={setYaml} />
          </div>
          {progress.active ? (
            <div className="mt-4">
              <p className="truncate text-[13px]" title={progress.path}>
                {progress.total > 0 ? t("open.progress", { done: progress.done, total: progress.total }) : t("common.loading")}
              </p>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-line">
                <div
                  className="h-full bg-accent"
                  style={{ width: progress.total > 0 ? `${Math.min(100, Math.round((100 * progress.done) / progress.total))}%` : "12%" }}
                />
              </div>
            </div>
          ) : null}
          {notice ? <p className="mt-3 truncate text-[13px] text-danger" title={notice}>{notice}</p> : null}
          <ol className="mt-8 flex items-center gap-2 text-[11px] font-medium">
            <li className="text-ink">{t("welcome.stepOpen")}</li>
            <li aria-hidden className="h-px w-6 shrink-0 bg-line" />
            <li className="text-muted">{t("welcome.stepLabel")}</li>
            <li aria-hidden className="h-px w-6 shrink-0 bg-line" />
            <li className="text-muted">{t("welcome.stepExport")}</li>
          </ol>
          <div className="mt-6 flex flex-wrap gap-x-4 gap-y-2 text-[13px]">
            <button type="button" className="text-muted hover:text-ink" onClick={() => patchUi({ dialog: "shortcuts" })}>
              {t("help.shortcuts")}
            </button>
            <button type="button" className="text-muted hover:text-ink" onClick={() => patchUi({ dialog: "settings" })}>
              {t("help.about")}
            </button>
          </div>
        </div>
        <div className="min-w-0">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-muted">{t("welcome.recent")}</h2>
          <div className="mt-3 grid grid-cols-1 gap-1 sm:grid-cols-2">
            <RecentPaths onPick={open} hideEmpty={recent.length > 0} exclude={new Set(recent.map((item) => item.root))} />
            {recent.map((item) => (
              <button
                key={item.id}
                type="button"
                title={item.root}
                onClick={() => open(item.root)}
                className="flex min-h-12 w-full items-center gap-3 rounded-md px-2 py-2 text-start hover:bg-panel-2"
              >
                <FolderOpen className="h-4 w-4 shrink-0 text-accent" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{item.name}</span>
                  <span className="mt-0.5 block truncate text-[11px] text-muted">{item.root}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ClassPopup() {
  const { t, i18n } = useTranslation();
  const popup = useDraft((state) => state.popup);
  const classes = useStudio((state) => state.classes);
  const box = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState(0);
  useEffect(() => {
    clearExplicit();
  }, [popup?.open, popup?.shapeId]);
  useEffect(() => {
    setPicked(0);
  }, [query, popup?.open]);
  useBoundDismiss(Boolean(popup?.open), () => useDraft.getState().closePopup(), () => [box.current]);
  useEffect(() => {
    if (!popup?.open) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        const count = box.current?.querySelectorAll("button[data-class]").length || 0;
        setPicked((index) => {
          if (!count) return 0;
          return event.key === "ArrowDown" ? Math.min(count - 1, index + 1) : Math.max(0, index - 1);
        });
        return;
      }
      if (event.key !== "Enter" || event.ctrlKey || event.metaKey || event.altKey) return;
      const chosen = box.current?.querySelector<HTMLButtonElement>("button[data-class][aria-selected='true']");
      const classId = chosen?.dataset.class || "";
      if (!classId) return;
      event.preventDefault();
      event.stopPropagation();
      chooseClass(classId);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [popup?.open]);
  if (!popup?.open) return null;
  const width = 280;
  const height = 340;
  let left = popup.x + 12;
  let top = popup.y;
  if (typeof window !== "undefined") {
    if (left + width > window.innerWidth - 8) left = Math.max(8, popup.x - width - 12);
    if (top + height > window.innerHeight - 8) top = Math.max(8, window.innerHeight - height - 8);
  }
  const rows = classes.filter((row) => `${row.id} ${row.title} ${row.titleEn}`.toLowerCase().includes(query.trim().toLowerCase()));
  function chooseClass(classId: string) {
    const studio = useStudio.getState();
    const current = useDraft.getState().popup;
    if (current?.shapeId) {
      markExplicit(current.shapeId, classId);
      studio.patchAnnotation(current.shapeId, { classId });
      studio.setActiveClass(classId);
      useDraft.getState().closePopup();
      return;
    }
    const hold = useDraft.getState().hold;
    if (hold) acceptGeometry(hold.geometry, classId);
  }
  return createPortal(
    <div ref={box} data-testid="class-popup" data-overlay="class-popup" data-shape={popup.shapeId || ""} className="fixed z-[75] flex flex-col overflow-hidden rounded-lg border border-line bg-panel text-ink shadow-pop" style={{ left, top, width, height }} onPointerDown={(event) => event.stopPropagation()} onWheel={(event) => { if (event.target instanceof HTMLSelectElement) event.preventDefault(); }}>
      <div className="flex items-center border-b border-line">
        <TextInput data-testid="class-popup-search" autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("common.search")} aria-label={t("common.search")} className="min-w-0 flex-1 rounded-none border-0" />
        <button type="button" data-testid="class-popup-close" aria-label={t("dock.close")} className="inline-flex h-8 w-8 shrink-0 items-center justify-center text-muted hover:bg-panel-2" onClick={() => useDraft.getState().closePopup()}><X className="h-3.5 w-3.5" /></button>
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-auto p-1">
        {rows.map((row, index) => (
          <button
            key={row.id}
            type="button"
            data-class={row.id}
            aria-selected={index === picked}
            title={classTitle(row, i18n.language)}
            onClick={() => chooseClass(row.id)}
            className={cn("flex h-8 w-full items-center gap-2 whitespace-nowrap rounded px-2 text-start hover:bg-panel-2", index === picked && "bg-accent text-white")}
          >
            <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: row.color }} />
            <span className="min-w-0 flex-1 truncate">{classTitle(row, i18n.language)}</span>
          </button>
        ))}
      </div>
    </div>,
    document.body,
  );
}

const pluginQueue: { id: string; mount: (el: HTMLElement) => void }[] = [];

function PluginSlot() {
  const [plugins, setPlugins] = useState<PluginRow[]>([]);
  useEffect(() => {
    window.TrainerStudio = {
      registerPlugin(plugin) {
        const host = document.getElementById(`plugin-mount-${plugin.id}`);
        if (host) plugin.mount(host);
        else pluginQueue.push(plugin);
      },
    };
    void api<{ plugins: PluginRow[] }>("/api/plugins")
      .then((body) => setPlugins(body.plugins))
      .catch(() => setPlugins([]));
  }, []);
  useEffect(() => {
    for (const plugin of plugins) {
      if (!plugin.enabled || !plugin.frontend) continue;
      const scriptId = `plugin-script-${plugin.id}`;
      if (document.getElementById(scriptId)) continue;
      const script = document.createElement("script");
      script.id = scriptId;
      script.src = plugin.frontend;
      document.body.appendChild(script);
    }
    for (const plugin of pluginQueue.splice(0)) {
      const host = document.getElementById(`plugin-mount-${plugin.id}`);
      if (host) plugin.mount(host);
    }
  }, [plugins]);
  const visible = plugins.filter((plugin) => plugin.enabled && plugin.panels.length);
  if (!visible.length) return null;
  return (
    <div className="max-h-40 overflow-auto border-t border-line">
      {visible.map((plugin) => (
        <div key={plugin.id} id={`plugin-mount-${plugin.id}`} className="p-2" />
      ))}
    </div>
  );
}
