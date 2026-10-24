"use client";

import { create } from "zustand";
import { api } from "./api";
import { appearance } from "./appearance";
import { rememberPath } from "./browse";
import { flaggedSet, reviewedSet } from "./flags";
import { nextId } from "./nav";
import { beginRun, cancelKind, failRun, finishRun, saveEpoch, settleSaves } from "./runline";
import type { Annotation, ClassRow, Field, ImageRow, Project, Tool } from "./types";
import { uid } from "./utils";

export type HistoryEntry = { label: string; annotations: Annotation[] };

type Editor = {
  imageId: string | null;
  width: number;
  height: number;
  annotations: Annotation[];
  selected: string[];
  past: HistoryEntry[];
  future: HistoryEntry[];
  anchor: number;
  imageAttributes: Record<string, string | number | boolean | string[]>;
  dirty: boolean;
  holdSave: boolean;
};

type Ui = {
  tool: Tool;
  activeClass: string | null;
  theme: "dark" | "light";
  filter: "all" | "unlabeled" | "labeled" | "review" | "flagged" | "reviewed";
  query: string;
  classFilter: string | null;
  classPopup: boolean;
  autoAdvance: boolean;
  crosshair: boolean;
  askClass: boolean;
  samModel: string;
  samDevice: "cpu" | "cuda";
  palette: boolean;
  dialog: "" | "settings" | "schema" | "export" | "jobs" | "qc" | "create" | "shortcuts" | "history" | "open" | "add-class" | "wizard";
};

const emptyEditor = (): Editor => ({
  imageId: null,
  width: 0,
  height: 0,
  annotations: [],
  selected: [],
  past: [],
  future: [],
  anchor: 0,
  imageAttributes: {},
  dirty: false,
  holdSave: false,
});

let timer = 0;
let importPoll = 0;
let flushPromise: Promise<void> = Promise.resolve();

type ImportProgress = { active: boolean; phase: string; done: number; total: number; path: string };

const idleProgress = (): ImportProgress => ({ active: false, phase: "idle", done: 0, total: 0, path: "" });

function scheduleSave(get: () => { flush: () => Promise<void> }) {
  const ms = Math.max(200, Number(appearance().autosaveMs) || 800);
  window.clearTimeout(timer);
  timer = window.setTimeout(() => void get().flush(), ms);
}

export function selectImages(
  images: ImageRow[],
  ui: { filter: "all" | "unlabeled" | "labeled" | "review" | "flagged" | "reviewed"; query: string; classFilter: string | null },
  projectId?: string,
) {
  const flags = projectId ? flaggedSet(projectId) : new Set<string>();
  const reviewed = projectId ? reviewedSet(projectId) : new Set<string>();
  const query = ui.query.trim().toLowerCase();
  const rows = images.filter((row) => {
    if (query && !row.name.toLowerCase().includes(query)) return false;
    if (ui.classFilter && !(row.classIds || []).includes(ui.classFilter)) return false;
    if (ui.filter === "flagged") return flags.has(row.id);
    if (ui.filter === "reviewed") return reviewed.has(row.id);
    if (ui.filter !== "all" && row.status !== ui.filter) return false;
    return true;
  });
  const sort = appearance().imageSort;
  return [...rows].sort((a, b) => {
    if (sort === "count") return b.annCount - a.annCount || a.name.localeCompare(b.name);
    if (sort === "status") return a.status.localeCompare(b.status) || a.name.localeCompare(b.name);
    return a.name.localeCompare(b.name);
  });
}

function watchImport(set: (partial: { importProgress: ImportProgress }) => void) {
  window.clearInterval(importPoll);
  importPoll = window.setInterval(() => {
    void fetch("/api/import/progress")
      .then((response) => response.json())
      .then((body: ImportProgress) => {
        if (body && typeof body.done === "number") set({ importProgress: body });
      })
      .catch(() => undefined);
  }, 200);
}

