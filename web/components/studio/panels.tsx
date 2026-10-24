"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { History, ScanSearch, Cpu } from "lucide-react";
import type { PanelId } from "@/lib/grid";
import { useStudio } from "@/lib/store";
import { cn } from "@/lib/utils";
import { TextButton } from "@/components/ui";
import { NavigatorCard } from "./navigator";
import { ObjectList, Properties } from "./inspector";
import { ExplorerPanel } from "./explorer";
import { ClassTable } from "./class-table";
import { classTitle, Filmstrip, ImageList } from "./lists";
import { RawPanel } from "./raw-panel";

export function PanelBody({ id }: { id: PanelId }) {
  if (id === "explorer") return <ExplorerPanel />;
  if (id === "images") return <ImageList />;
  if (id === "classes") return <ClassTable />;
  if (id === "filmstrip") return <Filmstrip />;
  if (id === "layers") return <ObjectList />;
  if (id === "properties") return <Properties mode="geometry" />;
  if (id === "attributes") return <Properties mode="attributes" />;
  if (id === "history") return <HistoryPanel />;
  if (id === "stats") return <StatsPanel />;
  if (id === "model") return <ModelPanel />;
  if (id === "minimap") return <div data-testid="minimap" className="h-full min-h-0 w-full min-w-0 overflow-hidden"><NavigatorCard /></div>;
  if (id === "raw") return <RawPanel />;
  return <ConsolePanel />;
}

const HISTORY = new Set(["draw", "delete", "paste", "edit", "move", "class", "review", "resize", "order", "merge"]);

function HistoryPanel() {
  const { t } = useTranslation();
  const past = useStudio((state) => state.editor.past);
  const future = useStudio((state) => state.editor.future);
  const jump = useStudio((state) => state.jumpHistory);
  const labelOf = (raw: string) => (HISTORY.has(raw) ? t(`history.${raw}`) : raw);
  return (
    <div className="flex h-full min-h-0 flex-col p-2">
      <div className="mb-1 flex items-center gap-1 text-xs text-muted">
        <History className="h-3.5 w-3.5" />
        <span>{t("panel.history")}</span>
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-auto">
        {past.length === 0 && future.length === 0 ? <p className="text-xs text-muted">{t("panel.empty")}</p> : null}
        {past.map((row, index) => (
          <button key={`${row.label}-${index}`} type="button" className="flex h-8 w-full items-center truncate rounded px-2 text-start hover:bg-panel-2" onClick={() => jump(index)}>
            {labelOf(row.label)}
          </button>
        ))}
      </div>
    </div>
  );
}

function StatsPanel() {
  const { t, i18n } = useTranslation();
  const images = useStudio((state) => state.images);
  const classes = useStudio((state) => state.classes);
  const active = useStudio((state) => state.ui.activeClass);
  const setActiveClass = useStudio((state) => state.setActiveClass);
  const labeled = useMemo(() => images.filter((row) => row.status === "labeled").length, [images]);
  const max = useMemo(() => Math.max(1, ...classes.map((item) => item.count || 0)), [classes]);
  const total = images.length;
  const labeledPct = total ? Math.round((labeled / total) * 100) : 0;
  const locale = i18n.language;

  return (
    <div data-testid="stats-panel" className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-line px-3 py-2">
        <div className="flex items-center gap-2">
          <ScanSearch className="h-4 w-4 text-muted" />
          <h2 className="text-[13px] font-medium">{t("panel.stats")}</h2>
        </div>
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          <div className="rounded-md border border-line bg-panel-2 px-2 py-1.5">
            <p className="truncate text-[10px] font-medium uppercase tracking-wide text-muted">{t("panel.images")}</p>
            <p className="mt-1 text-[15px] font-semibold tabular-nums leading-none">{total.toLocaleString(locale)}</p>
          </div>
          <div className="rounded-md border border-line bg-panel-2 px-2 py-1.5">
            <p className="truncate text-[10px] font-medium uppercase tracking-wide text-muted">{t("filters.labeled")}</p>
            <p className="mt-1 text-[15px] font-semibold tabular-nums leading-none">{labeled.toLocaleString(locale)}</p>
            <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-panel">
              <div className="h-full rounded-full bg-ok" style={{ width: `${labeledPct}%` }} />
            </div>
          </div>
          <div className="rounded-md border border-line bg-panel-2 px-2 py-1.5">
            <p className="truncate text-[10px] font-medium uppercase tracking-wide text-muted">{t("panel.classes")}</p>
            <p className="mt-1 text-[15px] font-semibold tabular-nums leading-none">{classes.length.toLocaleString(locale)}</p>
          </div>
        </div>
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-auto px-2 py-2">
        <p className="mb-1.5 px-1 text-[11px] font-medium uppercase tracking-wide text-muted">{t("qc.distribution")}</p>
        <div className="grid gap-0.5">
          {classes.map((row) => {
            const count = row.count || 0;
            const pct = (count / max) * 100;
            const title = classTitle(row, locale);
            const selected = row.id === active;
            return (
              <button
                key={row.id}
                type="button"
                title={title}
                onClick={() => setActiveClass(selected ? "" : row.id)}
                className={cn(
                  "flex h-8 w-full min-w-0 items-center gap-2 rounded-md px-1.5 text-start",
                  selected ? "bg-panel-2" : "hover:bg-panel-2",
                  !count && "opacity-60",
                )}
              >
                <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: row.color }} />
                <span className="w-[7.5rem] shrink-0 truncate text-xs">{title}</span>
                <div className="min-w-0 flex-1">
                  <div className="h-1.5 overflow-hidden rounded-full bg-line">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: row.color }} />
                  </div>
                </div>
                <span className="w-8 shrink-0 text-end text-[11px] tabular-nums text-muted">{count}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className="shrink-0 border-t border-line p-2">
        <TextButton label={t("tools.qc")} icon={ScanSearch} onClick={() => useStudio.getState().patchUi({ dialog: "qc" })} />
      </div>
    </div>
  );
}

function ModelPanel() {
  const { t } = useTranslation();
  const task = useStudio((state) => state.project?.task);
  return (
    <div className="grid gap-2 p-2 text-sm">
      <p className="flex items-center gap-2"><Cpu className="h-4 w-4" />{t("panel.model")}</p>
      <p className="truncate text-muted">{task ? t(`task.${task}`) : t("status.none")}</p>
      <TextButton label={t("ai.status")} onClick={() => useStudio.getState().patchUi({ dialog: "jobs" })} />
      <TextButton label={t("ai.sam")} icon={Cpu} onClick={() => useStudio.getState().setTool("sam")} />
    </div>
  );
}

function ConsolePanel() {
  const { t } = useTranslation();
  const notice = useStudio((state) => state.notice);
  const [lines, setLines] = useState<string[]>([]);
  useEffect(() => {
    if (!notice) return;
    setLines((prev) => [notice, ...prev.filter((line) => line !== notice)].slice(0, 40));
  }, [notice]);
  return (
    <div className="flex h-full min-h-0 flex-col p-2 font-mono text-xs">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-muted">{t("panel.console")}</span>
        <button type="button" className="text-muted hover:text-ink" onClick={() => setLines([])}>{t("console.clear")}</button>
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-auto">
        {lines.length === 0 ? <p className="text-muted">{t("panel.empty")}</p> : null}
        {lines.map((line, index) => (
          <p key={`${line}-${index}`} className="truncate" title={line}>{line}</p>
        ))}
      </div>
    </div>
  );
}
