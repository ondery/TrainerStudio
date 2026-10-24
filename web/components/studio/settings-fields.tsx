"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { TextButton } from "@/components/ui";
import { api } from "@/lib/api";
import { appearance, patchAppearance, useAppearance, type Appearance } from "@/lib/appearance";
import { parseOpenZoom } from "@/lib/zoom-frame";
import { useStudio } from "@/lib/store";
import {
  SettingColor,
  SettingNum,
  SettingRow,
  SettingSelect,
  SettingText,
  SettingToggle,
  SettingsForm,
  SettingsGroup,
  SettingsStack,
  SettingsSegmented,
  SettingsSlider,
  openZoomChoices,
} from "./setting-controls";

export function GeneralSettings() {
  const { t } = useTranslation();
  const look = useAppearance();
  const ui = useStudio((state) => state.ui);
  const patchUi = useStudio((state) => state.patchUi);
  return (
    <SettingsForm>
      <SettingToggle label={t("settings.classPopup")} checked={ui.classPopup} onChange={(classPopup) => patchUi({ classPopup })} />
      <SettingToggle label={t("settings.askClass")} checked={ui.askClass} onChange={(askClass) => patchUi({ askClass })} />
      <SettingToggle label={t("set.confirmDelete")} checked={look.confirmDelete} onChange={(confirmDelete) => patchAppearance({ confirmDelete })} />
      <SettingToggle label={t("set.keepTool")} checked={look.keepTool} onChange={(keepTool) => patchAppearance({ keepTool })} />
      <SettingToggle label={t("set.remember")} checked={look.rememberImage} onChange={(rememberImage) => patchAppearance({ rememberImage })} />
      <SettingToggle label={t("set.advance")} checked={look.advanceOnDraw} onChange={(advanceOnDraw) => patchAppearance({ advanceOnDraw })} />
      <SettingSelect
        label={t("set.startup")}
        value={look.startupLayout}
        options={["default", "labeling", "review", "training"].map((id) => ({ id, label: t(`window.${id}`) }))}
        onChange={(startupLayout) => patchAppearance({ startupLayout: startupLayout as Appearance["startupLayout"] })}
      />
      <SettingNum label={t("set.autosave")} value={look.autosaveMs} min={200} max={10000} step={100} onChange={(autosaveMs) => patchAppearance({ autosaveMs: Math.max(200, autosaveMs || 800) })} />
      <SettingText label={t("set.dataDir")} value={look.dataDir} onChange={(dataDir) => patchAppearance({ dataDir })} />
      <ServerDir />
    </SettingsForm>
  );
}

function ServerDir() {
  const { t } = useTranslation();
  const [dir, setDir] = useState("");
  useEffect(() => {
    void api<{ dataDir?: string }>("/api/health").then((body) => setDir(body.dataDir || "")).catch(() => setDir(""));
  }, []);
  return <SettingText label={t("set.serverData")} value={dir} readOnly />;
}

export function AppearanceSettings() {
  const { t } = useTranslation();
  const look = useAppearance();
  const patchUi = useStudio((state) => state.patchUi);
  return (
    <SettingsForm>
      <SettingsSegmented
        label={t("settings.theme")}
        value={look.theme}
        options={[{ id: "dark", label: t("settings.dark") }, { id: "light", label: t("settings.light") }, { id: "system", label: t("theme.system") }]}
        onChange={(id) => {
          const theme = id === "light" || id === "system" ? id : "dark";
          patchAppearance({ theme });
          if (theme !== "system") patchUi({ theme });
        }}
      />
      <SettingToggle label={t("chrome.ribbon")} checked={look.chrome === "ribbon"} onChange={(on) => patchAppearance({ chrome: on ? "ribbon" : "classic" })} />
      <SettingColor label={t("settings.accent")} value={look.accent} onChange={(accent) => patchAppearance({ accent })} />
      <SettingsSegmented
        label={t("settings.density")}
        value={look.density}
        options={[{ id: "comfortable", label: t("settings.comfortable") }, { id: "compact", label: t("view.compact") }]}
        onChange={(id) => patchAppearance({ density: id === "compact" ? "compact" : "comfortable" })}
      />
      <SettingNum label={t("settings.fontSize")} value={look.fontSize} min={11} max={18} onChange={(fontSize) => patchAppearance({ fontSize: fontSize || 13 })} />
      <SettingNum label={t("set.uiScale")} value={look.uiScale} min={0.8} max={1.4} step={0.05} onChange={(uiScale) => patchAppearance({ uiScale: uiScale || 1 })} />
      <SettingToggle label={t("set.snapDock")} checked={look.snapDock} onChange={(snapDock) => patchAppearance({ snapDock })} />
      <SettingToggle label={t("set.snapPanels")} checked={look.snapPanels} onChange={(snapPanels) => patchAppearance({ snapPanels })} />
    </SettingsForm>
  );
}