export const useStudio = create<{
  project: Project | null;
  classes: ClassRow[];
  styleFiles: string[];
  images: ImageRow[];
  fields: Field[];
  editor: Editor;
  ui: Ui;
  notice: string;
  saving: boolean;
  importProgress: ImportProgress;
  loadProjects: () => Promise<{ id: string; name: string; root: string }[]>;
  openPath: (path: string) => Promise<void>;
  createPath: (path: string, name: string, template: string) => Promise<void>;
  closeProject: () => void;
  resumeLatest: () => Promise<void>;
  refresh: (projectId: string) => Promise<void>;
  reloadClasses: () => Promise<void>;
  openImage: (id: string, anchor?: number, discard?: boolean) => Promise<void>;
  setTool: (tool: Tool) => void;
  setActiveClass: (id: string) => void;
  patchUi: (partial: Partial<Ui>) => void;
  notes: { id: string; kind: "error" | "update"; text: string }[];
  setNotice: (text: string, kind?: "status" | "error" | "update") => void;
  dismissNotes: () => void;
  select: (ids: string[]) => void;
  patchAnnotation: (id: string, partial: Partial<Annotation>) => void;
  setImageAttributes: (next: Record<string, string | number | boolean | string[]>) => void;
  commit: (next: Annotation[], name?: string) => void;
  undo: () => void;
  redo: () => void;
  jumpHistory: (index: number) => void;
  flush: (force?: boolean) => Promise<void>;
  step: (direction: 1 | -1) => Promise<void>;
  visibleImages: () => ImageRow[];
}>((set, get) => ({
  project: null,
  classes: [],
  styleFiles: [],
  images: [],
  fields: [],
  editor: emptyEditor(),
  ui: {
    tool: "select",
    activeClass: null,
    theme: "dark",
    filter: "all",
    query: "",
    classFilter: null,
    classPopup: true,
    autoAdvance: false,
    crosshair: true,
    askClass: true,
    samModel: "mobile_sam",
    samDevice: "cpu",
    palette: false,
    dialog: "",
  },
  notice: "",
  notes: [],
  saving: false,
  importProgress: idleProgress(),
  async loadProjects() {
    const body = await api<{ projects: { id: string; name: string; root: string }[] }>("/api/projects");
    return body.projects;
  },
  async openPath(path: string) {
    set({ importProgress: { active: true, phase: "read", done: 0, total: 0, path } });
    watchImport(set);
    try {
      const project = await api<Project>("/api/projects/open", { method: "POST", body: JSON.stringify({ path }) });
      rememberPath(path);
      await get().refresh(project.id);
    } finally {
      window.clearInterval(importPoll);
      set({ importProgress: idleProgress() });
    }
  },
  async createPath(path, name, template) {
    set({ importProgress: { active: true, phase: "read", done: 0, total: 0, path } });
    watchImport(set);
    try {
      const project = await api<Project>("/api/projects", { method: "POST", body: JSON.stringify({ path, name, template }) });
      rememberPath(path);
      await get().refresh(project.id);
    } finally {
      window.clearInterval(importPoll);
      set({ importProgress: idleProgress() });
    }
  },
  closeProject() {
    set({ project: null, classes: [], styleFiles: [], images: [], fields: [], editor: emptyEditor(), notice: "" });
  },
  async resumeLatest() {
    if (get().project || !appearance().rememberImage) return;
    const projects = await get().loadProjects();
    if (get().project || !projects[0]) return;
    await get().refresh(projects[0].id);
  },
  async refresh(projectId) {
    const [project, classes, images, schema] = await Promise.all([
      api<Project>(`/api/projects/${projectId}`),
      api<{ classes: ClassRow[]; styleFiles?: string[] }>(`/api/projects/${projectId}/classes`),
      api<{ images: ImageRow[] }>(`/api/projects/${projectId}/images`),
      api<{ fields: Field[] }>(`/api/projects/${projectId}/schema`),
    ]);
    const active = get().ui.activeClass;
    set({
      project,
      classes: classes.classes,
      styleFiles: classes.styleFiles || [],
      images: images.images,
      fields: schema.fields,
      ui: { ...get().ui, activeClass: active && classes.classes.some((row) => row.id === active) ? active : classes.classes[0]?.id || null },
    });
    const current = get().editor.imageId;
    if (current && images.images.some((row) => row.id === current)) await get().openImage(current, get().editor.anchor);
    else if (images.images[0]) await get().openImage(images.images[0].id, 0);
  },
  async reloadClasses() {
    const project = get().project;
    if (!project) return;
    const classes = await api<{ classes: ClassRow[]; styleFiles?: string[] }>(`/api/projects/${project.id}/classes`);
    const active = get().ui.activeClass;
    set({
      classes: classes.classes,
      styleFiles: classes.styleFiles || [],
      ui: { ...get().ui, activeClass: active && classes.classes.some((row) => row.id === active) ? active : classes.classes[0]?.id || null },
    });
  },
  async openImage(id, anchor, discard) {
    if (discard || get().editor.holdSave) {
      window.clearTimeout(timer);
      set({ editor: { ...get().editor, dirty: false, holdSave: false } });
    } else await get().flush();
    const project = get().project;
    if (!project) return;
    const detail = await api<{ width: number; height: number; annotations: Annotation[]; attributes?: Editor["imageAttributes"] }>(`/api/projects/${project.id}/images/${id}`);
    const visible = get().visibleImages();
    const index = visible.findIndex((row) => row.id === id);
    set({
      editor: {
        ...emptyEditor(),
        imageId: id,
        width: detail.width,
        height: detail.height,
        annotations: detail.annotations,
        imageAttributes: detail.attributes || {},
        anchor: anchor ?? (index >= 0 ? index : 0),
      },
    });
    useDraft.getState().clear();
    queuePrelabel(project.id, id, !detail.annotations.length, detail.width, detail.height);
    const ahead = Math.min(Math.max(0, appearance().prefetch || 0), Math.max(1, appearance().threads || 1));
    for (let step = 1; step <= ahead; step += 1) {
      const next = visible[index + step];
      if (!next || typeof window === "undefined") continue;
      const img = new window.Image();
      img.src = `/api/projects/${project.id}/images/${next.id}/thumb`;
    }
  },
  setTool(tool) {
    set({ ui: { ...get().ui, tool } });
    useDraft.getState().clear();
  },
  setActiveClass(id) {
    set({ ui: { ...get().ui, activeClass: id } });
  },
  patchUi(partial) {
    set({ ui: { ...get().ui, ...partial } });
  },
  setNotice(text, kind = "status") {
    if ((kind === "error" || kind === "update") && text.trim()) {
      set({
        notice: text,
        notes: [{ id: uid(), kind, text: text.trim() }, ...get().notes].slice(0, 12),
      });
      return;
    }
    set({ notice: text });
  },
  dismissNotes() {
    set({ notes: [] });
  },
  select(ids) {
    set({ editor: { ...get().editor, selected: ids } });
  },
  patchAnnotation(id, partial) {
    const editor = get().editor;
    get().commit(editor.annotations.map((row) => (row.id === id ? { ...row, ...partial, updatedAt: new Date().toISOString() } : row)));
  },
  setImageAttributes(next) {
    const editor = get().editor;
    set({ editor: { ...editor, imageAttributes: next, dirty: true } });
    scheduleSave(get);
  },
  commit(next, name = "edit") {
    const editor = get().editor;
    const past = [...editor.past, { label: name, annotations: editor.annotations }].slice(-100);
    const holdSave = name === "prelabel";
    set({ editor: { ...editor, annotations: next, past, future: [], dirty: true, holdSave } });
    if (!holdSave) scheduleSave(get);
  },
  undo() {
    const editor = get().editor;
    const previous = editor.past[editor.past.length - 1];
    if (!previous) return;
    set({
      editor: {
        ...editor,
        annotations: previous.annotations,
        past: editor.past.slice(0, -1),
        future: [{ label: previous.label, annotations: editor.annotations }, ...editor.future].slice(0, 100),
        dirty: true,
        holdSave: false,
      },
    });
    scheduleSave(get);
  },
  redo() {
    const editor = get().editor;
    const next = editor.future[0];
    if (!next) return;
    set({
      editor: {
        ...editor,
        annotations: next.annotations,
        future: editor.future.slice(1),
        past: [...editor.past, { label: next.label, annotations: editor.annotations }].slice(-100),
        dirty: true,
        holdSave: false,
      },
    });
    scheduleSave(get);
  },
  jumpHistory(index) {
    const editor = get().editor;
    const target = editor.past[index];
    if (!target) return;
    const newer = editor.past.slice(index + 1);
    set({
      editor: {
        ...editor,
        annotations: target.annotations,
        past: editor.past.slice(0, index),
        future: [...newer, { label: "edit", annotations: editor.annotations }, ...editor.future].slice(0, 100),
        dirty: true,
        holdSave: false,
      },
    });
    scheduleSave(get);
  },
  async flush(force = false) {
    window.clearTimeout(timer);
    const run = async () => {
      const { project, editor } = get();
      if (!project || !editor.imageId || !editor.dirty) return;
      if (editor.holdSave && !force) return;
      const seen = saveEpoch();
      set({ saving: true });
      try {
        const pending = editor.annotations.some((row) => row.attributes?.review === "pending");
        const saved = await api<{ annotations: Annotation[]; written: boolean; status: string }>(`/api/projects/${project.id}/images/${editor.imageId}`, {
          method: "PUT",
          body: JSON.stringify({
            annotations: editor.annotations,
            attributes: editor.imageAttributes,
            status: pending ? "review" : editor.annotations.length ? "labeled" : "unlabeled",
          }),
        });
        if (get().editor.imageId === editor.imageId) {
          set({ editor: { ...get().editor, annotations: saved.annotations, dirty: false, holdSave: false } });
        }
        const images = get().images.map((row) =>
          row.id === editor.imageId
            ? { ...row, annCount: saved.annotations.length, status: saved.status || (pending ? "review" : "labeled") }
            : row,
        );
        set({ images, notice: "" });
        settleSaves(seen, true);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        settleSaves(seen, false, message);
        set({ notice: message });
      } finally {
        set({ saving: false });
      }
    };
    flushPromise = flushPromise.then(run, run);
    await flushPromise;
  },
  async step(direction) {
    const look = appearance();
    let visible = get().visibleImages();
    const editor = get().editor;
    if (!editor.imageId) return;
    if (look.skipUnlabeled) visible = visible.filter((row) => row.status !== "unlabeled" || row.id === editor.imageId);
    let target = nextId(visible.map((row) => row.id), editor.imageId, editor.anchor, direction);
    if (!target && look.wrapNavigation && visible.length) target = direction > 0 ? visible[0].id : visible[visible.length - 1].id;
    if (!target || target === editor.imageId) return;
    const index = visible.findIndex((row) => row.id === target);
    await get().openImage(target, index);
  },
  visibleImages() {
    const { images, ui, project } = get();
    return selectImages(images, ui, project?.id);
  },
}));

