"use client";

import { useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useTranslation } from "react-i18next";
import { useStudio } from "@/lib/store";
import { classTitle } from "./lists";

export function ClassCombo({ value, onChange, label }: { value: string; onChange: (id: string) => void; label: string }) {
  const { i18n } = useTranslation();
  const classes = useStudio((state) => state.classes);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const parent = useRef<HTMLDivElement>(null);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return classes;
    return classes.filter((row) => `${row.id} ${classTitle(row, i18n.language)}`.toLowerCase().includes(needle));
  }, [classes, query, i18n.language]);
  const virtualizer = useVirtualizer({
    count: open ? filtered.length : 0,
    getScrollElement: () => parent.current,
    estimateSize: () => 28,
    overscan: 6,
  });
  const current = classes.find((row) => row.id === value);
  return (
    <div className="relative max-w-full min-w-0" onWheel={(event) => { if (event.target instanceof HTMLSelectElement) event.preventDefault(); }}>
      <button type="button" aria-label={label} aria-expanded={open} data-testid="class-combo-button" className="h-7 max-w-full truncate rounded border border-line bg-panel px-1 text-[11px]" onClick={() => setOpen((flag) => !flag)}>
        {current ? classTitle(current, i18n.language) : label}
      </button>
      {open ? (
        <div className="absolute end-0 z-50 mt-1 w-56 max-w-[calc(100vw-24px)] rounded-md border border-line bg-panel shadow-pop" data-testid="class-combo">
          <input autoFocus aria-label={label} className="h-8 w-full border-b border-line bg-transparent px-2 text-xs" value={query} onChange={(event) => setQuery(event.target.value)} />
          <div ref={parent} className="max-h-56 overflow-auto">
            <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
              {virtualizer.getVirtualItems().map((item) => {
                const row = filtered[item.index];
                return (
                  <button
                    key={row.id}
                    type="button"
                    className="absolute left-0 flex h-7 w-full items-center gap-2 px-2 text-start text-xs hover:bg-panel-2"
                    style={{ transform: `translateY(${item.start}px)` }}
                    onClick={() => {
                      onChange(row.id);
                      setOpen(false);
                      setQuery("");
                    }}
                  >
                    <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: row.color }} />
                    <span className="truncate">{classTitle(row, i18n.language)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