export function CanvasSettings() {
  const { t } = useTranslation();
  const look = useAppearance();
  const patchUi = useStudio((state) => state.patchUi);
  return (
    <SettingsStack>
      <SettingsGroup title={t("set.section.guides")}>
        <SettingToggle label={t("set.guideLines")} checked={look.guideLines} onChange={(guideLines) => { patchAppearance({ guideLines }); patchUi({ crosshair: guideLines || look.crosshairCursor }); }} />
        <SettingToggle label={t("set.crossCursor")} checked={look.crosshairCursor} onChange={(crosshairCursor) => { patchAppearance({ crosshairCursor }); patchUi({ crosshair: look.guideLines || crosshairCursor }); }} />
        <SettingColor label={t("settings.crossColor")} value={look.crossColor} onChange={(crossColor) => patchAppearance({ crossColor })} />
        <SettingsSlider label={t("settings.crossWidth")} value={look.crossWidth} min={1} max={4} step={0.5} onChange={(crossWidth) => patchAppearance({ crossWidth: crossWidth || 1 })} format={(value) => `${value}px`} />
        <SettingsSlider label={t("settings.crossOpacity")} value={look.crossOpacity} min={0.1} max={1} step={0.05} onChange={(crossOpacity) => patchAppearance({ crossOpacity: crossOpacity || 0.9 })} format={(value) => `${Math.round(value * 100)}%`} />
        <SettingsSegmented label={t("set.crossStyle")} value={look.crossStyle} options={[{ id: "solid", label: t("set.solid") }, { id: "dashed", label: t("set.dashed") }, { id: "dotted", label: t("set.dotted") }]} onChange={(id) => patchAppearance({ crossStyle: id === "solid" || id === "dotted" ? id : "dashed" })} />
        <SettingToggle label={t("guide.shadow")} checked={look.crossShadow} onChange={(crossShadow) => patchAppearance({ crossShadow })} />
        <SettingsSlider label={t("guide.dash")} value={look.crossDash} min={1} max={24} step={1} onChange={(crossDash) => patchAppearance({ crossDash })} format={(value) => `${value}px`} />
        <SettingsSlider label={t("guide.gap")} value={look.crossGap} min={1} max={24} step={1} onChange={(crossGap) => patchAppearance({ crossGap })} format={(value) => `${value}px`} />
        <SettingToggle label={t("settings.loupe")} checked={look.loupe} onChange={(loupe) => patchAppearance({ loupe })} />
        <SettingNum label={t("set.loupeSize")} value={look.loupeSize} min={64} max={256} step={8} onChange={(loupeSize) => patchAppearance({ loupeSize: loupeSize || 128 })} />
        <SettingNum label={t("set.loupeZoom")} value={look.loupeZoom} min={2} max={12} onChange={(loupeZoom) => patchAppearance({ loupeZoom: loupeZoom || 4 })} />
        <SettingColor label={t("set.canvasBg")} value={look.canvasBg} onChange={(canvasBg) => patchAppearance({ canvasBg })} />
      </SettingsGroup>
      <SettingsGroup title={t("set.section.view")}>
        <SettingsSegmented testId="settings-open-zoom" label={t("zoom.open")} value={look.openZoom} options={openZoomChoices(t)} onChange={(id) => { const openZoom = parseOpenZoom(id); patchAppearance({ openZoom, fitOnOpen: openZoom === "fit" || openZoom === "fill" }); }} />
        <SettingsSegmented label={t("zoom.wheel")} value={look.wheelMode} options={[{ id: "zoom", label: t("zoom.wheelZoom") }, { id: "pan", label: t("zoom.wheelPan") }]} onChange={(wheelMode) => patchAppearance({ wheelMode: wheelMode === "pan" ? "pan" : "zoom" })} />
        <SettingsSlider label={t("zoom.step")} value={look.zoomStep} min={1.05} max={3} step={0.05} onChange={(zoomStep) => patchAppearance({ zoomStep: zoomStep || 1.25 })} format={(value) => value.toFixed(2)} />
        <SettingToggle label={t("set.minimap")} checked={look.showMinimap} onChange={(showMinimap) => patchAppearance({ showMinimap })} />
        <SettingsSlider label={t("m.brightness")} value={look.brightness} min={0.2} max={2} step={0.05} onChange={(brightness) => patchAppearance({ brightness: brightness || 1 })} format={(value) => value.toFixed(2)} />
        <SettingsSlider label={t("m.contrast")} value={look.contrast} min={0.2} max={2} step={0.05} onChange={(contrast) => patchAppearance({ contrast: contrast || 1 })} format={(value) => value.toFixed(2)} />
      </SettingsGroup>
      <SettingsGroup title={t("set.section.run")}>
        <div className="px-3 py-2.5">
        <div data-testid="run-preview" data-running="1" className="relative h-20 overflow-hidden rounded-md bg-stage">
          <div
            className="run-border is-preview"
            style={{
              ["--run-color" as string]: look.runColor || look.accent,
              ["--run-width" as string]: `${look.runWidth || 3}px`,
            }}
          >
            <i />
          </div>
        </div>
        </div>
        <SettingColor testId="run-color" label={t("settings.runColor")} value={look.runColor || look.accent} onChange={(runColor) => patchAppearance({ runColor })} />
        <SettingsSlider label={t("run.width")} value={look.runWidth} min={0.5} max={12} step={0.5} onChange={(runWidth) => patchAppearance({ runWidth })} format={(value) => `${value}px`} />
      </SettingsGroup>
    </SettingsStack>
  );
}

