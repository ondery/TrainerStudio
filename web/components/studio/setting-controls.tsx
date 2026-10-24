"use client";

import type { ReactNode } from "react";
import * as Switch from "@radix-ui/react-switch";
import { Check } from "lucide-react";
import { TextInput } from "@/components/ui";
import { cn } from "@/lib/utils";

export function SettingSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="col-span-2 grid grid-cols-2 items-end gap-x-3 gap-y-2 border-t border-line pt-2 first:border-0 first:pt-0">
      <h3 className="col-span-2 text-[11px] font-semibold uppercase tracking-wide text-muted">{title}</h3>
      {children}
    </section>
  );
}

export function SettingsStack({ children }: { children: ReactNode }) {
  return <div className="flex w-full max-w-[44rem] flex-col gap-6">{children}</div>;
}

export function SettingsCard({ children }: { children: ReactNode }) {
  return (
    <div className="divide-y divide-line overflow-hidden rounded-lg border border-line bg-panel-2">
      {children}
    </div>
  );
}

export function SettingsForm({ children }: { children: ReactNode }) {
  return (
    <SettingsStack>
      <SettingsCard>{children}</SettingsCard>
    </SettingsStack>
  );
}

export function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted">{title}</h3>
      <SettingsCard>{children}</SettingsCard>
    </section>
  );
}

export function SettingsNote({ children, title }: { children: ReactNode; title?: string }) {
  return <p className="px-1 text-[13px] leading-5 text-muted" title={title}>{children}</p>;
}

export function SettingsInset({ children }: { children: ReactNode }) {
  return <div className="px-3 py-2.5">{children}</div>;
}

export function SettingRow({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex min-h-11 items-center gap-4 px-3 py-2.5 transition-colors duration-[140ms] hover:bg-panel">
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium leading-5" title={label}>{label}</div>
        {hint ? <p className="mt-0.5 text-[11px] leading-4 text-muted">{hint}</p> : null}
      </div>
      <div className="flex shrink-0 items-center justify-end">{children}</div>
    </div>
  );
}

export function SettingToggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <SettingRow label={label} hint={hint}>
      <Switch.Root
        checked={checked}
        onCheckedChange={onChange}
        aria-label={label}
        className="h-5 w-9 shrink-0 rounded-full bg-line transition-colors duration-[140ms] data-[state=checked]:bg-accent"
      >
        <Switch.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-white transition-transform duration-[140ms] data-[state=checked]:translate-x-4 rtl:data-[state=checked]:-translate-x-4" />
      </Switch.Root>
    </SettingRow>
  );
}

export function SettingNum({
  label,
  hint,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <SettingRow label={label} hint={hint}>
      <TextInput
        aria-label={label}
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-7 w-[4.5rem] text-end tabular-nums"
      />
    </SettingRow>
  );
}

export function SettingColor({ label, hint, value, onChange, testId }: { label: string; hint?: string; value: string; onChange: (value: string) => void; testId?: string }) {
  return (
    <SettingRow label={label} hint={hint}>
      <label className="relative h-7 w-7 shrink-0 cursor-pointer overflow-hidden rounded border border-line" title={value}>
        <span className="block h-full w-full" style={{ background: value }} />
        <input
          data-testid={testId}
          aria-label={label}
          type="color"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
    </SettingRow>
  );
}

export function SettingSelect({
  label,
  hint,
  value,
  options,
  onChange,
}: {
  label: string;
  hint?: string;
  value: string;
  options: { id: string; label: string; disabled?: boolean }[];
  onChange: (value: string) => void;
}) {
  return (
    <SettingRow label={label} hint={hint}>
      <select
        aria-label={label}
        className="h-7 w-44 max-w-[16rem] rounded-md border border-line bg-panel px-2 text-[13px]"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.id} value={option.id} disabled={option.disabled}>{option.label}</option>
        ))}
      </select>
    </SettingRow>
  );
}

export function SettingText({
  label,
  hint,
  value,
  onChange,
  readOnly,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
}) {
  return (
    <SettingRow label={label} hint={hint}>
      <TextInput
        aria-label={label}
        value={value}
        readOnly={readOnly}
        onChange={(event) => onChange?.(event.target.value)}
        className="h-7 w-[18rem] max-w-[min(18rem,42vw)]"
      />
    </SettingRow>
  );
}

export function SettingsSlider({
  label,
  hint,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  format?: (value: number) => string;
}) {
  const shown = format ? format(value) : String(value);
  return (
    <SettingRow label={label} hint={hint}>
      <div className="flex items-center gap-2">
        <input
          aria-label={label}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
          className="h-7 w-32 accent-[var(--accent)]"
        />
        <span className="w-10 shrink-0 text-end text-[11px] tabular-nums text-muted">{shown}</span>
      </div>
    </SettingRow>
  );
}

function SegmentedButtons({
  label,
  value,
  options,
  onChange,
  testId,
  compact,
}: {
  label: string;
  value: string;
  options: { id: string; label: string; title?: string }[];
  onChange: (id: string) => void;
  testId?: string;
  compact?: boolean;
}) {
  return (
    <div data-testid={testId} role="radiogroup" aria-label={label} className="inline-flex max-w-full flex-wrap gap-0.5 rounded-md border border-line bg-panel p-0.5">
      {options.map((option) => {
        const on = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            role="radio"
            aria-checked={on}
            data-checked={on ? "1" : "0"}
            title={option.title || option.label}
            className={cn(
              "inline-flex h-7 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded px-2 text-xs transition-colors duration-[140ms]",
              on ? "bg-accent text-accent-ink" : "text-muted hover:bg-panel-2 hover:text-ink",
            )}
            onClick={() => onChange(option.id)}
          >
            {!compact && on ? <Check className="h-3.5 w-3.5 shrink-0" /> : null}
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function SettingsSegmented({
  label,
  hint,
  value,
  options,
  onChange,
  testId,
}: {
  label: string;
  hint?: string;
  value: string;
  options: { id: string; label: string; title?: string }[];
  onChange: (id: string) => void;
  testId?: string;
}) {
  return (
    <SettingRow label={label} hint={hint}>
      <SegmentedButtons compact label={label} value={value} options={options} onChange={onChange} testId={testId} />
    </SettingRow>
  );
}

export function Segmented({
  label,
  value,
  options,
  onChange,
  testId,
}: {
  label: string;
  value: string;
  options: { id: string; label: string; title?: string }[];
  onChange: (id: string) => void;
  testId?: string;
}) {
  return (
    <div className="col-span-2 grid gap-1">
      <span className="text-[11px] text-muted">{label}</span>
      <SegmentedButtons label={label} value={value} options={options} onChange={onChange} testId={testId} />
    </div>
  );
}

export function openZoomChoices(t: (key: string) => string) {
  return [
    { id: "fit", label: t("zoom.short.fit"), title: t("view.fit") },
    { id: "fill", label: t("zoom.short.fill"), title: t("zoom.fill") },
    { id: "100", label: t("m.zoom100"), title: t("m.zoom100") },
    { id: "keep", label: t("zoom.short.keep"), title: t("zoom.keep") },
    { id: "size", label: t("zoom.short.size"), title: t("zoom.sizeKeep") },
  ];
}

export function SliderField({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  format?: (value: number) => string;
}) {
  const shown = format ? format(value) : String(value);
  return (
    <label className="col-span-1 grid gap-1 text-xs">
      <span className="flex items-center justify-between gap-2">
        <span className="min-w-0 whitespace-normal text-muted">{label}</span>
        <span className="shrink-0 tabular-nums text-ink">{shown}</span>
      </span>
      <input aria-label={label} type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}
