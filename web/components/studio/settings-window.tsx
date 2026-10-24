"use client";

import { useEffect, useMemo, useState, type ComponentType } from "react";
import { useTranslation } from "react-i18next";
import {
  BadgeCheck,
  Box,
  Check,
  Crosshair,
  Download,
  Gauge,
  Grid3x3,
  Keyboard,
  Languages,
  Layers,
  Monitor,
  Moon,
  Puzzle,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Tags,
  WandSparkles,
} from "lucide-react";
import { Modal, TextButton, TextInput } from "@/components/ui";
import { api, takeGrant } from "@/lib/api";
import { FILTERS } from "@/lib/browse";
import { APPEARANCE_KEY, DEFAULT_APPEARANCE, appearance, patchAppearance, useAppearance, type Appearance } from "@/lib/appearance";
import { LOCALES, applyLocale } from "@/lib/i18n";
import { BREAKPOINTS, LAYOUT_KEY, breakpointFor, buildTemplates, loadLayout, normalize, saveLayout, snap } from "@/lib/grid";
import { DEFAULT_SHORTCUTS, SHORTCUT_ACTIONS, comboFromEvent, loadShortcuts, saveShortcuts, type ShortcutAction } from "@/lib/shortcuts";
import { useStudio } from "@/lib/store";
import { PathField } from "./path-field";
import { AdvancedSettings, AnnotationSettings, AppearanceSettings, CanvasSettings, ClassSettingsExtra, ExportSettingsExtra, GeneralSettings, NavigationSettings, PerformanceSettings, SamSettingsExtra, TrainingSettingsExtra } from "./settings-fields";
import { SettingNum, SettingRow, SettingText, SettingToggle, SettingsCard, SettingsForm, SettingsGroup, SettingsInset, SettingsNote, SettingsSegmented, SettingsStack } from "./setting-controls";

type Icon = ComponentType<{ className?: string }>;
type Cat = { id: string; icon: Icon; label: string };

const CATS: Cat[] = [
  { id: "general", icon: Settings, label: "settings.general" },
  { id: "appearance", icon: Moon, label: "settings.appearance" },
  { id: "language", icon: Languages, label: "settings.language" },
  { id: "canvas", icon: Crosshair, label: "settings.canvas" },
  { id: "annotation", icon: WandSparkles, label: "settings.annotation" },
  { id: "shortcuts", icon: Keyboard, label: "settings.shortcuts" },
  { id: "classes", icon: Tags, label: "settings.classes" },
  { id: "navigation", icon: Layers, label: "settings.navigation" },
  { id: "sam", icon: Sparkles, label: "settings.sam" },
  { id: "training", icon: Gauge, label: "settings.training" },
  { id: "export", icon: Download, label: "settings.export" },
  { id: "performance", icon: Monitor, label: "settings.performance" },
  { id: "plugins", icon: Puzzle, label: "settings.plugins" },
  { id: "enterprise", icon: BadgeCheck, label: "settings.enterprise" },
  { id: "layout", icon: Grid3x3, label: "settings.layout" },
  { id: "advanced", icon: SlidersHorizontal, label: "settings.advanced" },
];