export function AnnotationSettings() {
  const { t } = useTranslation();
  const look = useAppearance();
  const ui = useStudio((state) => state.ui);
  const patchUi = useStudio((state) => state.patchUi);
  return (
    <SettingsForm>
      <SettingToggle label={t("settings.classPopup")} checked={ui.classPopup} onChange={(classPopup) => patchUi({ classPopup })} />
      <SettingToggle label={t("settings.askClass")} checked={ui.askClass} onChange={(askClass) => patchUi({ askClass })} />
      <SettingToggle label={t("m.labels")} checked={look.showLabels} onChange={(showLabels) => patchAppearance({ showLabels })} />
      <SettingToggle label={t("m.classNames")} checked={look.showClassNames} onChange={(showClassNames) => patchAppearance({ showClassNames })} />
      <SettingToggle label={t("set.snap")} checked={look.snap} onChange={(snap) => patchAppearance({ snap })} />
      <SettingToggle label={t("set.advance")} checked={look.advanceOnDraw} onChange={(advanceOnDraw) => patchAppearance({ advanceOnDraw })} />
      <SettingToggle label={t("set.keepTool")} checked={look.keepTool} onChange={(keepTool) => patchAppearance({ keepTool })} />
      <SettingsSlider label={t("set.boxLine")} value={look.boxLine} min={0.5} max={6} step={0.1} onChange={(boxLine) => patchAppearance({ boxLine: boxLine || 1.6 })} format={(value) => `${value}px`} />
      <SettingsSlider label={t("set.fill")} value={look.fillOpacity} min={0} max={1} step={0.01} onChange={(fillOpacity) => patchAppearance({ fillOpacity })} format={(value) => value.toFixed(2)} />
      <SettingNum label={t("set.labelFont")} value={look.labelFont} min={8} max={24} onChange={(labelFont) => patchAppearance({ labelFont: labelFont || 12 })} />
      <SettingColor testId="label-color" label={t("set.labelColor")} value={look.labelColor} onChange={(labelColor) => patchAppearance({ labelColor })} />
      <SettingNum label={t("set.handle")} value={look.handleSize} min={4} max={16} onChange={(handleSize) => patchAppearance({ handleSize: handleSize || 8 })} />
    </SettingsForm>
  );
}

