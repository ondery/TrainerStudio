"use client";

import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import * as Menubar from "@radix-ui/react-menubar";
import {
  Activity,
  Box,
  Braces,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  ClipboardPaste,
  Command,
  Copy,
  Cpu,
  Crosshair,
  Database,
  Download,
  Eye,
  EyeOff,
  FileCode,
  FileJson,
  FilePlus,
  FolderOpen,
  FolderX,
  Grid3x3,
  Hand,
  History,
  Keyboard,
  LayoutDashboard,
  Link2,
  Lock,
  Monitor,
  Package,
  Maximize2,
  Moon,
  MousePointer2,
  PanelLeft,
  PenLine,
  Pentagon,
  PersonStanding,
  Plus,
  Redo2,
  RotateCcw,
  Save,
  ScanSearch,
  Scissors,
  Settings,
  Sparkles,
  Square,
  SquareDashed,
  Sun,
  Tags,
  Trash2,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { appearance } from "@/lib/appearance";
import { recentPaths } from "@/lib/browse";
import { runCommand } from "@/lib/commands";
import { PANELS, loadLayout, placed, type PanelId } from "@/lib/grid";
import { useStudio } from "@/lib/store";
import { cn } from "@/lib/utils";

type Icon = ComponentType<{ className?: string }>;

const itemClass = "flex h-7 w-full items-center gap-2 whitespace-nowrap rounded-sm px-3 text-[13px] leading-none outline-none data-[highlighted]:bg-panel-2";
const contentClass = "z-[90] max-h-[70vh] min-w-60 overflow-auto rounded-md border border-line bg-panel p-1 text-[13px] leading-none text-ink shadow-pop";

export function MenuBar() {
  const { t, i18n } = useTranslation();
  const project = useStudio((state) => state.project);
  const [recent, setRecent] = useState<string[]>([]);
  const [open, setOpen] = useState("");
  const [visible, setVisible] = useState<Set<PanelId>>(() => new Set());
  const rtl = i18n.dir() === "rtl";
  const Prev = rtl ? ChevronRight : ChevronLeft;
  const Next = rtl ? ChevronLeft : ChevronRight;
  const look = appearance();

  useEffect(() => {
    const sync = () => setVisible(new Set(placed(loadLayout())));
    sync();
    window.addEventListener("studio-layout-changed", sync);
    return () => window.removeEventListener("studio-layout-changed", sync);
  }, [open]);

  useEffect(() => {
    const sync = () => setRecent(recentPaths());
    sync();
    window.addEventListener("studio-recent", sync);
    return () => window.removeEventListener("studio-recent", sync);
  }, [open]);

  const go = (id: string) => {
    runCommand(id);
    setOpen("");
  };

  return (
    <Menubar.Root
      dir={rtl ? "rtl" : "ltr"}
      value={open}
      onValueChange={setOpen}
      className="z-40 flex h-9 min-w-0 shrink-0 items-center gap-1 overflow-x-auto bg-panel px-2 text-[13px] leading-none"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.svg" alt="" className="mx-1 h-5 w-5 shrink-0" />
      <Menu id="file" label={t("menu.file")}>
        <Item icon={FilePlus} label={t("file.new")} kbd="Ctrl+N" onSelect={() => go("file.new")} />
        <Item icon={FolderOpen} label={t("m.wizard")} onSelect={() => go("file.wizard")} />
        <Item icon={FolderOpen} label={t("file.open")} kbd="Ctrl+O" onSelect={() => go("file.open")} />
        <Sub icon={History} label={t("file.recent")}>
          {recent.length ? recent.map((path, index) => (
            <Item key={path} icon={FolderOpen} label={path} kbd={String(index + 1)} onSelect={() => { void useStudio.getState().openPath(path); setOpen(""); }} />
          )) : <Item icon={FolderOpen} label={t("welcome.empty")} kbd="—" onSelect={() => undefined} />}
        </Sub>
        <Sub icon={Download} label={t("m.import")}>
          <Item icon={FolderOpen} label={t("m.yolo")} kbd="Ctrl+O" onSelect={() => go("import.yolo")} />
          <Item icon={FileJson} label={t("m.legacy")} kbd="JSON" onSelect={() => go("import.legacy")} />
          <Item icon={Braces} label={t("m.coco")} kbd="COCO" onSelect={() => go("import.coco")} />
          <Item icon={FileCode} label={t("m.voc")} kbd="VOC" onSelect={() => go("import.voc")} />
        </Sub>
        <Item icon={FolderX} label={t("file.close")} kbd="Ctrl+W" onSelect={() => go("file.close")} />
        <Sep />
        <Item icon={Save} label={t("m.save")} kbd="Ctrl+S" onSelect={() => go("file.save")} />
        <Item icon={Save} label={t("m.saveAll")} kbd="Ctrl+Shift+S" onSelect={() => go("file.saveAll")} />
        <Item icon={RotateCcw} label={t("m.revert")} kbd="F5" onSelect={() => go("file.revert")} />
        <Sep />
        <Sub icon={Download} label={t("file.export")}>
          <Item icon={Box} label={t("export.yolo")} kbd="Ctrl+E" onSelect={() => go("export.yolo")} />
          <Item icon={Braces} label={t("export.coco")} kbd="COCO" onSelect={() => go("export.coco")} />
          <Item icon={FileCode} label={t("export.voc")} kbd="VOC" onSelect={() => go("export.voc")} />
          <Item icon={Scissors} label={t("m.grouped")} kbd="Split" onSelect={() => go("export.grouped")} />
        </Sub>
        <Item icon={Scissors} label={t("file.split")} kbd="Ctrl+Shift+E" onSelect={() => go("file.split")} />
        <Item icon={Camera} label={t("file.snapshot")} kbd="Ctrl+Shift+P" onSelect={() => go("file.snapshot")} />
        <Sep />
        <Item testId="menu-settings" icon={Settings} label={t("file.settings")} kbd="Ctrl+," onSelect={() => go("file.settings")} />
      </Menu>
      <Menu id="edit" label={t("menu.edit")}>
        <Item icon={Undo2} label={t("edit.undo")} kbd="Ctrl+Z" onSelect={() => go("edit.undo")} />
        <Item icon={Redo2} label={t("edit.redo")} kbd="Ctrl+Shift+Z" onSelect={() => go("edit.redo")} />
        <Sep />
        <Item icon={Scissors} label={t("m.cut")} kbd="Ctrl+X" onSelect={() => go("edit.cut")} />
        <Item icon={Copy} label={t("edit.copy")} kbd="Ctrl+C" onSelect={() => go("edit.copy")} />
        <Item icon={ClipboardPaste} label={t("edit.paste")} kbd="Ctrl+V" onSelect={() => go("edit.paste")} />
        <Item icon={Copy} label={t("m.duplicate")} kbd="Ctrl+D" onSelect={() => go("edit.duplicate")} />
        <Item icon={Trash2} label={t("edit.delete")} kbd="Del" onSelect={() => go("edit.delete")} />
        <Sep />
        <Item icon={Check} label={t("m.selectAll")} kbd="Ctrl+A" onSelect={() => go("edit.all")} />
        <Item icon={Check} label={t("m.invert")} kbd="Ctrl+I" onSelect={() => go("edit.invert")} />
        <Item icon={Tags} label={t("m.selectClass")} kbd="Ctrl+Shift+A" onSelect={() => go("edit.class")} />
        <Item icon={ClipboardPaste} label={t("m.copyPrev")} kbd="C" onSelect={() => go("edit.prev")} />
        <Sep />
        <Item icon={Command} label={t("edit.palette")} kbd="Ctrl+K" onSelect={() => go("edit.palette")} />
      </Menu>
      <Menu id="view" label={t("menu.view")}>
        <Item icon={Maximize2} label={t("view.fit")} kbd="F" onSelect={() => go("view.fit")} />
        <Item icon={ZoomIn} label={t("view.zoomIn")} kbd="Ctrl++" onSelect={() => go("view.in")} />
        <Item icon={ZoomOut} label={t("view.zoomOut")} kbd="Ctrl+-" onSelect={() => go("view.out")} />
        <Item icon={Maximize2} label={t("m.zoom100")} kbd="Ctrl+0" onSelect={() => go("view.100")} />
        <Sep />
        <Item icon={Eye} label={t("m.labels")} kbd="L" checked={look.showLabels} onSelect={() => go("view.labels")} />
        <Item icon={Tags} label={t("m.classNames")} kbd="N" checked={look.showClassNames} onSelect={() => go("view.names")} />
        <Item icon={Square} label={t("m.fill")} kbd="Shift+F" checked={look.fillOpacity > 0} onSelect={() => go("view.fill")} />
        <Item icon={Crosshair} label={t("set.guideLines")} kbd="Ctrl+;" checked={look.guideLines} onSelect={() => { window.dispatchEvent(new CustomEvent("studio-cross", { detail: "guides" })); setOpen(""); }} />
        <Item icon={MousePointer2} label={t("set.crossCursor")} kbd="Ctrl+Shift+;" checked={look.crosshairCursor} onSelect={() => { window.dispatchEvent(new CustomEvent("studio-cross", { detail: "cursor" })); setOpen(""); }} />
        <Item icon={Grid3x3} label={t("view.grid")} kbd="G" checked={look.showGrid} onSelect={() => go("view.grid")} />
        <Item icon={ScanSearch} label={t("panel.minimap")} kbd="M" checked={visible.has("minimap")} onSelect={() => go("view.minimap")} />
        <Sub icon={PanelLeft} label={t("view.panels")}>
          {PANELS.map((id) => (
            <Item key={id} icon={PanelLeft} label={t(`panel.${id}`)} kbd={visible.has(id) ? "✓" : " "} checked={visible.has(id)} onSelect={() => go(`panel.${id}`)} />
          ))}
        </Sub>
        <Sep />
        <Item icon={Moon} label={t("view.dark")} kbd="Alt+D" onSelect={() => go("view.dark")} />
        <Item icon={Sun} label={t("view.light")} kbd="Alt+L" onSelect={() => go("view.light")} />
        <Item icon={Monitor} label={t("theme.system")} checked={look.theme === "system"} onSelect={() => go("view.system")} />
        <Item icon={LayoutDashboard} label={t("chrome.ribbon")} checked={look.chrome === "ribbon"} onSelect={() => go("view.ribbon")} />
        <Item icon={LayoutDashboard} label={t("view.compact")} kbd="Alt+K" onSelect={() => go("view.compact")} />
      </Menu>
      <Menu id="image" label={t("menu.image")}>
        <Item icon={Prev} label={t("image.prev")} kbd="←" onSelect={() => go("image.prev")} />
        <Item icon={Next} label={t("image.next")} kbd="→" onSelect={() => go("image.next")} />
        <Item icon={Prev} label={t("m.first")} kbd="Home" onSelect={() => go("image.first")} />
        <Item icon={Next} label={t("m.last")} kbd="End" onSelect={() => go("image.last")} />
        <Item icon={ScanSearch} label={t("m.goto")} kbd="Ctrl+G" onSelect={() => go("image.goto")} />
        <Sep />
        <Item icon={Check} label={t("m.reviewed")} kbd="R" onSelect={() => go("image.reviewed")} />
        <Item icon={Tags} label={t("m.flag")} kbd="Shift+R" onSelect={() => go("image.flag")} />
        <Item icon={Next} label={t("m.skip")} kbd="S" onSelect={() => go("image.skip")} />
        <Item icon={RotateCcw} label={t("m.rotate")} kbd="Ctrl+R" onSelect={() => go("image.rotate")} />
        <Item icon={Maximize2} label={t("image.fit")} kbd="F" onSelect={() => go("image.fit")} />
        <Item icon={ZoomIn} label={t("m.zoom100")} kbd="Ctrl+0" onSelect={() => go("image.100")} />
      </Menu>
      <Menu id="annotation" label={t("menu.annotation")}>
        <Item icon={MousePointer2} label={t("ann.select")} kbd="V" onSelect={() => go("tool.select")} />
        <Item icon={Square} label={t("ann.box")} kbd="B" onSelect={() => go("tool.bbox")} />
        <Item icon={Pentagon} label={t("ann.polygon")} kbd="G" onSelect={() => go("tool.polygon")} />
        <Item icon={SquareDashed} label={t("ann.obb")} kbd="O" onSelect={() => go("tool.obb")} />
        <Item icon={PersonStanding} label={t("ann.pose")} kbd="P" onSelect={() => go("tool.pose")} />
        <Item icon={Sparkles} label={t("ann.sam")} kbd="M" onSelect={() => go("tool.sam")} />
        <Item icon={Hand} label={t("ann.pan")} kbd="H" onSelect={() => go("tool.pan")} />
        <Sep />
        <Item icon={Square} label={t("m.toBox")} kbd="Shift+B" onSelect={() => go("ann.box")} />
        <Item icon={Pentagon} label={t("m.toPoly")} kbd="Shift+G" onSelect={() => go("ann.poly")} />
        <Item icon={SquareDashed} label={t("m.toObb")} kbd="Shift+O" onSelect={() => go("ann.obb")} />
        <Item icon={Box} label={t("m.merge")} kbd="Ctrl+M" onSelect={() => go("ann.merge")} />
        <Item icon={Scissors} label={t("m.splitBox")} kbd="Ctrl+Shift+B" onSelect={() => go("ann.split")} />
        <Item icon={Lock} label={t("m.lock")} kbd="Ctrl+L" onSelect={() => go("ann.lock")} />
        <Item icon={EyeOff} label={t("m.hide")} kbd="Ctrl+H" onSelect={() => go("ann.hide")} />
        <Item icon={ChevronRight} label={t("m.front")} kbd="]" onSelect={() => go("ann.front")} />
        <Item icon={ChevronLeft} label={t("m.back")} kbd="[" onSelect={() => go("ann.back")} />
        <Item icon={Tags} label={t("m.changeClass")} kbd="Shift+T" onSelect={() => go("ann.class")} />
        <Sep />
        <Item icon={Tags} label={t("ann.schema")} kbd="Ctrl+Shift+T" onSelect={() => go("ann.schema")} />
      </Menu>
      <Menu id="classes" label={t("menu.classes")}>
        <Item icon={Tags} label={t("classes.panel")} kbd="Alt+1" onSelect={() => go("panel.classes")} />
        <Item icon={Plus} label={t("classes.add")} kbd="Alt+N" onSelect={() => go("classes.add")} />
        <Item icon={EyeOff} label={t("m.hideClass")} kbd="Alt+H" onSelect={() => go("classes.hide")} />
        <Item icon={Lock} label={t("m.lockClass")} kbd="Alt+L" onSelect={() => go("classes.lock")} />
        <Item icon={FileJson} label={t("ann.schema")} kbd="Alt+S" onSelect={() => go("classes.schema")} />
      </Menu>
      <Menu id="tools" label={t("menu.tools")}>
        <Item icon={Keyboard} label={t("tools.shortcuts")} kbd="Ctrl+/" onSelect={() => go("tools.shortcuts")} />
        <Item icon={ScanSearch} label={t("tools.qc")} kbd="Ctrl+Q" onSelect={() => go("tools.qc")} />
        <Item icon={History} label={t("tools.history")} kbd="Ctrl+H" onSelect={() => go("tools.history")} />
        <Item icon={Command} label={t("edit.palette")} kbd="Ctrl+K" onSelect={() => go("tools.palette")} />
      </Menu>
      <Menu id="ai" label={t("menu.ai")}>
        <Item icon={Activity} label={t("ai.status")} kbd="Ctrl+J" onSelect={() => go("ai.jobs")} />
        <Item icon={Download} label={t("ai.install")} kbd="Ctrl+Shift+J" onSelect={() => go("ai.install")} />
        <Item icon={Sparkles} label={t("ai.sam")} kbd="M" onSelect={() => go("tool.sam")} />
        <Item icon={Cpu} label={t("panel.model")} kbd="Alt+M" onSelect={() => go("panel.model")} />
      </Menu>
      <Menu id="dataset" label={t("menu.dataset")}>
        <Item icon={Scissors} label={t("dataset.split")} kbd="Ctrl+Shift+E" onSelect={() => go("dataset.split")} />
        <Item icon={Camera} label={t("dataset.snapshot")} kbd="Ctrl+Shift+P" onSelect={() => go("dataset.snapshot")} />
        <Item icon={FileJson} label={t("dataset.legacy")} kbd="JSON" onSelect={() => go("import.legacy")} />
        <Item icon={ScanSearch} label={t("tools.qc")} kbd="Ctrl+Q" onSelect={() => go("dataset.qc")} />
        <Item icon={Database} label={t("panel.stats")} kbd="Alt+Q" onSelect={() => go("panel.stats")} />
      </Menu>
      <Menu id="window" label={t("menu.window")}>
        <Item icon={LayoutDashboard} label={t("window.default")} kbd="Alt+0" onSelect={() => go("layout.default")} />
        <Item icon={PenLine} label={t("window.labeling")} kbd="Alt+1" onSelect={() => go("layout.labeling")} />
        <Item icon={ScanSearch} label={t("window.review")} kbd="Alt+2" onSelect={() => go("layout.review")} />
        <Item icon={Cpu} label={t("window.training")} kbd="Alt+3" onSelect={() => go("layout.training")} />
        <Sep />
        <Item icon={Save} label={t("window.save")} kbd="Alt+S" onSelect={() => go("window.save")} />
        <Item icon={RotateCcw} label={t("window.reset")} kbd="Alt+R" onSelect={() => go("layout.default")} />
        <Item testId="menu-nav-reset" icon={RotateCcw} label={t("nav.reset")} onSelect={() => window.dispatchEvent(new CustomEvent("studio-navigator-reset"))} />
        <Item testId="menu-layout-reset" icon={LayoutDashboard} label={t("window.resetLayout")} onSelect={() => window.dispatchEvent(new CustomEvent("studio-layout-reset"))} />
        <Sub icon={PanelLeft} label={t("view.panels")}>
          {PANELS.map((id) => (
            <Item key={id} icon={PanelLeft} label={t(`panel.${id}`)} kbd={visible.has(id) ? "✓" : " "} checked={visible.has(id)} onSelect={() => go(`panel.${id}`)} />
          ))}
        </Sub>
      </Menu>
      <Menu id="enterprise" label={t("ee.menu")}>
        <Item icon={Camera} label={t("ee.video")} onSelect={() => go("ee.video")} />
        <Item icon={Camera} label={t("ee.camera")} onSelect={() => go("ee.camera")} />
        <Item icon={Download} label={t("ee.remote")} onSelect={() => go("ee.remote")} />
        <Item icon={Package} label={t("ee.market")} onSelect={() => go("ee.market")} />
        <Item icon={PanelLeft} label={t("ee.popout")} onSelect={() => go("ee.popout")} />
        <Item icon={FolderOpen} label={t("ee.folders")} onSelect={() => go("ee.folders")} />
        <Item icon={Link2} label={t("ee.link")} onSelect={() => go("ee.link")} />
        <Item icon={Scissors} label={t("ee.cutpaste")} onSelect={() => go("ee.cut")} />
        <Item icon={ClipboardPaste} label={t("edit.paste")} onSelect={() => go("ee.paste")} />
        <Item icon={Lock} label={t("ee.rbac")} onSelect={() => go("ee.rbac")} />
        <Item icon={Lock} label={t("ee.sso")} onSelect={() => go("ee.sso")} />
        <Item icon={History} label={t("ee.audit")} onSelect={() => go("ee.audit")} />
        <Item icon={Check} label={t("ee.review")} onSelect={() => go("ee.review")} />
        <Item icon={Database} label={t("ee.storage")} onSelect={() => go("ee.storage")} />
        <Item icon={Database} label={t("ee.queue")} onSelect={() => go("ee.queue")} />
        <Item icon={Sparkles} label={t("ee.learn")} onSelect={() => go("ee.learn")} />
        <Item icon={Activity} label={t("ee.analytics")} onSelect={() => go("ee.analytics")} />
        <Item icon={CircleHelp} label={t("ee.priority")} onSelect={() => go("ee.support")} />
      </Menu>
      <Menu id="help" label={t("menu.help")}>
        <Item icon={Keyboard} label={t("help.shortcuts")} kbd="Ctrl+/" onSelect={() => go("help.shortcuts")} />
        <Item icon={Settings} label={t("file.settings")} kbd="Ctrl+," onSelect={() => go("file.settings")} />
        <Item icon={CircleHelp} label={t("help.about")} kbd="F1" onSelect={() => go("help.about")} />
      </Menu>
      <span className="min-w-0 flex-1 truncate px-3 text-[12px] leading-none text-muted" title={project?.name || t("app.name")}>{project ? project.name : t("app.name")}</span>
    </Menubar.Root>
  );
}

function Menu({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <Menubar.Menu value={id}>
      <Menubar.Trigger
        data-testid={`menu-${id}`}
        className="inline-flex h-7 items-center whitespace-nowrap rounded px-3 text-[13px] font-normal leading-none outline-none hover:bg-panel-2 data-[state=open]:bg-panel-2"
      >
        {label}
      </Menubar.Trigger>
      <Menubar.Portal>
        <Menubar.Content align="start" sideOffset={6} collisionPadding={8} className={contentClass} data-testid={`menu-panel-${id}`}>
          {children}
        </Menubar.Content>
      </Menubar.Portal>
    </Menubar.Menu>
  );
}

function Item({ icon: Icon, label, kbd = "", checked, onSelect, testId }: { icon: Icon; label: string; kbd?: string; checked?: boolean; onSelect: () => void; testId?: string }) {
  return (
    <Menubar.Item data-testid={testId} title={label} className={itemClass} onSelect={onSelect}>
      <Icon className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1 whitespace-nowrap">{label}</span>
      {checked ? <Check className="h-3.5 w-3.5 shrink-0 text-accent" /> : null}
      {kbd ? <span className="ms-6 shrink-0 text-end text-[11px] tabular-nums tracking-wide text-muted">{kbd}</span> : null}
    </Menubar.Item>
  );
}

function Sub({ icon: Icon, label, children }: { icon: Icon; label: string; children: ReactNode }) {
  return (
    <Menubar.Sub>
      <Menubar.SubTrigger className={cn(itemClass, "data-[state=open]:bg-panel-2")}>
        <Icon className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <ChevronRight className="ms-6 h-3.5 w-3.5 shrink-0 rtl:rotate-180" />
      </Menubar.SubTrigger>
      <Menubar.Portal>
        <Menubar.SubContent className={contentClass} sideOffset={4} alignOffset={-4}>
          {children}
        </Menubar.SubContent>
      </Menubar.Portal>
    </Menubar.Sub>
  );
}

function Sep() {
  return <Menubar.Separator className="my-1 h-px bg-line" />;
}