export function SettingsWindow({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const look = useAppearance();
  const [section, setSection] = useState("general");
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const visible = CATS.filter((cat) => !needle || `${t(cat.label)} ${cat.id}`.toLowerCase().includes(needle));
  const current = visible.find((cat) => cat.id === section) || visible[0];

  function reset() {
    const id = current?.id || section;
    if (id === "appearance") patchAppearance({ theme: "dark", accent: DEFAULT_APPEARANCE.accent, density: "comfortable", fontSize: 13 });
    else if (id === "canvas") patchAppearance({ guideLines: true, crosshairCursor: true, crossColor: DEFAULT_APPEARANCE.crossColor, crossWidth: 1, crossOpacity: DEFAULT_APPEARANCE.crossOpacity, crossStyle: "dashed", crossDash: 4, crossGap: 4, crossShadow: true, loupe: true, runColor: "", runWidth: DEFAULT_APPEARANCE.runWidth, openZoom: "fit", wheelMode: "zoom", zoomStep: 1.25, showMinimap: true });
    else if (id === "layout") {
      patchAppearance({ gridSize: 8, gridGap: 8, showGrid: false });
      window.dispatchEvent(new CustomEvent("studio-layout", { detail: "default" }));
    } else if (id === "shortcuts") saveShortcuts({ ...DEFAULT_SHORTCUTS });
    else if (id === "training") patchAppearance({ epochs: 10, imgsz: 640, batch: 8, trainOutput: "" });
    else if (id === "export") patchAppearance({ exportFormat: "yolo", exportDir: "" });
    else if (id === "sam") {
      useStudio.getState().patchUi({ samModel: "mobile_sam", samDevice: "cpu" });
      patchAppearance({ samCheckpoint: "", prelabelOnOpen: false, prelabelConf: 0.25 });
    } else if (id === "annotation" || id === "navigation" || id === "general") {
      useStudio.getState().patchUi({ classPopup: true, askClass: true, autoAdvance: false, crosshair: true, samModel: "mobile_sam", samDevice: "cpu", theme: "dark" });
      patchAppearance({ theme: "dark", guideLines: true, crosshairCursor: true });
    }
  }

  function exportJson() {
    const blob = {
      appearance: appearance(),
      shortcuts: loadShortcuts(),
      layout: loadLayout(),
      ui: useStudio.getState().ui,
    };
    const file = new Blob([JSON.stringify(blob, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = "trainer-studio-settings.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  function importJson(file: File) {
    void file.text().then((text) => applySettings(text)).catch((error: Error) => useStudio.getState().setNotice(error.message, "error"));
  }

  return (
    <Modal open={open} title={t("top.settings")} onClose={onClose} wide flush>
      <div className="flex h-[min(78vh,720px)] min-h-0" data-testid="settings-window">
        <aside className="flex w-[13.5rem] shrink-0 flex-col gap-1 overflow-auto border-e border-line px-2 py-3">
          <TextInput className="mb-1 h-8" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("settings.search")} aria-label={t("settings.search")} />
          {visible.map((cat) => {
            const Icon = cat.icon;
            const on = current?.id === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                data-testid={`settings-${cat.id}`}
                onClick={() => setSection(cat.id)}
                className={`flex h-8 items-center gap-2 whitespace-nowrap rounded-md px-2 text-start text-[13px] transition-colors duration-[140ms] ${on ? "text-ink" : "text-muted hover:bg-panel-2 hover:text-ink"}`}
                style={on ? { background: "color-mix(in srgb, var(--accent) 16%, transparent)" } : undefined}
              >
                <Icon className={`h-4 w-4 shrink-0 ${on ? "text-accent" : ""}`} />
                <span className="truncate">{t(cat.label)}</span>
              </button>
            );
          })}
        </aside>
        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-5">
            <h2 className="min-w-0 flex-1 truncate text-[20px] font-semibold leading-7">{current ? t(current.label) : ""}</h2>
            <TextButton label={t("settings.reset")} onClick={reset} />
            <TextButton label={t("settings.exportJson")} icon={Download} onClick={exportJson} />
            <label className="inline-flex h-8 cursor-pointer items-center gap-1 whitespace-nowrap rounded-md border border-line px-2">
              <Box className="h-4 w-4 shrink-0" />
              <span className="truncate">{t("settings.import")}</span>
              <input
                type="file"
                accept="application/json"
                className="sr-only"
                aria-label={t("settings.import")}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) importJson(file);
                }}
              />
            </label>
          </div>
          <div className="min-h-0 flex-1 overflow-auto px-5 py-5">
            {current ? <Section id={current.id} look={look} /> : <p className="text-muted">{t("panel.empty")}</p>}
          </div>
        </section>
      </div>
    </Modal>
  );
}