type Draft = {
  points: { x: number; y: number; sign: 1 | 0 }[];
  selected: number;
  popup: { open: boolean; x: number; y: number; shapeId?: string } | null;
  hold: { geometry: Annotation["geometry"] } | null;
  addPoint: (point: { x: number; y: number; sign: 1 | 0 }) => void;
  selectPoint: (index: number) => void;
  removeSelected: () => void;
  clear: () => void;
  openPopup: (x: number, y: number, shapeId?: string) => void;
  closePopup: () => void;
  setHold: (geometry: Annotation["geometry"] | null) => void;
};

export const useDraft = create<Draft>((set, get) => ({
  points: [],
  selected: -1,
  popup: null,
  hold: null,
  addPoint(point) {
    set({ points: [...get().points, point], selected: get().points.length });
  },
  selectPoint(index) {
    set({ selected: index });
  },
  removeSelected() {
    const { points, selected } = get();
    if (selected < 0) {
      set({ points: points.slice(0, -1), selected: -1 });
      return;
    }
    set({ points: points.filter((_, index) => index !== selected), selected: -1 });
  },
  clear() {
    set({ points: [], selected: -1, popup: null, hold: null });
  },
  setHold(geometry) {
    set({ hold: geometry ? { geometry } : null });
  },
  openPopup(x, y, shapeId) {
    set({ popup: { open: true, x, y, shapeId } });
  },
  closePopup() {
    set({ popup: null });
  },
}));