export function NavigationSettings() {
  const { t } = useTranslation();
  const look = useAppearance();
  const ui = useStudio((state) => state.ui);
  const patchUi = useStudio((state) => state.patchUi);
  return (
    <SettingsForm>
      <SettingToggle label={t("settings.autoAdvance")} checked={ui.autoAdvance} onChange={(autoAdvance) => patchUi({ autoAdvance })} />
      <SettingToggle label={t("set.wrap")} checked={look.wrapNavigation} onChange={(wrapNavigation) => patchAppearance({ wrapNavigation })} />
      <SettingToggle label={t("set.skipUnlabeled")} checked={look.skipUnlabeled} onChange={(skipUnlabeled) => patchAppearance({ skipUnlabeled })} />
      <SettingSelect label={t("set.imageSort")} value={look.imageSort} options={[{ id: "name", label: t("m.sortName") }, { id: "count", label: t("m.sortCount") }, { id: "status", label: t("m.sortStatus") }]} onChange={(imageSort) => patchAppearance({ imageSort: imageSort as Appearance["imageSort"] })} />
      <SettingSelect label={t("set.imageView")} value={look.imageView} options={[{ id: "list", label: t("m.list") }, { id: "thumbs", label: t("m.thumbs") }]} onChange={(imageView) => patchAppearance({ imageView: imageView === "thumbs" ? "thumbs" : "list" })} />
      <SettingNum label={t("set.filmstrip")} value={look.filmstripHeight} min={48} max={160} step={8} onChange={(filmstripHeight) => patchAppearance({ filmstripHeight: filmstripHeight || 72 })} />
    </SettingsForm>
  );
}

export function ClassSettingsExtra() {
  const { t } = useTranslation();
  const look = useAppearance();
  return (
    <SettingsForm>
      <SettingSelect label={t("set.sortClasses")} value={look.sortClasses} options={[{ id: "index", label: t("m.sortIndex") }, { id: "name", label: t("m.sortName") }, { id: "count", label: t("m.sortCount") }]} onChange={(sortClasses) => patchAppearance({ sortClasses: sortClasses as Appearance["sortClasses"] })} />
      <SettingToggle label={t("set.hideEmpty")} checked={look.hideEmpty} onChange={(hideEmpty) => patchAppearance({ hideEmpty })} />
      <SettingToggle label={t("set.indexes")} checked={look.showIndexes} onChange={(showIndexes) => patchAppearance({ showIndexes })} />
      <SettingToggle label={t("set.hotkeys")} checked={look.classHotkeys} onChange={(classHotkeys) => patchAppearance({ classHotkeys })} />
    </SettingsForm>
  );
}

export function SamSettingsExtra() {
  const { t } = useTranslation();
  const look = useAppearance();
  return (
    <SettingsForm>
      <SettingsSlider label={t("set.samThreshold")} value={look.samThreshold} min={0} max={1} step={0.05} onChange={(samThreshold) => patchAppearance({ samThreshold })} format={(value) => value.toFixed(2)} />
      <SettingNum label={t("set.samPoints")} value={look.samMaxPoints} min={1} max={32} onChange={(samMaxPoints) => patchAppearance({ samMaxPoints: samMaxPoints || 8 })} />
      <SettingToggle label={t("set.samMulti")} checked={look.samMulti} onChange={(samMulti) => patchAppearance({ samMulti })} />
      <SettingToggle label={t("set.prelabelOnOpen")} hint={t("set.prelabelHint")} checked={look.prelabelOnOpen} onChange={(prelabelOnOpen) => patchAppearance({ prelabelOnOpen })} />
      <SettingsSlider label={t("set.prelabelConf")} value={look.prelabelConf} min={0.05} max={0.95} step={0.05} onChange={(prelabelConf) => patchAppearance({ prelabelConf })} format={(value) => value.toFixed(2)} />
    </SettingsForm>
  );
}

export function TrainingSettingsExtra() {
  const { t } = useTranslation();
  const look = useAppearance();
  const [cuda, setCuda] = useState(true);
  useEffect(() => {
    void api<{ cuda?: boolean }>("/api/ai/status")
      .then((body) => {
        const ok = Boolean(body.cuda);
        setCuda(ok);
        if (!ok && appearance().trainDevice === "cuda") patchAppearance({ trainDevice: "cpu" });
      })
      .catch(() => setCuda(false));
  }, []);
  return (
    <SettingsForm>
      <SettingText label={t("set.family")} value={look.trainFamily} onChange={(trainFamily) => patchAppearance({ trainFamily })} />
      <SettingSelect
        label={t("set.device")}
        value={look.trainDevice}
        options={[{ id: "cpu", label: t("sam.cpu") }, { id: "cuda", label: t("sam.cuda"), disabled: !cuda }]}
        onChange={(trainDevice) => patchAppearance({ trainDevice: trainDevice === "cuda" && cuda ? "cuda" : "cpu" })}
      />
      <SettingText label={t("set.weights")} value={look.trainWeights} onChange={(trainWeights) => patchAppearance({ trainWeights })} />
      <SettingNum label={t("set.workers")} value={look.workers} min={0} max={16} onChange={(workers) => patchAppearance({ workers: Math.max(0, workers || 0) })} />
    </SettingsForm>
  );
}