function Section({ id, look }: { id: string; look: Appearance }) {
  const { t, i18n } = useTranslation();
  const ui = useStudio((state) => state.ui);
  const patchUi = useStudio((state) => state.patchUi);
  if (id === "general") {
    return (
      <SettingsStack>
        <SettingsNote>{t("app.name")}</SettingsNote>
        <GeneralSettings />
        <SettingsFiles />
      </SettingsStack>
    );
  }
  if (id === "appearance") return <AppearanceSettings />;
  if (id === "language") {
    return (
      <SettingsForm>
        {LOCALES.map((item) => {
          const on = (i18n.resolvedLanguage || i18n.language) === item.code || (i18n.resolvedLanguage || i18n.language).startsWith(`${item.code}-`);
          return (
            <button
              key={item.code}
              type="button"
              onClick={() => applyLocale(item.code)}
              className="flex min-h-11 w-full items-center gap-3 px-3 py-2.5 text-start text-[13px] transition-colors duration-[140ms] hover:bg-panel"
              style={on ? { background: "color-mix(in srgb, var(--accent) 16%, transparent)" } : undefined}
            >
              <span className="min-w-0 flex-1 truncate font-medium">{item.name}</span>
              {on ? <Check className="h-4 w-4 shrink-0 text-accent" /> : null}
            </button>
          );
        })}
      </SettingsForm>
    );
  }
  if (id === "canvas") return <CanvasSettings />;
  if (id === "annotation") return <AnnotationSettings />;
  if (id === "shortcuts") return <ShortcutEditor active />;
  if (id === "classes") return <ClassesSection />;
  if (id === "navigation") return <NavigationSettings />;
  if (id === "sam") {
    return (
      <SettingsStack>
        <SettingsForm>
          <SettingText label={t("sam.model")} value={ui.samModel} onChange={(samModel) => patchUi({ samModel })} />
          <SettingsSegmented
            label={t("sam.device")}
            value={ui.samDevice}
            options={[{ id: "cpu", label: t("sam.cpu") }, { id: "cuda", label: t("sam.cuda") }]}
            onChange={(id) => patchUi({ samDevice: id === "cuda" ? "cuda" : "cpu" })}
          />
          <SettingRow label={t("ai.install")}>
            <TextButton label={t("ai.install")} onClick={() => patchUi({ dialog: "jobs" })} />
          </SettingRow>
        </SettingsForm>
        <SettingsCard>
          <SettingsInset>
            <PathField testId="path-sam" label={t("path.sam")} value={look.samCheckpoint} filters={FILTERS.weights} onChange={(samCheckpoint) => patchAppearance({ samCheckpoint })} />
          </SettingsInset>
        </SettingsCard>
        <SamSettingsExtra />
      </SettingsStack>
    );
  }
  if (id === "training") {
    return (
      <SettingsStack>
        <SettingsForm>
          <SettingNum label={t("jobs.epochs")} value={look.epochs} min={1} onChange={(epochs) => patchAppearance({ epochs: epochs || 1 })} />
          <SettingNum label={t("settings.imgsz")} value={look.imgsz} min={32} onChange={(imgsz) => patchAppearance({ imgsz: imgsz || 640 })} />
          <SettingNum label={t("settings.batch")} value={look.batch} min={1} onChange={(batch) => patchAppearance({ batch: batch || 8 })} />
        </SettingsForm>
        <SettingsCard>
          <SettingsInset>
            <PathField testId="path-train" label={t("path.output")} value={look.trainOutput} onChange={(trainOutput) => patchAppearance({ trainOutput })} />
          </SettingsInset>
        </SettingsCard>
        <TrainingSettingsExtra />
      </SettingsStack>
    );
  }
  if (id === "export") {
    return (
      <SettingsStack>
        <SettingsForm>
          <SettingsSegmented
            label={t("export.format")}
            value={look.exportFormat}
            options={(["yolo", "coco", "voc"] as const).map((format) => ({ id: format, label: t(`export.${format}`) }))}
            onChange={(id) => patchAppearance({ exportFormat: id === "coco" || id === "voc" ? id : "yolo" })}
          />
        </SettingsForm>
        <SettingsCard>
          <SettingsInset>
            <PathField testId="path-export-default" label={t("path.export")} value={look.exportDir} onChange={(exportDir) => patchAppearance({ exportDir })} />
          </SettingsInset>
        </SettingsCard>
        <ExportSettingsExtra />
      </SettingsStack>
    );
  }
  if (id === "performance") return <PerformanceSettings />;
  if (id === "plugins") return <PluginsSection />;
  if (id === "enterprise") return <EnterpriseSection />;
  if (id === "layout") {
    return (
      <SettingsStack>
        <SettingsForm>
          <SettingNum label={t("settings.gridSize")} value={8} min={8} max={8} onChange={() => undefined} />
          <SettingNum label={t("settings.gridGap")} value={look.gridGap} min={0} max={24} step={8} onChange={(gridGap) => patchAppearance({ gridGap: snap(gridGap || 8) })} />
          <SettingToggle label={t("settings.showGrid")} checked={look.showGrid} onChange={(showGrid) => patchAppearance({ showGrid })} />
        </SettingsForm>
        <LayoutTracks />
        <div className="flex flex-wrap gap-1 px-1">
          <TextButton label={t("window.default")} onClick={() => window.dispatchEvent(new CustomEvent("studio-layout", { detail: "default" }))} />
          <TextButton label={t("window.labeling")} onClick={() => window.dispatchEvent(new CustomEvent("studio-layout", { detail: "labeling" }))} />
          <TextButton label={t("window.review")} onClick={() => window.dispatchEvent(new CustomEvent("studio-layout", { detail: "review" }))} />
          <TextButton label={t("window.training")} onClick={() => window.dispatchEvent(new CustomEvent("studio-layout", { detail: "training" }))} />
          <TextButton label={t("window.save")} onClick={() => window.dispatchEvent(new CustomEvent("studio-layout", { detail: "save" }))} />
        </div>
      </SettingsStack>
    );
  }
  return (
    <SettingsStack>
      <AdvancedSettings />
      <SettingsNote>{t("build.storage", { layout: LAYOUT_KEY, appearance: APPEARANCE_KEY })}</SettingsNote>
      <AboutLine />
    </SettingsStack>
  );
}

