"use client";

import { useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type Ref } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import * as Dropdown from "@radix-ui/react-dropdown-menu";
import { ChevronLeft, ChevronRight, Maximize2, Minus, Plus, Settings2, Sun, X } from "lucide-react";
import { anchorAbove } from "@/lib/anchor";
import { DEFAULT_APPEARANCE, appearance, patchAppearance, useAppearance, usePointer, type Appearance } from "@/lib/appearance";
import { useBoundDismiss } from "@/lib/overlay";
import { drawCommands } from "@/lib/draw";
import { saveAndContinue } from "@/lib/save-next";
import { useStudio } from "@/lib/store";
import { cn } from "@/lib/utils";
import { MenuItem, Tip } from "@/components/ui";
import { classTitle } from "./lists";
import { parseOpenZoom } from "@/lib/zoom-frame";
import { openZoomChoices, SettingColor, SettingToggle, SettingsGroup, SettingsSegmented, SettingsSlider } from "./setting-controls";

const HOTKEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "q", "w", "e", "r", "t", "y", "u", "i", "o", "p"];
const CLASS_PILL = 28;
const CLASS_GAP = 4;
const CLASS_PAD = 4;
const CLASS_ROWS_MAX = 8;
const CLASS_STRIDE = CLASS_PILL + CLASS_GAP;

function classBarHeight(rows: number) {
  const count = Math.min(CLASS_ROWS_MAX, Math.max(1, rows));
  return CLASS_PAD * 2 + count * CLASS_PILL + (count - 1) * CLASS_GAP;
}

export function ClassBar({ trailing }: { trailing?: ReactNode }) {
  const { t, i18n } = useTranslation();
  const classes = useStudio((state) => state.classes);
  const active = useStudio((state) => state.ui.activeClass);
  const setActiveClass = useStudio((state) => state.setActiveClass);
  const look = useAppearance();
  const rows = look.classBarRows;

  function resizeFrom(event: ReactPointerEvent<HTMLElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    const origin = { y: event.clientY, rows: appearance().classBarRows };
    document.documentElement.dataset.classBarDrag = "1";
    const move = (next: PointerEvent) => {
      const count = Math.min(CLASS_ROWS_MAX, Math.max(1, origin.rows + Math.round((origin.y - next.clientY) / CLASS_STRIDE)));
      if (count !== appearance().classBarRows) patchAppearance({ classBarRows: count });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      delete document.documentElement.dataset.classBarDrag;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }

  return (
    <div
      data-testid="class-bar"
      data-rows={rows}
      className="relative min-w-0 shrink-0 border-t border-line bg-panel"
      style={{ height: classBarHeight(rows) }}
    >
      <div
        data-testid="class-bar-resize"
        role="separator"
        aria-orientation="horizontal"
        aria-valuemin={1}
        aria-valuemax={CLASS_ROWS_MAX}
        aria-valuenow={rows}
        aria-label={t("classbar.rows", { defaultValue: "Class bar height" })}
        className="absolute inset-x-0 -top-1 z-10 h-2 cursor-ns-resize before:pointer-events-none before:absolute before:inset-x-8 before:top-[3px] before:h-px before:rounded-full before:bg-accent before:opacity-0 hover:before:opacity-80"
        onPointerDown={resizeFrom}
        onDoubleClick={() => patchAppearance({ classBarRows: 3 })}
      />
      <div className="flex h-full min-w-0 items-stretch gap-1 px-1" style={{ paddingTop: CLASS_PAD, paddingBottom: CLASS_PAD }}>
        <div
          data-testid="class-bar-scroll"
          className="scroll-thin min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain"
          onWheel={(event) => event.stopPropagation()}
        >
          <div className="flex flex-wrap content-start gap-1">
            {classes.map((row, index) => {
              const selected = row.id === active;
              return (
                <button
                  key={row.id}
                  type="button"
                  data-active={selected ? "1" : "0"}
                  title={classTitle(row, i18n.language)}
                  className={cn(
                    "inline-flex h-7 max-w-48 shrink-0 items-center gap-1 rounded-full border px-2 text-xs",
                    selected ? "border-accent bg-panel-2" : "border-line hover:bg-panel-2",
                  )}
                  onClick={() => setActiveClass(selected ? "" : row.id)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    useStudio.getState().patchUi({ dialog: "add-class" });
                  }}
                >
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: row.color }} />
                  <span className="truncate">{classTitle(row, i18n.language)}</span>
                  {HOTKEYS[index] ? <span className="text-[10px] text-muted">{HOTKEYS[index]}</span> : null}
                  <span className="text-[10px] text-muted">{row.count || 0}</span>
                </button>
              );
            })}
          </div>
        </div>
        <Tip label={t("class.addTitle")}>
          <button
            type="button"
            data-testid="class-add"
            aria-label={t("class.addTitle")}
            className="inline-flex h-7 shrink-0 items-center gap-1 self-start rounded-full border border-dashed border-line px-2 text-xs text-muted hover:border-accent hover:bg-panel-2 hover:text-ink"
            onClick={() => useStudio.getState().patchUi({ dialog: "add-class" })}
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="truncate">{t("class.addTitle")}</span>
          </button>
        </Tip>
        {trailing}
      </div>
    </div>
  );
}

