"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Copy, Lock } from "lucide-react";
import { api } from "@/lib/api";
import { useAppearance } from "@/lib/appearance";
import { rawLanguage } from "@/lib/monaco-boot";
import { setRawHover } from "@/lib/rawlink";
import { linkLabelLines, liveLabelText, sameLabel, type RawLine } from "@/lib/raw-view";
import { useStudio } from "@/lib/store";

const MonacoView = dynamic(() => import("./monaco-view").then((mod) => mod.MonacoView), { ssr: false });

type RawPayload = {
  imagePath: string;
  labelPath: string;
  labelRel: string;
  labelText: string;
  yamlText?: string;
  lines: RawLine[];
  image: { bytes: number; mtime: string; sha256: string; format: string; mode: string; width: number; height: number; exif: Record<string, string> };
};

export function RawPanel() {
  const { t } = useTranslation();
  const projectId = useStudio((state) => state.project?.id);
  const imageId = useStudio((state) => state.editor.imageId);
  const width = useStudio((state) => state.editor.width);
  const height = useStudio((state) => state.editor.height);
  const annotations = useStudio((state) => state.editor.annotations);
  const selected = useStudio((state) => state.editor.selected);
  const dirty = useStudio((state) => state.editor.dirty);
  const classes = useStudio((state) => state.classes);
  const look = useAppearance();
  const [tab, setTab] = useState<"label" | "json" | "yaml" | "info">("label");
  const [payload, setPayload] = useState<RawPayload | null>(null);
  const [scratch, setScratch] = useState("");

  useEffect(() => {
    if (!projectId || !imageId || dirty) return undefined;
    let cancel = false;
    void api<RawPayload>(`/api/projects/${projectId}/images/${imageId}/raw`)
      .then((body) => {
        if (cancel) return;
        setPayload(body);
        setScratch(body.labelText);
      })
      .catch(() => {
        if (!cancel) setPayload(null);
      });
    return () => {
      cancel = true;
    };
  }, [projectId, imageId, dirty]);

  const indexOf = (classId: string) => {
    const row = classes.find((item) => item.id === classId);
    return row ? row.index : null;
  };
  const live = liveLabelText(annotations, width, height, indexOf);
  const drifted = payload ? !sameLabel(payload.labelText, live) : false;
  const links = useMemo(() => linkLabelLines(payload?.lines || [], annotations), [payload, annotations]);
  const lineFor = useMemo(() => {
    const map = new Map<string, number>();
    for (const [line, id] of Object.entries(links)) map.set(id, Number(line));
    return map;
  }, [links]);
  const jsonText = useMemo(() => JSON.stringify(annotations, null, 2), [annotations]);
  const infoText = useMemo(() => {
    const image = payload?.image;
    const facts = [
      `${t("raw.path")}: ${payload?.imagePath || ""}`,
      `${t("raw.bytes")}: ${image?.bytes ?? ""}`,
      `${t("raw.dimensions")}: ${image ? `${image.width}×${image.height}` : ""}`,
      `${t("raw.format")}: ${image?.format || ""}`,
      `${t("raw.mode")}: ${image?.mode || ""}`,
      `${t("raw.sha256")}: ${image?.sha256 || ""}`,
      `${t("raw.mtime")}: ${image?.mtime || ""}`,
    ];
    for (const [key, value] of Object.entries(image?.exif || {})) facts.push(`${t("raw.exif")} ${key}: ${value}`);
    return facts.join("\n");
  }, [payload, t]);
  const value = tab === "label" ? (look.rawEdit ? scratch : payload?.labelText || "") : tab === "json" ? jsonText : tab === "yaml" ? payload?.yamlText || "" : infoText;
  const revealLine = tab === "label" && selected[0] ? lineFor.get(selected[0]) : undefined;
  const copyText = value;

  const hoverLine = (line: number) => {
    if (tab !== "label") return;
    setRawHover(line ? links[line] || "" : "");
  };
  const pickLine = (line: number) => {
    if (tab !== "label") return;
    const id = links[line];
    if (!id) return;
    useStudio.getState().select([id]);
    setRawHover(id);
  };

  return (
    <div data-testid="raw-panel" className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-1 border-b border-line px-1 py-1">
        {(["label", "json", "yaml", "info"] as const).map((id) => (
          <button key={id} type="button" data-testid={`raw-tab-${id}`} className={`h-7 rounded px-2 text-xs ${tab === id ? "bg-panel-2" : "text-muted"}`} onClick={() => setTab(id)}>
            {t(`raw.${id}`)}
          </button>
        ))}
        <span className="flex-1" />
        <button
          type="button"
          className="inline-flex h-7 items-center gap-1 rounded px-2 text-xs hover:bg-panel-2"
          onClick={() => {
            void navigator.clipboard?.writeText(copyText);
            useStudio.getState().setNotice(t("raw.copied"));
          }}
        >
          <Copy className="h-3.5 w-3.5" />
          {t("raw.copy")}
        </button>
      </div>
      <p className="truncate px-2 pt-1 text-[11px] text-muted" title={tab === "label" ? payload?.labelPath : tab === "yaml" ? "data.yaml" : payload?.imagePath}>
        {t("raw.path")}: {tab === "label" ? payload?.labelPath || payload?.labelRel || "—" : tab === "yaml" ? "data.yaml" : payload?.imagePath || "—"}
      </p>
      <p data-testid="raw-diff" className={`truncate px-2 text-[11px] ${drifted ? "text-warn" : "text-muted"}`}>
        {drifted ? t("raw.diff") : t("raw.saved")}
      </p>
      <MonacoView
        path={`${imageId || "none"}:${tab}`}
        value={value}
        language={rawLanguage(tab)}
        readOnly={tab !== "label" || !look.rawEdit}
        revealLine={revealLine}
        onLine={hoverLine}
        onPick={pickLine}
        onChange={tab === "label" && look.rawEdit ? setScratch : undefined}
      />
      <p className="flex items-center gap-1 border-t border-line px-2 py-1 text-[11px] text-muted">
        <Lock className="h-3 w-3" />
        {t("raw.readonly")}
      </p>
      {look.rawEdit ? <p className="px-2 pb-2 text-[11px] text-muted">{t("raw.scratch")}</p> : <p className="px-2 pb-2 text-[11px] text-muted">{t("raw.editLocked")}</p>}
    </div>
  );
}