function LayoutTracks() {
  const { t } = useTranslation();
  const [layout, setLayout] = useState(loadLayout);
  const bp = breakpointFor(typeof window === "undefined" ? 1920 : window.innerWidth);
  const span = layout.spans[bp];
  function write(next: ReturnType<typeof loadLayout>) {
    const clean = normalize(next);
    saveLayout(clean);
    setLayout(clean);
    window.dispatchEvent(new CustomEvent("studio-layout", { detail: "reload" }));
  }
  function patchSpan(key: "left" | "right" | "bottom", value: number) {
    write({ ...layout, spans: { ...layout.spans, [bp]: { ...span, [key]: value } } });
  }
  function patchTrack(key: "palette" | "menu" | "toolbar" | "status", value: number) {
    const tracks = { ...layout.tracks, [key]: snap(value) || layout.tracks[key] };
    write({ ...layout, tracks, templates: buildTemplates(tracks) });
  }
  return (
    <SettingsGroup title={bp}>
      {(["left", "right", "bottom"] as const).map((key) => (
        <SettingNum key={key} label={t(`dock.${key}`)} value={span[key]} min={0} max={6} onChange={(value) => patchSpan(key, value)} />
      ))}
      {(Object.keys(layout.tracks) as Array<keyof typeof layout.tracks>)
        .filter((key) => key !== "toolbar")
        .map((key) => (
          <SettingNum key={key} label={key} value={layout.tracks[key]} min={24} max={80} step={8} onChange={(value) => patchTrack(key, value)} />
        ))}
      <SettingsInset>
        <p className="truncate text-[11px] text-muted" title={BREAKPOINTS.join(" ")}>{BREAKPOINTS.join(" · ")}</p>
      </SettingsInset>
    </SettingsGroup>
  );
}

function ClassesSection() {
  const { t } = useTranslation();
  const project = useStudio((state) => state.project);
  const refresh = useStudio((state) => state.refresh);
  const [legacy, setLegacy] = useState("");
  return (
    <SettingsStack>
      <SettingsNote>{t("settings.classesHint")}</SettingsNote>
      <div className="flex flex-wrap gap-1 px-1">
        <TextButton label={t("classes.add")} onClick={() => useStudio.getState().patchUi({ dialog: "add-class" })} />
        <TextButton label={t("schema.title")} onClick={() => useStudio.getState().patchUi({ dialog: "schema" })} />
      </div>
      <ClassSettingsExtra />
      <SettingsCard>
        <SettingsInset>
          <PathField testId="path-legacy" label={t("path.legacy")} value={legacy} filters={FILTERS.json} onChange={setLegacy} />
          <div className="mt-2">
            <TextButton
              label={t("settings.legacy")}
              disabled={!project}
              onClick={() => {
                if (!project) return;
                void api(`/api/projects/${project.id}/schema/legacy`, { method: "POST", body: JSON.stringify({ path: legacy.trim() || undefined }) })
                  .then(() => refresh(project.id))
                  .catch((error: Error) => useStudio.getState().setNotice(error.message, "error"));
              }}
            />
          </div>
        </SettingsInset>
      </SettingsCard>
    </SettingsStack>
  );
}

