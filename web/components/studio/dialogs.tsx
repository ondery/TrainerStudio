"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  Ban,
  Bike,
  Bus,
  Car,
  Circle,
  Copy,
  Diamond,
  Download,
  Flag,
  FolderPlus,
  Hexagon,
  History,
  Package,
  PersonStanding,
  Plus,
  Search,
  Signpost,
  Square,
  Star,
  Tag,
  TrafficCone,
  Triangle,
  Truck,
  type LucideIcon,
} from "lucide-react";
import { appearance, patchAppearance } from "@/lib/appearance";
import { FILTERS } from "@/lib/browse";
import { api } from "@/lib/api";
import { useStudio } from "@/lib/store";
import { displayTitle } from "@/lib/titles";
import type { ClassRow, Field } from "@/lib/types";
import { cn } from "@/lib/utils";
import { FieldLabel, Modal, TextButton, TextInput } from "@/components/ui";
import { PathField, RecentPaths } from "./path-field";
import { SettingsWindow, ShortcutEditor } from "./settings-window";
import { QcDialog } from "./qc-dialog";

type Job = {
  id: string;
  projectId?: string | null;
  kind: string;
  status: string;
  progress: number;
  message: string;
  messageCode?: string;
  messageParams?: Record<string, string | number>;
  payload?: { logs?: string[]; metrics?: Record<string, number>; result?: { best?: string; images?: number; skipped?: number } };
};
type ModelFamily = { id: string; label: string; sizes: string[]; tasks: string[]; license: string };
type Backend = { id: string; license: string; ready: boolean; reason: string; reasonCode?: string; families: ModelFamily[] };

function usePersistUi() {
  const ui = useStudio((state) => state.ui);
  useEffect(() => {
    const saved = {
      classPopup: ui.classPopup,
      autoAdvance: ui.autoAdvance,
      crosshair: ui.crosshair,
      askClass: ui.askClass,
      samModel: ui.samModel,
      samDevice: ui.samDevice,
      theme: ui.theme,
    };
    window.localStorage.setItem("trainer-studio.ui", JSON.stringify(saved));
    window.localStorage.setItem("trainer-studio.theme", ui.theme);
    if (appearance().theme === "system") {
      document.documentElement.classList.toggle("dark", window.matchMedia("(prefers-color-scheme: dark)").matches);
    } else {
      document.documentElement.classList.toggle("dark", ui.theme !== "light");
    }
  }, [ui.classPopup, ui.autoAdvance, ui.crosshair, ui.askClass, ui.samModel, ui.samDevice, ui.theme]);
}

export function Dialogs() {
  usePersistUi();
  const dialog = useStudio((state) => state.ui.dialog);
  const patchUi = useStudio((state) => state.patchUi);
  const close = () => patchUi({ dialog: "" });
  return (
    <>
      <SettingsWindow open={dialog === "settings"} onClose={close} />
      <OpenDialog open={dialog === "open"} onClose={close} />
      <AddClassDialog open={dialog === "add-class"} onClose={close} />
      <SchemaDialog open={dialog === "schema"} onClose={close} />
      <ExportDialog open={dialog === "export"} onClose={close} />
      <JobsDialog open={dialog === "jobs"} onClose={close} />
      <QcDialog open={dialog === "qc"} onClose={close} />
      <ShortcutsDialog open={dialog === "shortcuts"} onClose={close} />
      <HistoryDialog open={dialog === "history"} onClose={close} />
      <CreateDialog open={dialog === "create"} onClose={close} />
      <WizardDialog open={dialog === "wizard"} onClose={close} />
      <MoveOffer />
    </>
  );
}

function SchemaDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const project = useStudio((state) => state.project);
  const fields = useStudio((state) => state.fields);
  const refresh = useStudio((state) => state.refresh);
  const [draft, setDraft] = useState<Field[]>(fields);
  const [label, setLabel] = useState("");
  const [type, setType] = useState("text");
  const [scope, setScope] = useState<Field["scope"]>("annotation");
  useEffect(() => setDraft(fields), [fields, open]);
  if (!project) return null;
  const types = ["text", "number", "boolean", "single", "multi", "date", "color", "url", "class_ref"];
  return (
    <Modal open={open} title={t("schema.title")} onClose={onClose}>
      <div className="mb-3 flex flex-wrap gap-2">
        <TextButton
          label={t("schema.signlens")}
          onClick={() => {
            void api(`/api/projects/${project.id}/schema/template`, { method: "POST", body: JSON.stringify({ template: "signlens" }) }).then(() => refresh(project.id));
          }}
        />
        <TextButton
          label={t("schema.blank")}
          onClick={() => {
            void api(`/api/projects/${project.id}/schema/template`, { method: "POST", body: JSON.stringify({ template: "blank" }) }).then(() => refresh(project.id));
          }}
        />
      </div>
      <div className="mb-3 grid grid-cols-3 gap-2">
        <div>
          <FieldLabel>{t("schema.label")}</FieldLabel>
          <TextInput value={label} onChange={(event) => setLabel(event.target.value)} />
        </div>
        <div>
          <FieldLabel>{t("schema.type")}</FieldLabel>
          <select className="h-8 w-full rounded-md border border-line bg-panel-2 px-2" value={type} onChange={(event) => setType(event.target.value)}>
            {types.map((item) => (
              <option key={item} value={item}>{t(`fields.${item === "class_ref" ? "classRef" : item}`)}</option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel>{t("schema.scope")}</FieldLabel>
          <select className="h-8 w-full rounded-md border border-line bg-panel-2 px-2" value={scope} onChange={(event) => setScope(event.target.value as Field["scope"])}>
            <option value="annotation">{t("scopes.annotation")}</option>
            <option value="image">{t("scopes.image")}</option>
            <option value="class">{t("scopes.class")}</option>
          </select>
        </div>
      </div>
      <TextButton
        label={t("actions.add")}
        onClick={() => {
          const id = label.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^[^a-z]+/, "") || `field_${draft.length + 1}`;
          setDraft([...draft, { id, scope, type, label: label || id, labelEn: label || id }]);
          setLabel("");
        }}
      />
      <ul className="my-3 grid gap-1">
        {draft.map((field) => (
          <li key={field.id} className="flex h-8 items-center gap-2 whitespace-nowrap">
            <span className="min-w-0 flex-1 truncate" title={field.label}>{field.label}</span>
            <span className="text-xs text-muted">{field.type}</span>
            <span className="text-xs text-muted">{t(`scopes.${field.scope}`)}</span>
            <TextButton label={t("actions.delete")} tone="danger" onClick={() => setDraft(draft.filter((item) => item.id !== field.id))} />
          </li>
        ))}
      </ul>
      <TextButton
        label={t("actions.save")}
        tone="accent"
        onClick={() => {
          void api(`/api/projects/${project.id}/schema`, { method: "PUT", body: JSON.stringify({ fields: draft }) }).then(() => refresh(project.id));
        }}
      />
    </Modal>
  );
}

function ExportDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const project = useStudio((state) => state.project);
  const refresh = useStudio((state) => state.refresh);
  const [task, setTask] = useState(project?.task || "detect");
  const [format, setFormat] = useState(() => appearance().exportFormat);
  const [grouped, setGrouped] = useState(() => appearance().exportGrouped);
  const [precision, setPrecision] = useState(() => appearance().exportPrecision);
  const [skipEmpty, setSkipEmpty] = useState(() => appearance().exportEmpty);
  const [dest, setDest] = useState(() => appearance().exportDir);
  const [report, setReport] = useState("");
  useEffect(() => {
    if (project) setTask(project.task);
  }, [project]);
  if (!project) return null;
  return (
    <Modal open={open} title={t("export.title")} onClose={onClose}>
      <p className="mb-3 text-muted">{t("export.note")}</p>
      <FieldLabel>{t("export.format")}</FieldLabel>
      <select className="mb-3 h-8 w-full rounded-md border border-line bg-panel-2 px-2" value={format} onChange={(event) => setFormat(event.target.value as "yolo" | "coco" | "voc")}>
        <option value="yolo">{t("export.yolo")}</option>
        <option value="coco">{t("export.coco")}</option>
        <option value="voc">{t("export.voc")}</option>
      </select>
      <FieldLabel>{t("task.detect")}</FieldLabel>
      <select className="mb-3 h-8 w-full rounded-md border border-line bg-panel-2 px-2" value={task} onChange={(event) => setTask(event.target.value)}>
        {(["detect", "segment", "obb", "pose"] as const).map((item) => (
          <option key={item} value={item}>{t(`task.${item}`)}</option>
        ))}
      </select>
      <label className="mb-3 flex h-8 items-center gap-2 whitespace-nowrap">
        <input type="checkbox" checked={grouped} onChange={(event) => { setGrouped(event.target.checked); patchAppearance({ exportGrouped: event.target.checked }); }} />
        <span className="truncate">{t("export.grouped")}</span>
      </label>
      <label className="mb-3 flex h-8 items-center gap-2 whitespace-nowrap">
        <input type="checkbox" checked={skipEmpty} onChange={(event) => { setSkipEmpty(event.target.checked); patchAppearance({ exportEmpty: event.target.checked }); }} />
        <span className="truncate">{t("set.empty")}</span>
      </label>
      <label className="mb-3 flex h-8 items-center gap-2 whitespace-nowrap">
        <span className="truncate">{t("set.precision")}</span>
        <input aria-label={t("set.precision")} type="number" min={1} max={8} className="h-8 w-16 rounded-md border border-line bg-panel-2 px-2" value={precision} onChange={(event) => { const next = Number(event.target.value) || 6; setPrecision(next); patchAppearance({ exportPrecision: next }); }} />
      </label>
      <PathField
        testId="path-export"
        label={t("path.export")}
        value={dest}
        filters={FILTERS.yaml}
        onChange={(value) => {
          setDest(value);
          patchAppearance({ exportDir: value });
        }}
      />
      <div className="flex flex-wrap gap-2">
        <TextButton
          label={t("export.validate")}
          onClick={() => {
            void api<{ ok: boolean; errors: unknown[]; warnings: unknown[] }>(`/api/projects/${project.id}/export/validate?task=${task}`).then((body) => {
              setReport(`${body.ok ? "OK" : "—"} ${body.errors.length} / ${body.warnings.length}`);
            });
          }}
        />
        <TextButton
          label={t("export.run")}
          icon={Download}
          tone="accent"
          onClick={() => {
            void api<{ dest?: string; ok?: boolean; errors?: unknown[] }>(`/api/projects/${project.id}/export`, {
              method: "POST",
              body: JSON.stringify({ task, format, grouped, dest: dest || undefined, precision, skipEmpty }),
            })
              .then((body) => setReport(body.dest || ""))
              .catch((error: Error) => setReport(error.message));
          }}
        />
        <TextButton
          label={t("export.split")}
          onClick={() => {
            void api<{ counts: Record<string, number> }>(`/api/projects/${project.id}/split`, { method: "POST", body: JSON.stringify({ train: 0.8, val: 0.1, test: 0.1 }) })
              .then((body) => {
                setReport(`${body.counts.train}/${body.counts.val}/${body.counts.test}`);
                return refresh(project.id);
              })
              .catch((error: Error) => setReport(error.message));
          }}
        />
        <TextButton
          label={t("export.snapshot")}
          onClick={() => {
            void api<{ dest: string }>(`/api/projects/${project.id}/snapshots`, { method: "POST" })
              .then((body) => setReport(body.dest))
              .catch((error: Error) => setReport(error.message));
          }}
        />
      </div>
      {report ? <p className="mt-3 truncate text-xs text-muted" title={report}>{report}</p> : null}
    </Modal>
  );
}

function JobsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const project = useStudio((state) => state.project);
  const refresh = useStudio((state) => state.refresh);
  const [backends, setBackends] = useState<Backend[]>([]);
  const [backend, setBackend] = useState("ultralytics");
  const [family, setFamily] = useState(() => appearance().trainFamily || "yolo11");
  const [size, setSize] = useState("n");
  const [epochs, setEpochs] = useState(() => appearance().epochs);
  const [device, setDevice] = useState(() => appearance().trainDevice);
  const [weights, setWeights] = useState(() => appearance().trainWeights);
  const [output, setOutput] = useState(() => appearance().trainOutput);
  const [cuda, setCuda] = useState(false);
  const [hint, setHint] = useState("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const seen = useState<Record<string, string>>({})[0];
  const current = backends.find((item) => item.id === backend);
  const families = current?.families || [];
  const familyRow = families.find((item) => item.id === family) || families[0];
  useEffect(() => {
    if (!open) return;
    void api<{ backends: Backend[] }>("/api/models").then((body) => {
      setBackends(body.backends);
      const first = body.backends.find((item) => item.id === "ultralytics") || body.backends[0];
      if (first) {
        setBackend(first.id);
        const preferred = appearance().trainFamily;
        const picked = first.families.find((item) => item.id === preferred) || first.families[0];
        setFamily(picked?.id || "yolo11");
        setSize(picked?.sizes[0] || "n");
      }
    });
    void api<{ cuda?: boolean; hint?: string; hintCode?: string }>("/api/ai/status").then((body) => {
      const ok = Boolean(body.cuda);
      setCuda(ok);
      if (!ok) setDevice("cpu");
      setHint(body.hintCode ? t(`api.${body.hintCode}`, { defaultValue: body.hint || "" }) : body.hint || "");
    }).catch(() => setHint(""));
  }, [open, t]);
  useEffect(() => {
    if (!open || !project) return;
    let stop = false;
    const tick = () => {
      void api<{ jobs: Job[] }>("/api/jobs").then((body) => {
        if (stop) return;
        const rows = body.jobs.filter((job) => job.projectId === project.id || job.kind === "ai-install");
        for (const job of rows) {
          if (job.kind === "autolabel" && job.status === "done" && seen[job.id] !== "done") void refresh(project.id);
          seen[job.id] = job.status;
        }
        setJobs(rows);
      });
    };
    tick();
    const handle = window.setInterval(tick, 1500);
    return () => {
      stop = true;
      window.clearInterval(handle);
    };
  }, [open, project, refresh, seen]);
  if (!project) return null;
  const start = (kind: string) => {
    void api("/api/jobs", {
      method: "POST",
      body: JSON.stringify({
        kind,
        projectId: project.id,
        backend,
        family: familyRow?.id || family,
        size,
        epochs,
        task: project.task,
        device,
        weights: weights.trim() || appearance().trainWeights || undefined,
        imgsz: appearance().imgsz,
        batch: appearance().batch,
        workers: appearance().workers,
        output: output.trim() || undefined,
        review: true,
        append: true,
      }),
    }).catch((error: Error) => useStudio.getState().setNotice(error.message, "error"));
  };
  const install = () => {
    void api("/api/ai/install", { method: "POST" }).catch((error: Error) => useStudio.getState().setNotice(error.message, "error"));
  };
  return (
    <Modal open={open} title={t("jobs.title")} onClose={onClose}>
      <p className="mb-2 truncate text-muted" title={t("jobs.reviewNote")}>{t("jobs.reviewNote")}</p>
      <div className="mb-3 grid grid-cols-2 gap-2">
        <div>
          <FieldLabel>{t("jobs.backend")}</FieldLabel>
          <select className="h-8 w-full rounded-md border border-line bg-panel-2 px-2" value={backend} onChange={(event) => setBackend(event.target.value)}>
            {backends.map((item) => (
              <option key={item.id} value={item.id}>{item.id} · {item.license}{item.ready ? "" : ` · ${t("models.unavailable")}`}</option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel>{t("jobs.family")}</FieldLabel>
          <select className="h-8 w-full rounded-md border border-line bg-panel-2 px-2" value={familyRow?.id || family} onChange={(event) => setFamily(event.target.value)}>
            {families.map((item) => (
              <option key={item.id} value={item.id}>{item.label}</option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel>{t("jobs.size")}</FieldLabel>
          <select className="h-8 w-full rounded-md border border-line bg-panel-2 px-2" value={size} onChange={(event) => setSize(event.target.value)}>
            {(familyRow?.sizes || []).map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel>{t("jobs.device")}</FieldLabel>
          <select className="h-8 w-full rounded-md border border-line bg-panel-2 px-2" value={device} onChange={(event) => setDevice(event.target.value === "cuda" ? "cuda" : "cpu")}>
            <option value="cpu">{t("sam.cpu")}</option>
            <option value="cuda" disabled={!cuda}>{t("sam.cuda")}</option>
          </select>
        </div>
        <div>
          <FieldLabel>{t("jobs.epochs")}</FieldLabel>
          <TextInput type="number" value={epochs} onChange={(event) => setEpochs(Number(event.target.value))} />
        </div>
      </div>
      <PathField testId="path-weights" label={t("jobs.weights")} value={weights} filters={FILTERS.weights} onChange={setWeights} />
      <PathField
        testId="path-output"
        label={t("path.output")}
        value={output}
        onChange={(value) => {
          setOutput(value);
          patchAppearance({ trainOutput: value });
        }}
      />
      {current && !current.ready ? (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <p className="min-w-0 flex-1 truncate text-warn" title={current.reasonCode ? t(`api.${current.reasonCode}`, { defaultValue: current.reason || hint || t("jobs.installHint") }) : current.reason || hint || t("jobs.installHint")}>
            {current.reasonCode ? t(`api.${current.reasonCode}`, { defaultValue: current.reason || hint || t("jobs.installHint") }) : current.reason || hint || t("jobs.installHint")}
          </p>
          <TextButton label={t("jobs.install")} icon={Package} tone="accent" onClick={install} />
        </div>
      ) : null}
      <div className="mb-3 flex flex-wrap gap-2">
        <TextButton label={t("jobs.autolabel")} icon={Package} onClick={() => start("autolabel")} />
        <TextButton label={t("jobs.train")} icon={Download} tone="accent" onClick={() => start("train")} />
      </div>
      {jobs.length === 0 ? <p className="text-muted">{t("jobs.empty")}</p> : null}
      <ul className="grid gap-2">
        {jobs.map((job) => {
          const metrics = job.payload?.metrics;
          const logs = job.payload?.logs || [];
          const best = job.payload?.result?.best;
          const jobLine = job.messageCode ? t(`api.${job.messageCode}`, { defaultValue: job.message }) : job.message;
          const metricText = metrics ? Object.entries(metrics).slice(0, 4).map(([key, value]) => `${key} ${value}`).join(" · ") : "";
          return (
            <li key={job.id} className="rounded-md border border-line px-2 py-1">
              <div className="flex h-8 items-center gap-2 whitespace-nowrap">
                <span className="w-20 truncate">{job.kind}</span>
                <span className="w-16 truncate text-muted">{job.status}</span>
                <span className="w-12 text-muted">{Math.round(job.progress * 100)}%</span>
                <span className="min-w-0 flex-1 truncate" title={job.messageCode ? t(`api.${job.messageCode}`, { ...(job.messageParams || {}), defaultValue: jobLine }) : jobLine}>
                {job.messageCode ? t(`api.${job.messageCode}`, { ...(job.messageParams || {}), defaultValue: jobLine }) : jobLine}
              </span>
                {job.status === "running" || job.status === "queued" ? (
                  <TextButton label={t("jobs.cancel")} onClick={() => void api(`/api/jobs/${job.id}/cancel`, { method: "POST" })} />
                ) : null}
                {best ? (
                  <a className="inline-flex h-8 items-center whitespace-nowrap rounded-md border border-line px-2" href={`/api/jobs/${job.id}/best`} title={t("jobs.best")}>{t("jobs.best")}</a>
                ) : null}
              </div>
              {metricText ? <p className="truncate text-xs text-muted" title={metricText}>{t("jobs.metrics")}: {metricText}</p> : null}
              {logs.length ? <p className="truncate text-xs text-muted" title={logs.slice(-6).join("\n")}>{t("jobs.logs")}: {logs[logs.length - 1]}</p> : null}
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}

function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <Modal open={open} title={t("shortcuts.title")} onClose={onClose} wide>
      <p className="mb-2 truncate text-muted" title={t("shortcuts.hint")}>{t("shortcuts.hint")}</p>
      <ShortcutEditor active={open} />
    </Modal>
  );
}

function HistoryDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const project = useStudio((state) => state.project);
  const past = useStudio((state) => state.editor.past);
  const jumpHistory = useStudio((state) => state.jumpHistory);
  const [saved, setSaved] = useState<{ id: number; kind: string; note: string; createdAt: string }[]>([]);
  useEffect(() => {
    if (!open || !project) return;
    void api<{ versions: typeof saved }>(`/api/projects/${project.id}/versions`).then((body) => setSaved(body.versions)).catch(() => setSaved([]));
  }, [open, project]);
  return (
    <Modal open={open} title={t("history.title")} onClose={onClose}>
      {past.length === 0 ? <p className="text-muted">{t("history.empty")}</p> : null}
      <ul className="grid max-h-48 gap-1 overflow-auto">
        {[...past].reverse().map((entry, rev) => {
          const index = past.length - 1 - rev;
          return (
            <li key={`${entry.label}-${index}`}>
              <button type="button" className="flex h-8 w-full items-center truncate rounded-md px-2 text-start hover:bg-panel-2" onClick={() => jumpHistory(index)}>
                <History className="me-2 h-4 w-4 shrink-0" />
                <span className="truncate">{t(`history.${entry.label}`, { defaultValue: entry.label })}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mb-1 mt-3 text-xs text-muted">{t("history.saved")}</p>
      <ul className="grid max-h-40 gap-1 overflow-auto">
        {saved.map((row) => (
          <li key={row.id} className="flex h-8 items-center gap-2 whitespace-nowrap text-xs">
            <span className="w-20 truncate text-muted">{row.kind}</span>
            <span className="min-w-0 flex-1 truncate" title={row.note}>{row.note}</span>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

function joinPath(base: string, name: string) {
  const folder = (name || "project").replace(/[\\/]/g, " ").trim() || "project";
  const root = base.replace(/[\\/]+$/, "");
  return root ? `${root}/${folder}` : folder;
}

function insideRoot(path: string, root: string) {
  if (!path || !root) return false;
  const left = path.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
  const right = root.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
  return left === right || left.startsWith(`${right}/`);
}

function CreateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const createPath = useStudio((state) => state.createPath);
  const [path, setPath] = useState("");
  const [name, setName] = useState("");
  const [template, setTemplate] = useState("blank");
  const [base, setBase] = useState("");
  const [install, setInstall] = useState("");
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!open) return;
    setTouched(false);
    void api<{ defaultProjects?: string; installRoot?: string }>("/api/health").then((body) => {
      setBase(body.defaultProjects || "");
      setInstall(body.installRoot || "");
      setPath(joinPath(body.defaultProjects || "", name || "project"));
    }).catch(() => undefined);
  }, [open]);
  useEffect(() => {
    if (!open || touched || !base) return;
    setPath(joinPath(base, name || "project"));
  }, [name, base, open, touched]);
  const blocked = insideRoot(path, install);
  return (
    <Modal open={open} title={t("welcome.create")} onClose={onClose}>
      <PathField testId="path-create" label={t("welcome.path")} value={path} onChange={(value) => { setTouched(true); setPath(value); }} />
      {blocked ? <p className="mb-2 text-xs text-warn" data-testid="install-warn">{t("create.installWarn")}</p> : null}
      <FieldLabel>{t("create.name")}</FieldLabel>
      <TextInput className="mb-2" value={name} onChange={(event) => setName(event.target.value)} />
      <div className="mb-3 flex flex-wrap gap-2">
        <TextButton label={t("template.blank")} tone={template === "blank" ? "accent" : undefined} onClick={() => setTemplate("blank")} />
        <TextButton label={t("template.objects")} tone={template === "objects" ? "accent" : undefined} onClick={() => setTemplate("objects")} />
        <TextButton label={t("template.coco")} tone={template === "coco" ? "accent" : undefined} onClick={() => setTemplate("coco")} />
        <TextButton label={t("template.signlens")} tone={template === "signlens" ? "accent" : undefined} onClick={() => setTemplate("signlens")} />
      </div>
      <TextButton
        label={t("create.submit")}
        icon={FolderPlus}
        tone="accent"
        onClick={() => {
          if (blocked) {
            useStudio.getState().setNotice(t("create.installWarn"));
            return;
          }
          void createPath(path, name || "Trainer Studio", template)
            .then(onClose)
            .catch((error: Error) => useStudio.getState().setNotice(error.message, "error"));
        }}
      />
    </Modal>
  );
}

function WizardDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const createPath = useStudio((state) => state.createPath);
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [template, setTemplate] = useState("blank");
  useEffect(() => {
    if (!open) return;
    setStep(0);
    void api<{ defaultProjects?: string }>("/api/health").then((body) => {
      setPath(joinPath(body.defaultProjects || "", name || "project"));
    }).catch(() => undefined);
  }, [open]);
  return (
    <Modal open={open} title={t("wizard.title")} onClose={onClose}>
      <p className="mb-2 text-xs text-muted" data-testid="wizard-step">{t("wizard.step", { count: step + 1 })}</p>
      {step === 0 ? (
        <>
          <FieldLabel>{t("wizard.name")}</FieldLabel>
          <TextInput className="mb-2" aria-label={t("wizard.name")} value={name} onChange={(event) => setName(event.target.value)} />
        </>
      ) : null}
      {step === 1 ? (
        <PathField testId="wizard-path" label={t("wizard.path")} value={path} onChange={setPath} />
      ) : null}
      {step === 2 ? (
        <div className="mb-3 flex flex-wrap gap-2">
          {(["blank", "objects", "coco", "signlens"] as const).map((item) => (
            <TextButton key={item} label={t(`template.${item}`)} tone={template === item ? "accent" : undefined} onClick={() => setTemplate(item)} />
          ))}
        </div>
      ) : null}
      <div className="flex gap-2">
        {step > 0 ? <TextButton label={t("wizard.back")} onClick={() => setStep((value) => value - 1)} /> : null}
        {step < 2 ? <TextButton label={t("wizard.next")} tone="accent" onClick={() => setStep((value) => value + 1)} /> : (
          <TextButton
            label={t("wizard.create")}
            tone="accent"
            onClick={() => {
              void createPath(path, name || "Trainer Studio", template).then(onClose).catch((error: Error) => useStudio.getState().setNotice(error.message, "error"));
            }}
          />
        )}
      </div>
    </Modal>
  );
}

function MoveOffer() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<{ id: string; name: string; root: string }[]>([]);
  const [base, setBase] = useState("");
  const [target, setTarget] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    void api<{ trapped?: { id: string; name: string; root: string }[]; defaultDir?: string }>("/api/projects/places").then((body) => {
      const list = body.trapped || [];
      const folder = body.defaultDir || "";
      setRows(list);
      setBase(folder);
      setTarget(list[0] ? joinPath(folder, list[0].name) : "");
      setConfirmed(false);
    }).catch(() => undefined);
  }, []);
  if (!rows.length) return null;
  const current = rows[0];
  const advance = (list: { id: string; name: string; root: string }[]) => {
    setRows(list);
    setConfirmed(false);
    setTarget(list[0] ? joinPath(base, list[0].name) : "");
  };
  return (
    <Modal open title={t("move.title")} onClose={() => setRows([])}>
      <p className="mb-2 text-sm">{t("move.body", { name: current.name, source: current.root, target })}</p>
      <p className="mb-1 text-xs text-muted">{t("move.source")}</p>
      <p className="mb-2 break-all font-mono text-xs" data-testid="move-source">{current.root}</p>
      <PathField
        testId="path-move"
        label={t("move.target")}
        value={target}
        onChange={(value) => {
          setConfirmed(false);
          setTarget(value);
        }}
      />
      <p className="mb-2 break-all font-mono text-xs" data-testid="move-target">{target}</p>
      <label className="mb-3 flex items-start gap-2 text-xs">
        <input
          type="checkbox"
          data-testid="move-confirm"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
        />
        <span>{t("move.confirm")}</span>
      </label>
      <div className="mt-2 flex gap-2">
        <TextButton label={t("move.later")} onClick={() => advance(rows.slice(1))} />
        <TextButton
          label={t("move.submit")}
          tone="accent"
          disabled={!confirmed || !target.trim()}
          onClick={() => {
            if (!confirmed || !target.trim()) return;
            void api(`/api/projects/${current.id}/move`, {
              method: "POST",
              body: JSON.stringify({ path: target, source: current.root, confirm: true }),
            })
              .then(() => advance(rows.slice(1)))
              .catch((error: Error) => useStudio.getState().setNotice(error.message, "error"));
          }}
        />
      </div>
    </Modal>
  );
}

function OpenDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const openPath = useStudio((state) => state.openPath);
  const [path, setPath] = useState("");
  const [yaml, setYaml] = useState("");
  const submit = (value: string) => {
    void openPath(value)
      .then(onClose)
      .catch((error: Error) => useStudio.getState().setNotice(error.message, "error"));
  };
  return (
    <Modal open={open} title={t("open.title")} onClose={onClose}>
      <PathField testId="path-open" label={t("welcome.path")} value={path} filters={FILTERS.yaml} onChange={setPath} />
      <PathField testId="path-open-yaml" label={t("path.yaml")} value={yaml} filters={FILTERS.yaml} onChange={setYaml} />
      <TextButton label={t("open.submit")} icon={FolderPlus} tone="accent" onClick={() => submit(yaml.trim() || path.trim())} />
      <div className="mt-3">
        <RecentPaths onPick={submit} />
      </div>
    </Modal>
  );
}

const CLASS_ICONS: { name: string; Icon: LucideIcon }[] = [
  { name: "Tag", Icon: Tag },
  { name: "Circle", Icon: Circle },
  { name: "Square", Icon: Square },
  { name: "Triangle", Icon: Triangle },
  { name: "Star", Icon: Star },
  { name: "Flag", Icon: Flag },
  { name: "Hexagon", Icon: Hexagon },
  { name: "Diamond", Icon: Diamond },
  { name: "Car", Icon: Car },
  { name: "Bus", Icon: Bus },
  { name: "Bike", Icon: Bike },
  { name: "Truck", Icon: Truck },
  { name: "PersonStanding", Icon: PersonStanding },
  { name: "Signpost", Icon: Signpost },
  { name: "TrafficCone", Icon: TrafficCone },
  { name: "Ban", Icon: Ban },
];
const CLASS_SWATCHES = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#14b8a6", "#0ea5e9", "#3b82f6", "#6366f1", "#a855f7", "#ec4899", "#64748b", "#0f172a"];
const CLASS_KEY = /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/;

type ClassDraft = {
  key: string;
  title: string;
  titleEn: string;
  detail: string;
  color: string;
  icon: string;
  hotkey: string;
  attrs: string;
  parent: string;
  cloneFrom: string;
  keyLocked: boolean;
};

function classGlyph(name?: string) {
  return CLASS_ICONS.find((item) => item.name === name)?.Icon || Tag;
}

function slugFromTitle(value: string) {
  const mapped = value
    .replace(/İ/g, "i")
    .replace(/I/g, "i")
    .replace(/ı/g, "i")
    .replace(/Ğ/g, "g")
    .replace(/ğ/g, "g")
    .replace(/Ü/g, "u")
    .replace(/ü/g, "u")
    .replace(/Ş/g, "s")
    .replace(/ş/g, "s")
    .replace(/Ö/g, "o")
    .replace(/ö/g, "o")
    .replace(/Ç/g, "c")
    .replace(/ç/g, "c");
  const slug = mapped
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
  if (!slug) return "";
  return (/^[a-z_]/.test(slug) ? slug : `c_${slug}`).slice(0, 64);
}

function uniqueClassKey(source: string, used: Set<string>) {
  const trimmed = source.trim().slice(0, 64);
  if (trimmed && !used.has(trimmed)) return trimmed;
  const match = /^(.*?)(\d+)$/.exec(trimmed);
  if (match) {
    const prefix = match[1];
    const width = match[2].length;
    let n = Number(match[2]);
    for (let i = 0; i < 999; i += 1) {
      n += 1;
      const next = `${prefix}${String(n).padStart(width, "0")}`.slice(0, 64);
      if (!used.has(next)) return next;
    }
  }
  const base = trimmed || "class";
  for (let i = 2; i < 999; i += 1) {
    const next = `${base}_${i}`.slice(0, 64);
    if (!used.has(next)) return next;
  }
  return `${base}_x`.slice(0, 64);
}

function nextClassColor(rows: ClassRow[]) {
  const used = new Set(rows.map((row) => row.color.toLowerCase()));
  return CLASS_SWATCHES.find((color) => !used.has(color.toLowerCase())) || "#3dd68c";
}

function splitAttrs(value: string) {
  return value.split(/[,;]+/).map((item) => item.trim()).filter(Boolean);
}

function blankClassDraft(rows: ClassRow[]): ClassDraft {
  return {
    key: "",
    title: "",
    titleEn: "",
    detail: "",
    color: nextClassColor(rows),
    icon: "Tag",
    hotkey: "",
    attrs: "",
    parent: "",
    cloneFrom: "",
    keyLocked: false,
  };
}

function retitleClone(text: string, fromId: string, toId: string) {
  const from = /(\d+)$/.exec(fromId);
  const to = /(\d+)$/.exec(toId);
  if (!from || !to || from[1] === to[1] || !text) return text;
  return text.replaceAll(from[1], to[1]);
}

function cloneClassDraft(row: ClassRow, used: Set<string>): ClassDraft {
  const key = uniqueClassKey(row.id, used);
  return {
    key,
    title: retitleClone(row.title, row.id, key),
    titleEn: retitleClone(row.titleEn || row.title, row.id, key),
    detail: retitleClone(row.detail || "", row.id, key),
    color: row.color || "#3dd68c",
    icon: row.icon?.name || "Tag",
    hotkey: "",
    attrs: row.attrs || "",
    parent: row.parent || "",
    cloneFrom: row.id,
    keyLocked: true,
  };
}

function AddClassDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const project = useStudio((state) => state.project);
  const classes = useStudio((state) => state.classes);
  const refresh = useStudio((state) => state.refresh);
  const [draft, setDraft] = useState<ClassDraft>(() => blankClassDraft([]));
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const usedKeys = useMemo(() => new Set(classes.map((row) => row.id)), [classes]);
  const groupsKnown = useMemo(
    () => [...new Set(classes.map((row) => row.parent || "").filter(Boolean))],
    [classes],
  );
  const attrChips = useMemo(() => {
    const seen = new Set<string>();
    const chips: string[] = [];
    for (const row of classes) {
      for (const item of splitAttrs(row.attrs || "")) {
        const key = item.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        chips.push(item);
      }
    }
    return chips;
  }, [classes]);
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return classes.filter((row) => {
      if (group && (row.parent || "") !== group) return false;
      if (!needle) return true;
      const title = displayTitle(row, i18n.language).toLowerCase();
      return row.id.toLowerCase().includes(needle) || title.includes(needle) || (row.detail || "").toLowerCase().includes(needle);
    });
  }, [classes, group, i18n.language, query]);
  const grouped = useMemo(() => {
    const order: string[] = [];
    const buckets = new Map<string, ClassRow[]>();
    for (const row of visible) {
      const id = row.parent || "";
      if (!buckets.has(id)) {
        buckets.set(id, []);
        order.push(id);
      }
      buckets.get(id)!.push(row);
    }
    return order.map((id) => ({ id, rows: buckets.get(id) || [] }));
  }, [visible]);
  const validKey = CLASS_KEY.test(draft.key.trim());
  const duplicate = usedKeys.has(draft.key.trim());
  const hotOwner = draft.hotkey.trim()
    ? classes.find((row) => (row.hotkey || "").toLowerCase() === draft.hotkey.trim().toLowerCase())
    : undefined;
  const PreviewIcon = classGlyph(draft.icon);
  const previewTitle = displayTitle(
    {
      id: draft.key.trim() || "class",
      title: draft.title.trim() || draft.key.trim() || t("class.editor"),
      titleEn: draft.titleEn,
      detail: draft.detail,
    },
    i18n.language,
  );
  const canCreate = Boolean(project) && validKey && !duplicate && !hotOwner && !busy;

  useEffect(() => {
    if (!open) return;
    setDraft(blankClassDraft(useStudio.getState().classes));
    setQuery("");
    setGroup("");
    setError("");
    setBusy(false);
  }, [open]);

  function applyClone(row: ClassRow) {
    setDraft(cloneClassDraft(row, usedKeys));
    setError("");
    requestAnimationFrame(() => titleRef.current?.select());
  }

  function applyBlank() {
    setDraft(blankClassDraft(classes));
    setError("");
    requestAnimationFrame(() => titleRef.current?.focus());
  }

  function toggleAttr(item: string) {
    const current = splitAttrs(draft.attrs);
    const exists = current.some((entry) => entry.toLowerCase() === item.toLowerCase());
    setDraft((prev) => ({
      ...prev,
      attrs: (exists ? current.filter((entry) => entry.toLowerCase() !== item.toLowerCase()) : [...current, item]).join(", "),
    }));
  }

  function onHotkeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Tab") return;
    event.preventDefault();
    if (event.key === "Escape" || event.key === "Backspace" || event.key === "Delete") {
      setDraft((prev) => ({ ...prev, hotkey: "" }));
      return;
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      setDraft((prev) => ({ ...prev, hotkey: event.key }));
    }
  }

  function create() {
    if (!project || busy) return;
    if (!validKey) {
      setError(t("class.badKey"));
      return;
    }
    if (duplicate) {
      setError(t("class.duplicate"));
      return;
    }
    if (hotOwner) {
      setError(t("class.hotTaken", { id: hotOwner.id }));
      return;
    }
    setError("");
    setBusy(true);
    const key = draft.key.trim();
    const title = draft.title.trim() || key;
    void api(`/api/projects/${project.id}/classes/apply`, {
      method: "POST",
      body: JSON.stringify({
        op: "add",
        key,
        title,
        titleEn: draft.titleEn.trim() || title,
        detail: draft.detail.trim(),
        color: draft.color,
        icon: draft.icon,
        hotkey: draft.hotkey.trim(),
        attrs: draft.attrs.trim(),
        parent: draft.parent,
      }),
    })
      .then(() => refresh(project.id))
      .then(() => {
        useStudio.getState().setNotice(t("class.appended"), "update");
        onClose();
      })
      .catch((caught: Error) => {
        setError(caught.message);
        useStudio.getState().setNotice(caught.message, "error");
      })
      .finally(() => setBusy(false));
  }

  function groupLabel(id: string) {
    if (!id) return t("class.groupNone");
    const row = classes.find((item) => item.id === id);
    return row ? displayTitle(row, i18n.language) : id;
  }

  return (
    <Modal wide flush open={open} title={t("class.addTitle")} onClose={onClose}>
      <div
        data-testid="class-editor"
        className="flex h-[min(36rem,calc(84vh-2.75rem))] min-h-0 flex-col"
        onKeyDown={(event) => {
          if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
            event.preventDefault();
            create();
          }
        }}
      >
        <div className="grid min-h-0 flex-1 grid-cols-[22rem_minmax(0,1fr)]">
          <aside className="flex min-h-0 flex-col border-e border-line bg-panel-2">
            <div className="border-b border-line px-3 py-2">
              <p className="text-[13px] font-medium">{t("class.fromDataset")}</p>
              <p className="text-[11px] text-muted">{t("status.classes", { count: classes.length })}</p>
            </div>
            <div className="flex gap-2 border-b border-line px-3 py-2">
              <label className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute start-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
                <TextInput
                  data-testid="class-editor-search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t("common.search")}
                  aria-label={t("common.search")}
                  className="h-8 bg-panel ps-7"
                />
              </label>
              <button
                type="button"
                data-testid="class-editor-blank"
                aria-label={t("class.blank")}
                title={t("class.blank")}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-line bg-panel hover:bg-panel-2"
                onClick={applyBlank}
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            {groupsKnown.length ? (
              <div className="border-b border-line px-3 py-2">
                <select
                  aria-label={t("class.parent")}
                  className="h-8 w-full rounded-md border border-line bg-panel px-2 text-xs"
                  value={group}
                  onChange={(event) => setGroup(event.target.value)}
                >
                  <option value="">{t("class.fromDataset")}</option>
                  {groupsKnown.map((id) => (
                    <option key={id} value={id}>{groupLabel(id)}</option>
                  ))}
                </select>
              </div>
            ) : null}
            <div className="scroll-thin min-h-0 flex-1 overflow-auto p-1.5">
              {visible.length === 0 ? (
                <p className="px-2 py-6 text-center text-xs text-muted">{classes.length ? t("class.noMatch") : t("class.emptyDataset")}</p>
              ) : grouped.map((bucket) => (
                <div key={bucket.id || "_"} className="mb-1">
                  {grouped.length > 1 || bucket.id ? (
                    <p className="px-2 pb-1 pt-1.5 text-[10px] font-medium uppercase tracking-wide text-muted">{groupLabel(bucket.id)}</p>
                  ) : null}
                  {bucket.rows.map((row) => {
                    const Icon = classGlyph(row.icon?.name);
                    const selected = draft.cloneFrom === row.id;
                    return (
                      <div
                        key={row.id}
                        className={cn(
                          "group relative flex items-center rounded-md",
                          selected ? "bg-panel ring-1 ring-accent" : "hover:bg-panel",
                        )}
                      >
                        <button
                          type="button"
                          data-testid={`class-editor-row-${row.id}`}
                          className="flex min-w-0 flex-1 items-center gap-2 py-1.5 pe-8 ps-2 text-start"
                          onClick={() => applyClone(row)}
                        >
                          <span className="h-2.5 w-2.5 shrink-0 rounded-sm border border-line" style={{ background: row.color }} />
                          <Icon className="h-3.5 w-3.5 shrink-0 text-muted" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] leading-4">{displayTitle(row, i18n.language)}</span>
                            <span className="block truncate font-mono text-[10px] leading-4 text-muted">{row.id} · {row.count || 0}</span>
                          </span>
                        </button>
                        <button
                          type="button"
                          data-testid={`class-editor-clone-${row.id}`}
                          aria-label={t("class.clone")}
                          title={t("class.clone")}
                          className="absolute end-1 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-muted hover:bg-panel-2 hover:text-ink"
                          onClick={() => applyClone(row)}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </aside>
          <section className="scroll-thin min-h-0 overflow-auto p-4">
            <div className="mb-4 flex items-center gap-3">
              <span className="text-[11px] font-medium uppercase tracking-wide text-muted">{t("class.preview")}</span>
              <span className="inline-flex h-7 max-w-full items-center gap-1.5 rounded-full border border-line bg-panel-2 px-2.5 text-xs">
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: draft.color }} />
                <PreviewIcon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{previewTitle}</span>
                {draft.hotkey ? <kbd className="rounded bg-panel px-1 font-mono text-[10px] text-muted">{draft.hotkey}</kbd> : null}
              </span>
            </div>
            {draft.cloneFrom ? (
              <p className="mb-3 rounded-md border border-line bg-panel-2 px-3 py-2 text-xs text-muted">{t("class.clonedFrom", { id: draft.cloneFrom })}</p>
            ) : null}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel>{t("class.addKey")}</FieldLabel>
                <TextInput
                  data-testid="class-editor-key"
                  value={draft.key}
                  onChange={(event) => setDraft((prev) => ({ ...prev, key: event.target.value, keyLocked: true }))}
                  aria-label={t("class.addKey")}
                  autoComplete="off"
                  spellCheck={false}
                />
                {draft.key && !validKey ? <p className="mt-1 text-[11px] text-danger">{t("class.badKey")}</p> : null}
                {draft.key && validKey && duplicate ? <p className="mt-1 text-[11px] text-danger">{t("class.duplicate")}</p> : null}
              </div>
              <div>
                <FieldLabel>{t("class.display")}</FieldLabel>
                <TextInput
                  ref={titleRef}
                  data-testid="class-editor-title"
                  value={draft.title}
                  onChange={(event) => {
                    const value = event.target.value;
                    setDraft((prev) => {
                      const next = { ...prev, title: value };
                      if (!prev.titleEn || prev.titleEn === prev.title) next.titleEn = value;
                      if (!prev.keyLocked) {
                        const slug = slugFromTitle(value);
                        next.key = slug ? uniqueClassKey(slug, usedKeys) : "";
                      }
                      return next;
                    });
                  }}
                  aria-label={t("class.display")}
                />
              </div>
              <div>
                <FieldLabel>{t("class.titleEn")}</FieldLabel>
                <TextInput
                  value={draft.titleEn}
                  onChange={(event) => setDraft((prev) => ({ ...prev, titleEn: event.target.value }))}
                  aria-label={t("class.titleEn")}
                />
              </div>
              <div>
                <FieldLabel>{t("class.detail")}</FieldLabel>
                <TextInput
                  value={draft.detail}
                  onChange={(event) => setDraft((prev) => ({ ...prev, detail: event.target.value }))}
                  aria-label={t("class.detail")}
                />
              </div>
            </div>
            <div className="mt-3">
              <FieldLabel>{t("class.color")}</FieldLabel>
              <div className="flex flex-wrap items-center gap-1.5">
                {CLASS_SWATCHES.map((color) => (
                  <button
                    key={color}
                    type="button"
                    aria-label={color}
                    aria-pressed={draft.color.toLowerCase() === color.toLowerCase()}
                    className={cn(
                      "h-6 w-6 rounded-md border border-line",
                      draft.color.toLowerCase() === color.toLowerCase() && "ring-2 ring-ink ring-offset-1 ring-offset-panel",
                    )}
                    style={{ background: color }}
                    onClick={() => setDraft((prev) => ({ ...prev, color }))}
                  />
                ))}
                <input
                  aria-label={t("class.palette")}
                  type="color"
                  value={/^#[0-9a-fA-F]{6}$/.test(draft.color) ? draft.color : "#3dd68c"}
                  onChange={(event) => setDraft((prev) => ({ ...prev, color: event.target.value }))}
                  className="h-7 w-10 cursor-pointer bg-transparent"
                />
              </div>
            </div>
            <div className="mt-3">
              <FieldLabel>{t("class.icon")}</FieldLabel>
              <div className="grid max-w-md grid-cols-8 gap-1">
                {CLASS_ICONS.map(({ name, Icon }) => (
                  <button
                    key={name}
                    type="button"
                    aria-label={name}
                    aria-pressed={draft.icon === name}
                    className={cn(
                      "inline-flex h-8 w-8 items-center justify-center rounded-md border border-line hover:bg-panel-2",
                      draft.icon === name && "border-accent bg-accent text-accent-ink hover:bg-accent",
                    )}
                    onClick={() => setDraft((prev) => ({ ...prev, icon: name }))}
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <FieldLabel>{t("class.hotkey")}</FieldLabel>
                <TextInput
                  value={draft.hotkey}
                  maxLength={1}
                  onChange={(event) => setDraft((prev) => ({ ...prev, hotkey: event.target.value.slice(0, 1) }))}
                  onKeyDown={onHotkeyDown}
                  placeholder={t("class.pressKey")}
                  aria-label={t("class.hotkey")}
                  className="font-mono"
                />
                {hotOwner ? <p className="mt-1 text-[11px] text-danger">{t("class.hotTaken", { id: hotOwner.id })}</p> : null}
              </div>
              <div>
                <FieldLabel>{t("class.parent")}</FieldLabel>
                <select
                  aria-label={t("class.parent")}
                  className="h-8 w-full rounded-md border border-line bg-panel-2 px-2 text-sm"
                  value={draft.parent}
                  onChange={(event) => setDraft((prev) => ({ ...prev, parent: event.target.value }))}
                >
                  <option value="">{t("class.groupNone")}</option>
                  {classes.map((row) => (
                    <option key={row.id} value={row.id}>{displayTitle(row, i18n.language)} ({row.id})</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-3">
              <FieldLabel>{t("class.attrs")}</FieldLabel>
              <TextInput
                value={draft.attrs}
                onChange={(event) => setDraft((prev) => ({ ...prev, attrs: event.target.value }))}
                aria-label={t("class.attrs")}
                placeholder={t("class.attrsHint")}
              />
              {attrChips.length ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {attrChips.map((item) => {
                    const on = splitAttrs(draft.attrs).some((entry) => entry.toLowerCase() === item.toLowerCase());
                    return (
                      <button
                        key={item}
                        type="button"
                        className={cn(
                          "h-6 max-w-full truncate rounded-full border px-2 text-[11px]",
                          on ? "border-accent bg-panel text-ink" : "border-line text-muted hover:bg-panel-2",
                        )}
                        onClick={() => toggleAttr(item)}
                      >
                        {item}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
            {error ? <p className="mt-3 text-xs text-danger">{error}</p> : null}
          </section>
        </div>
        <footer className="flex items-center justify-end gap-2 border-t border-line px-4 py-3">
          <TextButton label={t("common.cancel")} onClick={onClose} />
          <TextButton
            testId="class-editor-create"
            label={t("class.create")}
            tone="accent"
            disabled={!canCreate}
            onClick={create}
          />
        </footer>
      </div>
    </Modal>
  );
}