let prelabelToken = 0;
const SCAN_HOLD_MS = 720;

function holdScan(token: number, started: number, fn: () => void) {
  const wait = Math.max(0, SCAN_HOLD_MS - (performance.now() - started));
  window.setTimeout(() => {
    if (token !== prelabelToken) return;
    fn();
  }, wait);
}

function queuePrelabel(projectId: string, imageId: string, empty: boolean, width: number, height: number) {
  cancelKind("scan");
  finishRun("prelabel");
  if (!appearance().prelabelOnOpen || !empty || !(width > 0) || !(height > 0)) return;
  const token = (prelabelToken += 1);
  const look = appearance();
  const started = performance.now();
  beginRun({
    key: "prelabel",
    kind: "scan",
    geometry: { type: "bbox", x: 0, y: 0, width, height },
    classColor: look.accent,
  });
  void api<{ boxes: { classId: string; geometry: Annotation["geometry"]; attributes?: Annotation["attributes"] }[] }>(
    `/api/projects/${projectId}/images/${imageId}/prelabel`,
    {
      method: "POST",
      body: JSON.stringify({
        backend: "ultralytics",
        family: look.trainFamily,
        weights: look.trainWeights || undefined,
        device: look.trainDevice,
        conf: look.prelabelConf,
      }),
    },
  )
    .then((body) => {
      holdScan(token, started, () => {
        if (useStudio.getState().editor.imageId !== imageId) return;
        if (useStudio.getState().editor.annotations.length) {
          finishRun("prelabel");
          return;
        }
        const boxes = body.boxes || [];
        if (!boxes.length) {
          finishRun("prelabel");
          return;
        }
        const added = boxes.map((row) => newAnnotation(imageId, row.classId, row.geometry, { source: "auto", review: "pending", ...(row.attributes || {}) }));
        useStudio.getState().commit(added, "prelabel");
        useStudio.getState().select(added.slice(0, 1).map((row) => row.id));
        finishRun("prelabel");
      });
    })
    .catch((error: Error) => {
      holdScan(token, started, () => {
        failRun("prelabel", error.message);
        useStudio.getState().setNotice(error.message, "error");
      });
    });
}

export function newAnnotation(imageId: string, classId: string, geometry: Annotation["geometry"], attributes: Annotation["attributes"]): Annotation {
  const stamp = new Date().toISOString();
  return { id: uid(), imageId, classId, geometry, attributes, createdAt: stamp, updatedAt: stamp };
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    const { project, editor } = useStudio.getState();
    if (!project || !editor.imageId || !editor.dirty || editor.holdSave) return;
    void fetch(`/api/projects/${project.id}/images/${editor.imageId}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ annotations: editor.annotations }),
      keepalive: true,
    });
  });
}