function SettingsFiles() {
  const { t } = useTranslation();
  const [incoming, setIncoming] = useState("");
  const [outgoing, setOutgoing] = useState("");
  return (
    <SettingsCard>
      <SettingsInset>
        <PathField testId="path-settings-in" label={t("path.settings")} value={incoming} filters={FILTERS.json} onChange={setIncoming} />
        <div className="mt-2">
          <TextButton
            label={t("path.importSettings")}
            disabled={!incoming.trim()}
            onClick={() => {
              void api<{ text: string }>("/api/local/read", { method: "POST", body: JSON.stringify({ path: incoming.trim(), grant: takeGrant(incoming.trim()) }) })
                .then((body) => applySettings(body.text))
                .catch((error: Error) => useStudio.getState().setNotice(error.message, "error"));
            }}
          />
        </div>
      </SettingsInset>
      <SettingsInset>
        <PathField testId="path-settings-out" label={t("path.exportSettings")} value={outgoing} filters={FILTERS.json} onChange={setOutgoing} />
        <div className="mt-2">
          <TextButton
            label={t("path.exportSettings")}
            disabled={!outgoing.trim()}
            onClick={() => {
              const blob = {
                appearance: appearance(),
                shortcuts: loadShortcuts(),
                layout: loadLayout(),
                ui: useStudio.getState().ui,
              };
              void api("/api/local/write", { method: "POST", body: JSON.stringify({ path: outgoing.trim(), text: JSON.stringify(blob, null, 2), grant: takeGrant(outgoing.trim()) }) })
                .catch((error: Error) => useStudio.getState().setNotice(error.message, "error"));
            }}
          />
        </div>
      </SettingsInset>
    </SettingsCard>
  );
}

function applySettings(text: string) {
  const body = JSON.parse(text) as { appearance?: Partial<Appearance>; shortcuts?: Record<string, string>; layout?: unknown };
  if (body.appearance) patchAppearance({ ...appearance(), ...body.appearance });
  if (body.shortcuts) {
    const next = { ...loadShortcuts() };
    for (const action of SHORTCUT_ACTIONS) {
      const value = body.shortcuts[action];
      if (typeof value === "string" && value) next[action] = value;
    }
    saveShortcuts(next);
  }
  if (body.layout) {
    saveLayout(normalize(body.layout));
    window.dispatchEvent(new CustomEvent("studio-layout", { detail: "reload" }));
  }
}

function PluginsSection() {
  const { t } = useTranslation();
  const [plugins, setPlugins] = useState<{ id: string; name: string; version: string; enabled: boolean; error: string }[]>([]);
  useEffect(() => {
    void api<{ plugins: typeof plugins }>("/api/plugins").then((body) => setPlugins(body.plugins)).catch(() => setPlugins([]));
  }, []);
  if (!plugins.length) return <p className="text-muted">{t("plugins.empty")}</p>;
  return (
    <SettingsForm>
      {plugins.map((plugin) => (
        <SettingRow key={plugin.id} label={`${plugin.name} ${plugin.version}`}>
          <TextButton
            label={plugin.enabled ? t("plugins.disable") : t("plugins.enable")}
            onClick={() => {
              void api<{ plugins: typeof plugins }>("/api/plugins/" + plugin.id + "/enabled", { method: "POST", body: JSON.stringify({ enabled: !plugin.enabled }) }).then((body) => setPlugins(body.plugins));
            }}
          />
        </SettingRow>
      ))}
    </SettingsForm>
  );
}

