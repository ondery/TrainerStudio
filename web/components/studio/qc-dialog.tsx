"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Check, CircleAlert, ClipboardCheck, Flag, Info, Loader2, ScanSearch, Search, X } from "lucide-react";
import { api } from "@/lib/api";
import { useStudio } from "@/lib/store";
import { displayTitle } from "@/lib/titles";
import { cn } from "@/lib/utils";
import { Modal, TextButton, TextInput } from "@/components/ui";

type QcIssue = { imageId: string; image: string; annotationId?: string; severity: string; message: string; code?: string; params?: Record<string, string | number> };
type QcReport = {
  issues: QcIssue[];
  counts?: { error?: number; warning?: number; info?: number };
  distribution: { key: string; count: number; images: number; tiny: number; outside: number }[];
  consistency: { code: string; count: number; message: string }[];
  queue: { imageId: string; image: string; annotationId: string; classId: string; score?: number }[];
  missingLabels?: number;
};

type Tab = "issues" | "distribution" | "consistency" | "queue";
type Severity = "all" | "error" | "warning" | "info";

const TABS: { id: Tab; key: string }[] = [
  { id: "issues", key: "qc.issues" },
  { id: "distribution", key: "qc.distribution" },
  { id: "consistency", key: "qc.consistency" },
  { id: "queue", key: "qc.queue" },
];

const ROW = 32;

