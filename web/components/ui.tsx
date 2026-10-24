"use client";

import * as Dropdown from "@radix-ui/react-dropdown-menu";
import * as Tooltip from "@radix-ui/react-tooltip";
import * as Dialog from "@radix-ui/react-dialog";
import * as Switch from "@radix-ui/react-switch";
import { forwardRef, useEffect, useRef, useState, type ComponentType, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Grid } from "@/components/studio/grid-view";

export function Tip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          sideOffset={6}
          className="z-[70] max-w-xs rounded-md border border-line bg-panel px-2 py-1 text-xs text-ink shadow-pop"
        >
          {label}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

export function IconButton({
  label,
  active,
  disabled,
  showLabel,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  showLabel?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <Tip label={label}>
      <button
        type="button"
        aria-label={label}
        title={label}
        disabled={disabled}
        onClick={onClick}
        className={cn(
          "inline-flex h-8 min-w-8 max-w-full shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2 text-ink hover:bg-panel-2 disabled:opacity-40",
          active && "bg-accent text-accent-ink hover:bg-accent",
        )}
      >
        {children}
        {showLabel ? <span className="max-w-24 truncate text-xs">{label}</span> : null}
      </button>
    </Tip>
  );
}

export function TextButton({
  label,
  onClick,
  icon: Icon,
  disabled,
  tone,
  testId,
}: {
  label: string;
  onClick?: () => void;
  icon?: ComponentType<{ className?: string }>;
  disabled?: boolean;
  tone?: "accent" | "danger";
  testId?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      title={label}
      data-testid={testId}
      className={cn(
        "inline-flex h-8 max-w-full items-center gap-1.5 whitespace-nowrap rounded-md border border-line bg-panel px-2 text-ink hover:bg-panel-2 disabled:opacity-40",
        tone === "accent" && "border-transparent bg-accent text-accent-ink hover:bg-accent",
        tone === "danger" && "text-danger",
      )}
    >
      {Icon ? <Icon className="h-4 w-4 shrink-0" /> : null}
      <span className="truncate">{label}</span>
    </button>
  );
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return <label className="mb-1 block truncate text-xs text-muted">{children}</label>;
}

export const TextInput = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function TextInput(props, ref) {
  return (
    <input
      {...props}
      ref={ref}
      className={cn(
        "h-8 w-full min-w-0 rounded-md border border-line bg-panel-2 px-2 text-ink outline-none placeholder:text-muted",
        props.className,
      )}
    />
  );
});

export function Menu({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon?: ComponentType<{ className?: string }>;
  children: ReactNode;
}) {
  return (
    <Dropdown.Root>
      <Dropdown.Trigger asChild>
        <button
          type="button"
          title={label}
          className="inline-flex h-8 max-w-full items-center gap-1.5 whitespace-nowrap rounded-md border border-line bg-panel px-2 hover:bg-panel-2"
        >
          {Icon ? <Icon className="h-4 w-4 shrink-0" /> : null}
          <span className="truncate">{label}</span>
        </button>
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content
          sideOffset={6}
          className="z-[70] max-h-[70vh] min-w-44 overflow-auto rounded-md border border-line bg-panel p-1 text-ink shadow-pop"
        >
          {children}
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}

export function MenuItem({ label, onSelect, icon: Icon }: { label: string; onSelect: () => void; icon?: ComponentType<{ className?: string }> }) {
  return (
    <Dropdown.Item
      title={label}
      onSelect={onSelect}
      className="flex h-8 cursor-pointer items-center gap-2 whitespace-nowrap rounded px-2 outline-none data-[highlighted]:bg-panel-2"
    >
      {Icon ? <Icon className="h-4 w-4 shrink-0" /> : null}
      <span className="truncate">{label}</span>
    </Dropdown.Item>
  );
}

export function Modal({
  open,
  title,
  onClose,
  children,
  wide,
  flush,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  flush?: boolean;
}) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const returnTo = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  if (open && !wasOpen.current) {
    const active = document.activeElement;
    if (active instanceof HTMLElement) returnTo.current = active;
  }
  wasOpen.current = open;
  useEffect(() => {
    if (!open) setOffset({ x: 0, y: 0 });
  }, [open]);
  function onDrag(event: ReactPointerEvent) {
    if (event.button !== 0) return;
    const originX = event.clientX - offset.x;
    const originY = event.clientY - offset.y;
    const move = (next: PointerEvent) => setOffset({ x: next.clientX - originX, y: next.clientY - originY });
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }
  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[60] bg-black/45" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-[8vh] z-[60] flex max-h-[84vh] flex-col overflow-hidden rounded-xl border border-line bg-panel text-ink shadow-pop",
            wide ? "w-[min(1040px,calc(100vw-24px))]" : "w-[min(640px,calc(100vw-24px))]",
          )}
          style={{ transform: `translate(calc(-50% + ${offset.x}px), ${offset.y}px)` }}
          onCloseAutoFocus={(event) => {
            const node = returnTo.current;
            if (!node?.isConnected) return;
            event.preventDefault();
            node.focus();
          }}
        >
          <div className="flex h-11 cursor-grab items-center justify-between gap-3 border-b border-line px-4 active:cursor-grabbing" onPointerDown={onDrag}>
            <Dialog.Title className="truncate text-[15px] font-semibold">{title}</Dialog.Title>
            <Dialog.Close className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-panel-2" aria-label="close" onPointerDown={(event) => event.stopPropagation()}>
              ×
            </Dialog.Close>
          </div>
          <div className={cn("min-h-0 flex-1", flush ? "overflow-hidden" : "overflow-auto p-4")}>
            {flush ? children : <Grid cols={12} gap={8} className="[&>*]:col-span-12">{children}</Grid>}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (value: boolean) => void; label: string }) {
  return (
    <label className="flex min-h-8 items-center justify-between gap-3">
      <span className="min-w-0 whitespace-normal" title={label}>{label}</span>
      <Switch.Root
        checked={checked}
        onCheckedChange={onChange}
        className="h-5 w-9 shrink-0 rounded-full bg-line data-[state=checked]:bg-accent"
      >
        <Switch.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-white transition-transform data-[state=checked]:translate-x-4 rtl:data-[state=checked]:-translate-x-4" />
      </Switch.Root>
    </label>
  );
}

export function Provider({ children }: { children: ReactNode }) {
  return (
    <Tooltip.Provider delayDuration={280} skipDelayDuration={120} disableHoverableContent>
      {children}
    </Tooltip.Provider>
  );
}