function EnterpriseSection() {
  const { t } = useTranslation();
  const [ee, setEe] = useState<{ ok?: boolean; reason?: string }>({});
  const [token, setToken] = useState("");
  const [licenseFile, setLicenseFile] = useState("");
  useEffect(() => {
    void api<typeof ee>("/api/ee/status").then(setEe).catch(() => setEe({}));
  }, []);
  return (
    <SettingsStack>
      <SettingsNote title={ee.reason || t("ee.locked")}>{ee.ok ? t("ee.title") : t("ee.locked")}</SettingsNote>
      <SettingsCard>
        <SettingsInset>
          <PathField testId="path-license" label={t("path.license")} value={licenseFile} filters={FILTERS.key} onChange={setLicenseFile} />
          <div className="mt-2">
            <TextButton
              label={t("path.importSettings")}
              disabled={!licenseFile.trim()}
              onClick={() => {
                void api<{ text: string }>("/api/local/read", { method: "POST", body: JSON.stringify({ path: licenseFile.trim(), grant: takeGrant(licenseFile.trim()) }) })
                  .then((body) => api("/api/license", { method: "POST", body: JSON.stringify({ token: body.text }) }))
                  .then((body) => setEe(body as typeof ee))
                  .catch((error: Error) => useStudio.getState().setNotice(error.message, "error"));
              }}
            />
          </div>
        </SettingsInset>
        <SettingsInset>
          <textarea value={token} onChange={(event) => setToken(event.target.value)} className="h-24 w-full rounded-md border border-line bg-panel p-2 text-[13px]" aria-label={t("settings.enterprise")} />
          <div className="mt-2">
            <TextButton
              label={t("actions.save")}
              tone="accent"
              onClick={() => {
                void api("/api/license", { method: "POST", body: JSON.stringify({ token }) })
                  .then((body) => setEe(body as typeof ee))
                  .catch((error: Error) => useStudio.getState().setNotice(error.message, "error"));
              }}
            />
          </div>
        </SettingsInset>
      </SettingsCard>
    </SettingsStack>
  );
}

function AboutLine() {
  const { t } = useTranslation();
  const [build, setBuild] = useState("dev");
  useEffect(() => {
    void api<{ build: string }>("/api/health").then((body) => setBuild(body.build || "dev")).catch(() => setBuild("dev"));
  }, []);
  return <p>{t("build.line", { id: build })}</p>;
}

export function ShortcutEditor({ active = true }: { active?: boolean }) {
  const { t } = useTranslation();
  const [map, setMap] = useState(loadShortcuts);
  const [listen, setListen] = useState<ShortcutAction | null>(null);
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (active) setMap(loadShortcuts());
  }, [active]);
  useEffect(() => {
    if (!active || !listen) return;
    const onKey = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.key === "Escape") {
        setListen(null);
        return;
      }
      const combo = comboFromEvent(event);
      const next = { ...map, [listen]: combo };
      setMap(next);
      saveShortcuts(next);
      setListen(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [active, listen, map]);
  const conflicts = useMemo(() => {
    const owners = new Map<string, ShortcutAction[]>();
    for (const action of SHORTCUT_ACTIONS) {
      const list = owners.get(map[action]) || [];
      list.push(action);
      owners.set(map[action], list);
    }
    return owners;
  }, [map]);
  const rows = SHORTCUT_ACTIONS.filter((action) => {
    const label = t(`shortcuts.${action}`, { defaultValue: action });
    return `${label} ${map[action]}`.toLowerCase().includes(query.trim().toLowerCase());
  });
  return (
    <div data-testid="shortcut-editor" className="flex w-full max-w-[44rem] flex-col gap-3">
      <div className="flex items-center gap-2 px-1">
        <TextInput className="h-8 flex-1" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("settings.search")} aria-label={t("settings.search")} />
        <TextButton
          label={t("shortcuts.reset")}
          icon={Keyboard}
          onClick={() => {
            setMap({ ...DEFAULT_SHORTCUTS });
            saveShortcuts({ ...DEFAULT_SHORTCUTS });
          }}
        />
      </div>
      <SettingsCard>
        {rows.map((action) => {
          const clash = (conflicts.get(map[action]) || []).length > 1;
          const label = t(`shortcuts.${action}`, { defaultValue: action });
          return (
            <SettingRow key={action} label={label} hint={clash ? t("settings.conflict") : undefined}>
              <button
                type="button"
                className={`h-7 min-w-[7.5rem] truncate rounded-md border bg-panel px-2 font-mono text-[12px] ${clash ? "border-danger text-danger" : listen === action ? "border-accent text-accent" : "border-line"}`}
                onClick={() => setListen(action)}
              >
                {listen === action ? t("settings.press") : map[action]}
              </button>
            </SettingRow>
          );
        })}
      </SettingsCard>
    </div>
  );
}
