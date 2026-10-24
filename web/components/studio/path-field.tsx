"use client";

import { FileSearch, FolderOpen } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Tip, TextInput } from "@/components/ui";
import { appearance } from "@/lib/appearance";
import { browse, claimDrop, recentPaths, releaseDrop, type PathFilter } from "@/lib/browse";
import { useStudio } from "@/lib/store";

export function PathField({
  value,
  onChange,
  label,
  filters,
  testId,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  filters?: readonly PathFilter[];
  testId: string;
}) {
  const { t } = useTranslation();
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const accept = useCallback((path: string) => onChangeRef.current(path), []);
  const pick = (kind: "folder" | "file") => {
    void browse(kind, filters, label, value || appearance().dataDir)
      .then((path) => {
        if (path) onChange(path);
      })
      .catch((error: Error) => useStudio.getState().setNotice(error.message, "error"));
  };
  return (
    <div className="grid gap-1.5" data-testid={testId}>
      <span className="text-[13px] font-medium leading-5">{label}</span>
      <div className="flex items-center gap-1">
        <TextInput
          className="h-8 min-w-0 flex-1"
          value={value}
          aria-label={label}
          onChange={(event) => onChange(event.target.value)}
          onFocus={() => claimDrop(accept)}
          onBlur={() => releaseDrop(accept)}
        />
        <Tip label={t("browse.folder")}>
          <button
            type="button"
            data-testid={`${testId}-folder`}
            aria-label={t("browse.folder")}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted hover:bg-panel-2 hover:text-ink"
            onClick={() => pick("folder")}
          >
            <FolderOpen className="h-4 w-4" />
          </button>
        </Tip>
        <Tip label={t("browse.file")}>
          <button
            type="button"
            data-testid={`${testId}-file`}
            aria-label={t("browse.file")}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted hover:bg-panel-2 hover:text-ink"
            onClick={() => pick("file")}
          >
            <FileSearch className="h-4 w-4" />
          </button>
        </Tip>
      </div>
    </div>
  );
}

export function RecentPaths({ onPick, hideEmpty, exclude }: { onPick: (path: string) => void; hideEmpty?: boolean; exclude?: Set<string> }) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<string[]>([]);
  useEffect(() => {
    const sync = () => setRows(recentPaths());
    sync();
    window.addEventListener("studio-recent", sync);
    return () => window.removeEventListener("studio-recent", sync);
  }, []);
  const visible = rows.filter((root) => !exclude?.has(root));
  if (!visible.length) {
    if (hideEmpty) return null;
    return <p data-testid="recent-projects" className="truncate text-[13px] text-muted">{t("welcome.empty")}</p>;
  }
  return (
    <div data-testid="recent-projects" className="contents">
      {visible.map((root) => {
        const parts = root.replace(/[\\/]+$/, "").split(/[\\/]/);
        const name = parts[parts.length - 1] || root;
        return (
          <button
            key={root}
            type="button"
            title={root}
            onClick={() => onPick(root)}
            className="flex min-h-12 w-full items-center gap-3 rounded-md px-2 py-2 text-start hover:bg-panel-2"
          >
            <FolderOpen className="h-4 w-4 shrink-0 text-accent" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium">{name}</span>
              <span className="mt-0.5 block truncate text-[11px] text-muted">{root}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