function resetQuick() {
  const base: Partial<Appearance> = {
    guideLines: true,
    crosshairCursor: true,
    showLabels: DEFAULT_APPEARANCE.showLabels,
    advanceOnDraw: false,
    fillOpacity: DEFAULT_APPEARANCE.fillOpacity,
    crossWidth: 1,
    crossOpacity: DEFAULT_APPEARANCE.crossOpacity,
    crossColor: DEFAULT_APPEARANCE.crossColor,
    crossStyle: "dashed",
    crossDash: 4,
    crossGap: 4,
    crossShadow: true,
    samMulti: false,
    openZoom: "fit",
    fitOnOpen: true,
    wheelMode: "zoom",
    zoomStep: 1.25,
    showMinimap: true,
    labelColor: DEFAULT_APPEARANCE.labelColor,
    brightness: 1,
    contrast: 1,
    runColor: "",
    runWidth: DEFAULT_APPEARANCE.runWidth,
  };
  patchAppearance(base);
  window.dispatchEvent(new CustomEvent("studio-navigator", { detail: true }));
}

export function CanvasChrome() {
  const { t, i18n } = useTranslation();
  const look = useAppearance();
  const pointer = usePointer();
  const step = useStudio((state) => state.step);
  const classPopup = useStudio((state) => state.ui.classPopup);
  const rtl = i18n.dir() === "rtl";
  const Prev = rtl ? ChevronRight : ChevronLeft;
  const Next = rtl ? ChevronLeft : ChevronRight;
  const gearRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const toneRef = useRef<HTMLButtonElement>(null);
  const tonePanelRef = useRef<HTMLDivElement>(null);
  const [gear, setGear] = useState(false);
  const [tone, setTone] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [spot, setSpot] = useState({ left: 8, top: 8, maxHeight: 460 });
  const hudLive = gear || tone || zoomOpen;
  const toneDirty = look.brightness !== 1 || look.contrast !== 1;
  const needle = query.trim().toLowerCase();
  const show = (...labels: string[]) => !needle || labels.some((label) => label.toLowerCase().includes(needle));
  const closeGear = (focus = true) => {
    setGear(false);
    if (focus) gearRef.current?.focus();
  };
  useBoundDismiss(gear, () => closeGear(true), () => [panelRef.current, gearRef.current]);
  useBoundDismiss(tone, () => setTone(false), () => [tonePanelRef.current, toneRef.current]);
  useLayoutEffect(() => {
    if (!gear) return undefined;
    const place = () => {
      const rect = gearRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(400, window.innerWidth - 16);
      const panelH = panelRef.current?.offsetHeight || 420;
      const next = anchorAbove(rect, { w: width, h: panelH }, { w: window.innerWidth, h: window.innerHeight });
      setSpot((prev) => (prev.left === next.left && prev.top === next.top && prev.maxHeight === next.maxHeight ? prev : next));
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [gear, query]);
  const openGear = () => {
    setTone(false);
    if (gear) {
      closeGear(true);
      return;
    }
    setGear(true);
  };
  return (
    <div
      data-testid="canvas-chrome"
      data-open={hudLive ? "1" : "0"}
      className={cn(
        "pointer-events-auto flex h-8 max-w-[calc(100%-24px)] items-center gap-0.5 overflow-visible rounded-lg border border-line px-1 text-[12px] shadow-pop backdrop-blur-[12px] transition-[opacity,background-color] duration-[140ms]",
        hudLive ? "bg-panel/95 opacity-100" : "bg-panel/60 opacity-60 hover:bg-panel/95 hover:opacity-100",
      )}
    >
      <HudIcon label={t("view.zoomOut")} onClick={() => drawCommands.zoom(-1)}><Minus className="h-3.5 w-3.5" /></HudIcon>
      <Dropdown.Root open={zoomOpen} onOpenChange={setZoomOpen}>
        <Dropdown.Trigger asChild>
          <button
            type="button"
            aria-label={t("zoom.step")}
            className="inline-flex h-7 min-w-[3.25rem] shrink-0 items-center justify-center rounded-md px-1.5 font-medium tabular-nums transition-colors duration-[140ms] hover:bg-panel-2"
          >
            {pointer.zoom}%
          </button>
        </Dropdown.Trigger>
        <Dropdown.Portal>
          <Dropdown.Content side="top" sideOffset={8} className="z-[80] min-w-40 overflow-hidden rounded-lg border border-line bg-panel p-1 text-ink shadow-pop">
            <MenuItem label={t("view.fit")} onSelect={() => drawCommands.fit()} />
            <MenuItem label="50%" onSelect={() => drawCommands.zoomTo(0.5)} />
            <MenuItem label={t("m.zoom100")} onSelect={() => drawCommands.zoomTo(1)} />
            <MenuItem label="200%" onSelect={() => drawCommands.zoomTo(2)} />
            <MenuItem label={t("shortcuts.zoomSelection")} onSelect={() => drawCommands.zoomSelection()} />
          </Dropdown.Content>
        </Dropdown.Portal>
      </Dropdown.Root>
      <HudIcon label={t("view.zoomIn")} onClick={() => drawCommands.zoom(1)}><Plus className="h-3.5 w-3.5" /></HudIcon>
      <HudRule />
      <HudIcon label={t("view.fit")} onClick={() => drawCommands.fit()}><Maximize2 className="h-3.5 w-3.5" /></HudIcon>
      <HudIcon label={t("m.zoom100")} onClick={() => drawCommands.zoomTo(1)}>
        <span className="text-[11px] font-semibold leading-none">1:1</span>
      </HudIcon>
      <HudRule />
      <HudIcon label={t("nav.prev")} onClick={() => void step(-1)}><Prev className="h-4 w-4" /></HudIcon>
      <HudIcon label={t("nav.next")} onClick={() => void step(1)}><Next className="h-4 w-4" /></HudIcon>
      <HudRule />
      <div className="relative">
        <HudIcon
          buttonRef={toneRef}
          label={`${t("m.brightness")} / ${t("m.contrast")}`}
          active={tone || toneDirty}
          onClick={() => {
            closeGear(false);
            setTone((open) => !open);
          }}
        >
          <Sun className="h-3.5 w-3.5" />
          {toneDirty ? <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-accent" /> : null}
        </HudIcon>
        {tone ? (
          <div ref={tonePanelRef} data-overlay-nested className="absolute bottom-[calc(100%+8px)] right-0 z-[80] w-56 rounded-lg border border-line bg-panel p-3 shadow-pop">
            <HudSlider label={t("m.brightness")} value={look.brightness} min={0.2} max={2} step={0.05} onChange={(brightness) => patchAppearance({ brightness })} />
            <HudSlider label={t("m.contrast")} value={look.contrast} min={0.2} max={2} step={0.05} onChange={(contrast) => patchAppearance({ contrast })} />
          </div>
        ) : null}
      </div>
      <HudIcon buttonRef={gearRef} testId="canvas-gear" label={t("activity.settings")} active={gear} expanded={gear} onClick={openGear}>
        <Settings2 className="h-3.5 w-3.5" />
      </HudIcon>
      <HudRule />
      <button
        type="button"
        data-testid="label-submit"
        className="inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md bg-accent px-2.5 text-[12px] font-medium text-accent-ink transition-colors duration-[140ms] hover:brightness-110"
        onClick={() => saveAndContinue()}
      >
        <span>{t("label.saveContinue")}</span>
        <kbd className="kbd shrink-0 opacity-80">{t("label.shortcut")}</kbd>
      </button>
      {gear && typeof document !== "undefined" ? createPortal(
        <div ref={panelRef} data-testid="quick-settings" data-overlay="quick-settings" className="fixed z-[80] flex w-[400px] max-w-[calc(100vw-16px)] flex-col gap-3 overflow-auto rounded-lg border border-line bg-panel p-3 shadow-pop" style={{ left: spot.left, top: spot.top, maxHeight: spot.maxHeight }}>
          <div className="flex items-center gap-2">
            <input data-testid="quick-search" aria-label={t("settings.search")} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("settings.search")} className="h-8 min-w-0 flex-1 rounded-md border border-line bg-panel-2 px-2 text-[13px]" />
            <button type="button" data-testid="quick-reset" className="h-8 shrink-0 rounded-md border border-line px-2 text-[13px] hover:bg-panel-2" onClick={resetQuick}>{t("settings.reset")}</button>
            <button type="button" data-testid="quick-close" aria-label={t("dock.close")} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line hover:bg-panel-2" onClick={() => closeGear(true)}><X className="h-3.5 w-3.5" /></button>
          </div>
          <div className="flex flex-col gap-4">
            {show(t("set.section.view"), t("set.guideLines"), t("set.crossCursor"), t("m.labels"), t("set.labelColor"), t("bottom.auto"), t("bottom.popup"), t("set.minimap"), t("zoom.open"), t("zoom.wheel"), t("zoom.step"), t("m.fill")) ? (
              <SettingsGroup title={t("set.section.view")}>
                <SettingToggle label={t("set.guideLines")} checked={look.guideLines} onChange={(guideLines) => patchAppearance({ guideLines })} />
                <SettingToggle label={t("set.crossCursor")} checked={look.crosshairCursor} onChange={(crosshairCursor) => patchAppearance({ crosshairCursor })} />
                <SettingToggle label={t("m.labels")} checked={look.showLabels} onChange={(showLabels) => patchAppearance({ showLabels })} />
                <SettingColor testId="quick-label-color" label={t("set.labelColor")} value={look.labelColor} onChange={(labelColor) => patchAppearance({ labelColor })} />
                <SettingToggle label={t("bottom.auto")} checked={look.advanceOnDraw} onChange={(advanceOnDraw) => patchAppearance({ advanceOnDraw })} />
                <SettingToggle label={t("bottom.popup")} checked={classPopup} onChange={(value) => useStudio.getState().patchUi({ classPopup: value })} />
                <SettingToggle label={t("set.minimap")} checked={look.showMinimap} onChange={(showMinimap) => { patchAppearance({ showMinimap }); window.dispatchEvent(new CustomEvent("studio-navigator", { detail: showMinimap })); }} />
                <SettingsSegmented testId="open-zoom" label={t("zoom.open")} value={look.openZoom} options={openZoomChoices(t)} onChange={(id) => { const openZoom = parseOpenZoom(id); patchAppearance({ openZoom, fitOnOpen: openZoom === "fit" || openZoom === "fill" }); }} />
                <SettingsSegmented label={t("zoom.wheel")} value={look.wheelMode} options={[{ id: "zoom", label: t("zoom.wheelZoom") }, { id: "pan", label: t("zoom.wheelPan") }]} onChange={(id) => patchAppearance({ wheelMode: id === "pan" ? "pan" : "zoom" })} />
                <SettingsSlider label={t("zoom.step")} value={look.zoomStep} min={1.05} max={3} step={0.05} onChange={(zoomStep) => patchAppearance({ zoomStep: zoomStep || 1.25 })} format={(value) => value.toFixed(2)} />
                <SettingsSlider label={t("m.fill")} value={look.fillOpacity} min={0} max={0.6} step={0.02} onChange={(fillOpacity) => patchAppearance({ fillOpacity })} format={(value) => value.toFixed(2)} />
              </SettingsGroup>
            ) : null}
            {show(t("set.section.guides"), t("set.crossStyle"), t("guide.shadow"), t("settings.crossWidth"), t("settings.crossOpacity"), t("guide.dash"), t("guide.gap"), t("settings.crossColor")) ? (
              <SettingsGroup title={t("set.section.guides")}>
                <SettingsSegmented label={t("set.crossStyle")} value={look.crossStyle} options={[{ id: "solid", label: t("set.solid") }, { id: "dashed", label: t("set.dashed") }, { id: "dotted", label: t("set.dotted") }]} onChange={(id) => patchAppearance({ crossStyle: id === "solid" || id === "dotted" ? id : "dashed" })} />
                <SettingToggle label={t("guide.shadow")} checked={look.crossShadow} onChange={(crossShadow) => patchAppearance({ crossShadow })} />
                <SettingsSlider label={t("settings.crossWidth")} value={look.crossWidth} min={0.5} max={4} step={0.5} onChange={(crossWidth) => patchAppearance({ crossWidth })} format={(value) => `${value}px`} />
                <SettingsSlider label={t("settings.crossOpacity")} value={look.crossOpacity} min={0.15} max={1} step={0.05} onChange={(crossOpacity) => patchAppearance({ crossOpacity })} format={(value) => `${Math.round(value * 100)}%`} />
                <SettingsSlider label={t("guide.dash")} value={look.crossDash} min={1} max={24} step={1} onChange={(crossDash) => patchAppearance({ crossDash })} format={(value) => `${value}px`} />
                <SettingsSlider label={t("guide.gap")} value={look.crossGap} min={1} max={24} step={1} onChange={(crossGap) => patchAppearance({ crossGap })} format={(value) => `${value}px`} />
                <SettingColor label={t("settings.crossColor")} value={look.crossColor} onChange={(crossColor) => patchAppearance({ crossColor })} />
              </SettingsGroup>
            ) : null}
            {show(t("set.section.run"), t("run.width"), t("settings.runColor"), t("bottom.sam")) ? (
              <SettingsGroup title={t("set.section.run")}>
                <SettingsSlider label={t("run.width")} value={look.runWidth} min={0.5} max={12} step={0.5} onChange={(runWidth) => patchAppearance({ runWidth })} format={(value) => `${value}px`} />
                <SettingColor label={t("settings.runColor")} value={look.runColor || look.accent} onChange={(runColor) => patchAppearance({ runColor })} />
                <SettingToggle label={t("bottom.sam")} checked={look.samMulti} onChange={(samMulti) => patchAppearance({ samMulti })} />
              </SettingsGroup>
            ) : null}
          </div>
          <button type="button" className="h-8 rounded-md px-1 text-start text-[13px] text-muted transition-colors duration-[140ms] hover:bg-panel-2 hover:text-ink" onClick={() => { closeGear(false); useStudio.getState().patchUi({ dialog: "settings" }); }}>{t("file.settings")}</button>
        </div>,
        document.body,
      ) : null}
    </div>
  );
}

function HudRule() {
  return <span className="mx-0.5 h-4 w-px shrink-0 bg-line" aria-hidden />;
}

function HudIcon({
  label,
  onClick,
  active,
  expanded,
  testId,
  buttonRef,
  children,
}: {
  label: string;
  onClick?: () => void;
  active?: boolean;
  expanded?: boolean;
  testId?: string;
  buttonRef?: Ref<HTMLButtonElement>;
  children: ReactNode;
}) {
  return (
    <Tip label={label}>
      <button
        ref={buttonRef}
        type="button"
        data-testid={testId}
        aria-label={label}
        aria-expanded={expanded}
        onClick={onClick}
        className={cn(
          "relative z-[81] inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors duration-[140ms] hover:bg-panel-2",
          active && "bg-panel-2 text-accent",
        )}
      >
        {children}
      </button>
    </Tip>
  );
}

function HudSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid gap-1 py-1 text-[11px]">
      <span className="flex items-center justify-between gap-2">
        <span className="text-muted">{label}</span>
        <span className="tabular-nums text-ink">{value.toFixed(2)}</span>
      </span>
      <input aria-label={label} type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className="h-7 w-full accent-[var(--accent)]" />
    </label>
  );
}

export function bothCrosshairOn(): boolean {
  const look = appearance();
  return look.guideLines && look.crosshairCursor;
}