export function QcDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const project = useStudio((state) => state.project);
  const classes = useStudio((state) => state.classes);
  const openImage = useStudio((state) => state.openImage);
  const [report, setReport] = useState<QcReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<Tab>("issues");
  const [severity, setSeverity] = useState<Severity>("all");
  const [code, setCode] = useState("");
  const [query, setQuery] = useState("");
  const parentRef = useRef<HTMLDivElement>(null);
  const projectId = project?.id;

  const issueLine = useCallback((issue: QcIssue) => (
    issue.code && issue.code !== "geometry" ? t(`qc.${issue.code}`, { ...(issue.params || {}), defaultValue: issue.message }) : issue.message
  ), [t]);

  const scan = useCallback(() => {
    if (!projectId) return;
    setBusy(true);
    setError("");
    void api<QcReport>(`/api/projects/${projectId}/qc`)
      .then(setReport)
      .catch((caught: Error) => {
        setError(caught.message);
        useStudio.getState().setNotice(caught.message, "error");
      })
      .finally(() => setBusy(false));
  }, [projectId]);

  useEffect(() => {
    if (!open) return;
    setTab("issues");
    setSeverity("all");
    setCode("");
    setQuery("");
    setError("");
    if (projectId) scan();
  }, [open, projectId, scan]);

  const issues = useMemo(() => {
    const rows = report?.issues || [];
    const needle = query.trim().toLowerCase();
    const rank = (value: string) => (value === "error" ? 0 : value === "warning" ? 1 : 2);
    return rows
      .filter((row) => {
        if (severity !== "all" && row.severity !== severity) return false;
        if (code && row.code !== code) return false;
        if (!needle) return true;
        const text = row.code && row.code !== "geometry" ? t(`qc.${row.code}`, { ...(row.params || {}), defaultValue: row.message }) : row.message;
        return `${row.image} ${text} ${row.severity} ${row.code || ""}`.toLowerCase().includes(needle);
      })
      .sort((a, b) => rank(a.severity) - rank(b.severity) || a.image.localeCompare(b.image));
  }, [code, query, report, severity, t]);

  const virtualizer = useVirtualizer({
    count: open && tab === "issues" && report ? issues.length : 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW,
    overscan: 16,
  });

  if (!project || !projectId) return null;
  const activeProjectId = projectId;

  const counts = report?.counts || { error: 0, warning: 0, info: 0 };
  const errors = counts.error || 0;
  const warnings = counts.warning || 0;
  const infos = counts.info || 0;
  const queue = report?.queue || [];
  const maxCount = Math.max(1, ...(report?.distribution || []).map((row) => row.count));
  const classById = new Map(classes.map((row) => [row.id, row]));

  function settle(accept: string[], reject: string[]) {
    void api(`/api/projects/${activeProjectId}/review/settle`, { method: "POST", body: JSON.stringify({ accept, reject }) })
      .then(() => useStudio.getState().refresh(activeProjectId))
      .then(() => scan())
      .catch((caught: Error) => useStudio.getState().setNotice(caught.message, "error"));
  }

  function markReview(imageId: string) {
    void api(`/api/projects/${activeProjectId}/qc/review`, { method: "POST", body: JSON.stringify({ imageIds: [imageId] }) })
      .then(() => useStudio.getState().refresh(activeProjectId))
      .catch((caught: Error) => useStudio.getState().setNotice(caught.message, "error"));
  }

  function openRow(imageId: string) {
    void openImage(imageId);
  }

  function toggleSeverity(next: Severity) {
    setTab("issues");
    setCode("");
    setSeverity((prev) => (prev === next ? "all" : next));
  }

  return (
    <Modal wide flush open={open} title={t("qc.title")} onClose={onClose}>
      <div data-testid="qc-dialog" className="flex h-[min(40rem,calc(84vh-2.75rem))] min-h-0 flex-col text-[13px]">
        <div className="flex h-9 shrink-0 items-center gap-2 border-b border-line px-3">
          <TextButton
            label={report ? t("qc.scanAgain") : t("qc.run")}
            icon={busy ? Spin : ScanSearch}
            tone="accent"
            disabled={busy}
            onClick={scan}
          />
          {busy ? <span className="truncate text-[12px] text-muted">{t("qc.loading")}</span> : null}
          {error ? <span className="min-w-0 truncate text-[12px] text-danger" title={error}>{error || t("qc.failed")}</span> : null}
        </div>
        <div role="tablist" aria-label={t("qc.title")} className="flex h-8 shrink-0 items-end gap-1 border-b border-line px-3">
          {TABS.map((item) => {
            const count = item.id === "issues" ? (report?.issues.length || 0) : item.id === "queue" ? queue.length : item.id === "consistency" ? (report?.consistency.length || 0) : (report?.distribution.length || 0);
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(item.id)}
                className={cn(
                  "relative inline-flex h-8 items-center gap-1.5 px-2 text-[12px] transition-colors duration-[140ms]",
                  active ? "text-ink" : "text-muted hover:text-ink",
                )}
              >
                <span className="truncate">{t(item.key)}</span>
                {report ? <span className="tabular-nums text-[11px] text-muted">{count.toLocaleString()}</span> : null}
                <span className={cn("absolute inset-x-1 -bottom-px h-0.5 rounded-full", active ? "bg-accent" : "bg-transparent")} />
              </button>
            );
          })}
        </div>
        {tab === "issues" ? (
          <div className="flex h-8 shrink-0 items-center gap-1 border-b border-line px-3">
            <Kpi tone="danger" label={t("qc.errors")} value={errors} active={severity === "error"} onClick={() => toggleSeverity("error")} />
            <Kpi tone="warn" label={t("qc.warnings")} value={warnings} active={severity === "warning"} onClick={() => toggleSeverity("warning")} />
            <Kpi tone="info" label={t("qc.info")} value={infos} active={severity === "info"} onClick={() => toggleSeverity("info")} />
            {code ? (
              <button type="button" onClick={() => setCode("")} className="inline-flex h-7 items-center gap-1 rounded-md bg-panel-2 px-2 text-[12px] text-ink hover:bg-line">
                <span className="max-w-40 truncate">{t(`qc.${code}`, { defaultValue: code })}</span>
                <X className="h-3.5 w-3.5 text-muted" />
              </button>
            ) : null}
            <div className="ms-auto w-52">
              <label className="relative block">
                <Search className="pointer-events-none absolute start-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
                <TextInput
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t("qc.filterIssues")}
                  aria-label={t("qc.filterIssues")}
                  className="h-7 bg-panel ps-7 text-[12px]"
                />
              </label>
            </div>
          </div>
        ) : null}
        <div ref={parentRef} className="scroll-thin min-h-0 flex-1 overflow-auto">
          {!report && !busy && !error ? (
            <Empty icon={ScanSearch} title={t("qc.run")} hint={t("qc.idle")} action={<TextButton label={t("qc.run")} icon={ScanSearch} tone="accent" onClick={scan} />} />
          ) : null}
          {busy && !report ? (
            <div className="grid gap-1 p-3">
              {Array.from({ length: 8 }).map((_, index) => (
                <div key={index} className="h-8 animate-pulse rounded-md bg-panel-2" />
              ))}
            </div>
          ) : null}
          {error && !report ? <Empty icon={CircleAlert} title={t("qc.failed")} hint={error} action={<TextButton label={t("qc.scanAgain")} icon={ScanSearch} onClick={scan} />} /> : null}
          {report && tab === "issues" ? (
            issues.length === 0 ? (
              <Empty icon={Check} title={t("qc.empty")} hint="" />
            ) : (
              <div>
                <Header>
                  <span className="w-3.5 shrink-0" />
                  <span className="min-w-0 flex-1">{t("qc.file")}</span>
                  <span className="w-44 shrink-0">{t("qc.issueCol")}</span>
                  <span className="w-20 shrink-0">{t("qc.severity")}</span>
                  <span className="w-7 shrink-0" />
                </Header>
                <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
                  {virtualizer.getVirtualItems().map((item) => {
                    const issue = issues[item.index];
                    return (
                      <div
                        key={`${issue.imageId}-${issue.annotationId || item.index}`}
                        className="absolute inset-x-0"
                        style={{ height: item.size, transform: `translateY(${item.start}px)` }}
                      >
                        <div className="flex h-8 items-center gap-2 border-b border-line px-3 hover:bg-panel-2">
                          <SeverityDot severity={issue.severity} />
                          <button type="button" className="min-w-0 flex-1 truncate text-start hover:underline" title={issue.image} onClick={() => openRow(issue.imageId)}>
                            {issue.image}
                          </button>
                          <span className="w-44 shrink-0 truncate text-muted" title={issueLine(issue)}>{issueLine(issue)}</span>
                          <span className={cn("w-20 shrink-0 truncate text-[12px]", issue.severity === "error" ? "text-danger" : issue.severity === "warning" ? "text-warn" : "text-muted")}>
                            {issue.severity === "error" ? t("qc.errors") : issue.severity === "warning" ? t("qc.warnings") : t("qc.info")}
                          </span>
                          <button
                            type="button"
                            title={t("qc.review")}
                            aria-label={t("qc.review")}
                            onClick={() => markReview(issue.imageId)}
                            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted hover:bg-panel-2 hover:text-ink"
                          >
                            <Flag className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )
          ) : null}
          {report && tab === "distribution" ? (
            (report.distribution.length === 0) ? (
              <Empty icon={ScanSearch} title={t("qc.noClasses")} hint="" />
            ) : (
              <div>
                <Header>
                  <span className="min-w-0 flex-1">{t("panel.classes")}</span>
                  <span className="w-14 text-end">{t("qc.boxes")}</span>
                  <span className="w-14 text-end">{t("qc.imagesCol")}</span>
                  <span className="w-12 text-end">{t("qc.tinyCol")}</span>
                  <span className="w-14 text-end">{t("qc.outsideCol")}</span>
                </Header>
                <ul className="px-1.5 py-1">
                  {report.distribution.map((row) => {
                    const klass = classById.get(row.key);
                    const title = klass ? displayTitle(klass, i18n.language) : row.key;
                    const color = klass?.color || "var(--accent)";
                    return (
                      <li key={row.key} className={cn("flex h-8 items-center gap-2 rounded-md px-1.5", !row.count && "opacity-60")}>
                        <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: color }} />
                        <span className="w-40 shrink-0 truncate" title={title}>{title}</span>
                        <div className="min-w-0 flex-1">
                          <div className="h-1.5 overflow-hidden rounded-full bg-line">
                            <div className="h-full rounded-full" style={{ width: `${(row.count / maxCount) * 100}%`, background: color }} />
                          </div>
                        </div>
                        <span className="w-14 shrink-0 text-end text-[12px] tabular-nums">{row.count.toLocaleString()}</span>
                        <span className="w-14 shrink-0 text-end text-[12px] tabular-nums text-muted">{row.images.toLocaleString()}</span>
                        <span className={cn("w-12 shrink-0 text-end text-[12px] tabular-nums", row.tiny ? "text-warn" : "text-muted")}>{row.tiny || "—"}</span>
                        <span className={cn("w-14 shrink-0 text-end text-[12px] tabular-nums", row.outside ? "text-danger" : "text-muted")}>{row.outside || "—"}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )
          ) : null}
          {report && tab === "consistency" ? (
            report.consistency.length === 0 ? (
              <Empty icon={Check} title={t("qc.empty")} hint="" />
            ) : (
              <ul>
                {report.consistency.map((row) => (
                  <li key={row.code}>
                    <button
                      type="button"
                      onClick={() => { setTab("issues"); setSeverity("all"); setCode(row.code); }}
                      className="flex h-8 w-full items-center gap-2 border-b border-line px-3 text-start hover:bg-panel-2"
                    >
                      <span className="min-w-0 flex-1 truncate">{t(`qc.${row.code}`, { defaultValue: row.message })}</span>
                      <span className="rounded-md bg-panel-2 px-1.5 py-0.5 text-[12px] tabular-nums">{row.count.toLocaleString()}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : null}
          {report && tab === "queue" ? (
            queue.length === 0 ? (
              <Empty icon={ClipboardCheck} title={t("qc.noQueue")} hint="" />
            ) : (
              <div>
                <Header>
                  <span className="w-52 shrink-0">{t("qc.file")}</span>
                  <span className="min-w-0 flex-1">{t("qc.classCol")}</span>
                  <span className="w-14 text-end">{t("qc.score")}</span>
                  <span className="ms-auto">
                    <Ghost label={t("qc.acceptAll")} icon={Check} onClick={() => settle(queue.map((row) => row.annotationId), [])} />
                  </span>
                </Header>
                <ul>
                  {queue.map((row) => {
                    const klass = classById.get(row.classId);
                    const title = klass ? displayTitle(klass, i18n.language) : row.classId;
                    return (
                      <li key={row.annotationId} className="flex h-8 items-center gap-2 border-b border-line px-3 hover:bg-panel-2">
                        <button type="button" className="w-52 shrink-0 truncate text-start hover:underline" title={row.image} onClick={() => openRow(row.imageId)}>
                          {row.image}
                        </button>
                        <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: klass?.color || "var(--line)" }} />
                        <span className="min-w-0 flex-1 truncate">{title}</span>
                        <span className="w-14 shrink-0 text-end text-[12px] tabular-nums text-muted">{row.score == null ? "—" : Number(row.score).toFixed(2)}</span>
                        <Ghost label={t("qc.accept")} icon={Check} onClick={() => settle([row.annotationId], [])} />
                        <Ghost label={t("qc.reject")} icon={X} tone="danger" onClick={() => settle([], [row.annotationId])} />
                      </li>
                    );
                  })}
                </ul>
              </div>
            )
          ) : null}
        </div>
      </div>
    </Modal>
  );
}

function Header({ children }: { children: ReactNode }) {
  return (
    <div className="sticky top-0 z-10 flex h-7 items-center gap-2 border-b border-line bg-panel px-3 text-[11px] font-semibold uppercase tracking-wide text-muted">
      {children}
    </div>
  );
}

function Kpi({ tone, label, value, active, onClick }: { tone: "danger" | "warn" | "info"; label: string; value: number; active?: boolean; onClick: () => void }) {
  const ink = tone === "danger" ? "bg-danger" : tone === "warn" ? "bg-warn" : "bg-[var(--info,#7dd3fc)]";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn("inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] hover:bg-panel-2", active && "bg-panel-2")}
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", ink)} />
      <span className="truncate text-muted">{label}</span>
      <span className="tabular-nums font-medium">{value.toLocaleString()}</span>
    </button>
  );
}

function Ghost({ label, icon: Icon, tone, className, onClick }: { label: string; icon?: ComponentType<{ className?: string }>; tone?: "danger"; className?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      title={label}
      onClick={(event) => { event.stopPropagation(); onClick(); }}
      className={cn(
        "inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] text-muted hover:bg-panel-2 hover:text-ink",
        tone === "danger" && "hover:text-danger",
        className,
      )}
    >
      {Icon ? <Icon className="h-3.5 w-3.5 shrink-0" /> : null}
      <span className="truncate">{label}</span>
    </button>
  );
}

function SeverityDot({ severity }: { severity: string }) {
  const Icon = severity === "error" ? CircleAlert : severity === "warning" ? AlertTriangle : Info;
  const ink = severity === "error" ? "text-danger" : severity === "warning" ? "text-warn" : "text-muted";
  return <Icon className={cn("h-3.5 w-3.5 shrink-0", ink)} aria-hidden />;
}

function Spin({ className }: { className?: string }) {
  return <Loader2 className={cn(className, "animate-spin")} />;
}

function Empty({ icon: Icon, title, hint, action }: { icon: ComponentType<{ className?: string }>; title: string; hint: string; action?: ReactNode }) {
  return (
    <div className="flex h-full min-h-[12rem] flex-col items-center justify-center gap-2 px-6 text-center">
      <Icon className="h-4 w-4 text-muted" />
      <p className="font-medium">{title}</p>
      {hint ? <p className="max-w-sm text-[12px] text-muted">{hint}</p> : null}
      {action}
    </div>
  );
}