export function ExportSettingsExtra() {
  const { t } = useTranslation();
  const look = useAppearance();
  return (
    <SettingsForm>
      <SettingToggle label={t("m.grouped")} checked={look.exportGrouped} onChange={(exportGrouped) => patchAppearance({ exportGrouped })} />
      <SettingToggle label={t("set.empty")} checked={look.exportEmpty} onChange={(exportEmpty) => patchAppearance({ exportEmpty })} />
      <SettingNum label={t("set.precision")} value={look.exportPrecision} min={1} max={8} onChange={(exportPrecision) => patchAppearance({ exportPrecision: exportPrecision || 6 })} />
    </SettingsForm>
  );
}

export function PerformanceSettings() {
  const { t } = useTranslation();
  const look = useAppearance();
  return (
    <SettingsForm>
      <SettingNum label={t("set.prefetch")} value={look.prefetch} min={0} max={8} onChange={(prefetch) => patchAppearance({ prefetch })} />
      <SettingNum label={t("set.threads")} value={look.threads} min={1} max={16} onChange={(threads) => patchAppearance({ threads: threads || 2 })} />
      <SettingNum label={t("set.overscan")} value={look.overscan} min={2} max={40} onChange={(overscan) => patchAppearance({ overscan: overscan || 8 })} />
      <SettingNum label={t("set.thumbCache")} value={look.thumbCache} min={50} max={2000} step={50} onChange={(thumbCache) => patchAppearance({ thumbCache: thumbCache || 400 })} />
      <SettingSelect label={t("set.log")} value={look.logLevel} options={[{ id: "info", label: "info" }, { id: "warn", label: "warn" }, { id: "debug", label: "debug" }]} onChange={(logLevel) => patchAppearance({ logLevel: logLevel === "debug" || logLevel === "warn" ? logLevel : "info" })} />
      <SettingRow label={t("settings.cache")} hint={t("settings.cacheHint")}>
        <TextButton label={t("settings.cache")} onClick={() => { window.localStorage.removeItem("trainer-studio.ui"); useStudio.getState().setNotice(t("settings.cacheDone")); }} />
      </SettingRow>
    </SettingsForm>
  );
}

export function AdvancedSettings() {
  const { t } = useTranslation();
  const look = useAppearance();
  return (
    <SettingsForm>
      <SettingNum label={t("set.wheel")} value={look.wheelZoom} min={1.02} max={1.4} step={0.02} onChange={(wheelZoom) => patchAppearance({ wheelZoom: wheelZoom || 1.08 })} />
      <SettingNum label={t("set.nudge")} value={look.nudge} min={1} max={64} onChange={(nudge) => patchAppearance({ nudge: Math.max(1, nudge || 1) })} />
      <SettingNum label={t("set.duplicateOffset")} value={look.duplicateOffset} min={0} max={200} onChange={(duplicateOffset) => patchAppearance({ duplicateOffset: duplicateOffset || 0 })} />
      <SettingNum label={t("set.recentLimit")} value={look.recentLimit} min={1} max={24} onChange={(recentLimit) => patchAppearance({ recentLimit: Math.max(1, recentLimit || 8) })} />
      <SettingToggle label={t("set.fitOnOpen")} checked={look.fitOnOpen} onChange={(fitOnOpen) => patchAppearance({ fitOnOpen })} />
      <SettingToggle label={t("set.labelBg")} checked={look.labelBg} onChange={(labelBg) => patchAppearance({ labelBg })} />
      <SettingToggle label={t("set.showCursor")} checked={look.showCursor} onChange={(showCursor) => patchAppearance({ showCursor })} />
      <SettingToggle label={t("set.showClass")} checked={look.showClass} onChange={(showClass) => patchAppearance({ showClass })} />
      <SettingToggle label={t("set.rawEdit")} checked={look.rawEdit} onChange={(rawEdit) => patchAppearance({ rawEdit })} />
      <SettingSelect label={t("set.log")} value={look.logLevel} options={[{ id: "info", label: "info" }, { id: "warn", label: "warn" }, { id: "debug", label: "debug" }]} onChange={(logLevel) => patchAppearance({ logLevel: logLevel === "debug" || logLevel === "warn" ? logLevel : "info" })} />
    </SettingsForm>
  );
}
