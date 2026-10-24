"use client";

import { useEffect, useRef, useState } from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import { useTranslation } from "react-i18next";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  FolderOpen,
  Images,
  RotateCcw,
  SquareStack,
  X,
  type LucideIcon,
} from "lucide-react";
import { api } from "@/lib/api";
import { useStudio } from "@/lib/store";
import {
  canCloseOthers,
  canCloseToRight,
  canReopenTab,
  closeAllTabs,
  closeOtherTabs,
  closeTab,
  closeTabsToRight,
  reopenClosedTab,
  useTabs,
} from "@/lib/tabs";
import { cn } from "@/lib/utils";

const itemClass = "flex h-7 w-full items-center gap-2 whitespace-nowrap rounded-sm px-3 text-[13px] leading-none outline-none data-[highlighted]:bg-panel-2 data-[disabled]:opacity-40";

function joinPath(root: string, rel: string) {
  const slash = root.includes("\\") && !root.includes("/") ? "\\" : "/";
  return `${root.replace(/[\\/]+$/, "")}${slash}${rel.replace(/^[\\/]+/, "")}`;
}

export function ImageTabs() {
  const { t, i18n } = useTranslation();
  const tabs = useTabs();
  const imageId = useStudio((state) => state.editor.imageId);
  const images = useStudio((state) => state.images);
  const project = useStudio((state) => state.project);
  const rtl = i18n.dir() === "rtl";
  const reopen = canReopenTab();
  const scroller = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState({ start: false, end: false });

  function measureOverflow() {
    const node = scroller.current;
    if (!node) return;
    const max = Math.max(0, node.scrollWidth - node.clientWidth);
    const left = Math.abs(node.scrollLeft);
    setOverflow({ start: left > 1, end: left < max - 1 });
  }

  function shiftTabs(direction: -1 | 1) {
    const node = scroller.current;
    if (!node) return;
    const delta = Math.max(160, Math.round(node.clientWidth * 0.5)) * direction;
    node.scrollBy({ left: rtl ? -delta : delta });
  }

  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    measureOverflow();
    const frame = window.requestAnimationFrame(measureOverflow);
    const observer = new ResizeObserver(measureOverflow);
    observer.observe(node);
    node.addEventListener("scroll", measureOverflow, { passive: true });
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      event.preventDefault();
      node.scrollLeft += event.deltaY;
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      node.removeEventListener("scroll", measureOverflow);
      node.removeEventListener("wheel", onWheel);
    };
  }, [tabs.length]);

  useEffect(() => {
    const root = scroller.current;
    const tab = root?.querySelector('[data-active="1"]');
    if (!root || !(tab instanceof HTMLElement)) return;
    const tabBox = tab.getBoundingClientRect();
    const rootBox = root.getBoundingClientRect();
    if (tabBox.left < rootBox.left) root.scrollLeft -= rootBox.left - tabBox.left + 8;
    else if (tabBox.right > rootBox.right) root.scrollLeft += tabBox.right - rootBox.right + 8;
  }, [imageId, tabs.length]);

  if (!tabs.length && !reopen) return null;

  function copyText(value: string) {
    if (!value) return;
    void navigator.clipboard.writeText(value);
  }

  function revealFile(id: string) {
    if (!project) return;
    const image = images.find((row) => row.id === id);
    const path = image?.relPath || image?.name;
    if (!path) return;
    void api("/api/fs/reveal", { method: "POST", body: JSON.stringify({ project: project.id, path }) })
      .then(() => useStudio.getState().setNotice(t("explorer.revealed")))
      .catch((error: Error) => useStudio.getState().setNotice(error.message, "error"));
  }

  function revealImages(id: string) {
    void useStudio.getState().openImage(id);
    window.dispatchEvent(new CustomEvent("studio-activity", { detail: "images" }));
    window.dispatchEvent(new CustomEvent("studio-reveal-image", { detail: id }));
  }

  const StartIcon = rtl ? ChevronRight : ChevronLeft;
  const EndIcon = rtl ? ChevronLeft : ChevronRight;
  const overflowing = overflow.start || overflow.end;

  return (
    <div data-testid="image-tabs" className="flex h-8 min-w-0 items-stretch border-b border-line bg-bg text-[13px]">
      <div ref={scroller} className="scroll-none flex min-h-0 min-w-0 flex-1 items-stretch gap-1 overflow-x-auto overflow-y-hidden px-1">
      {!tabs.length ? (
        <ContextMenu.Root>
          <ContextMenu.Trigger asChild>
            <div className="h-full min-w-0 flex-1" />
          </ContextMenu.Trigger>
          <ContextMenu.Portal>
            <ContextMenu.Content data-testid="image-tab-menu" className="z-[90] min-w-56 overflow-hidden rounded-md border border-line bg-panel p-1 text-ink shadow-pop">
              <Row icon={RotateCcw} label={t("tabs.reopen")} onSelect={reopenClosedTab} />
            </ContextMenu.Content>
          </ContextMenu.Portal>
        </ContextMenu.Root>
      ) : null}
      {tabs.map((tab) => {
        const image = images.find((row) => row.id === tab.id);
        const rel = image?.relPath || tab.name;
        const full = project?.root ? joinPath(project.root, rel) : rel;
        const others = canCloseOthers(tab.id);
        const toEdge = canCloseToRight(tab.id, rtl);
        const selected = tab.id === imageId;
        return (
          <ContextMenu.Root key={tab.id}>
            <ContextMenu.Trigger asChild>
              <div
                data-active={selected ? "1" : "0"}
                role="tab"
                aria-selected={selected}
                className={cn(
                  "relative flex h-full max-w-52 shrink-0 cursor-pointer items-center gap-1.5 rounded-t-md px-2.5",
                  selected ? "bg-panel text-ink" : "bg-panel-2 text-muted hover:text-ink",
                )}
                onClick={() => {
                  if (!selected) void useStudio.getState().openImage(tab.id);
                  window.dispatchEvent(new CustomEvent("studio-reveal-image", { detail: tab.id }));
                }}
                onAuxClick={(event) => {
                  if (event.button !== 1) return;
                  event.preventDefault();
                  closeTab(tab.id);
                }}
              >
                {selected ? <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-accent" /> : null}
                <span className="min-w-0 flex-1 truncate">{tab.name}</span>
                <button
                  type="button"
                  aria-label={t("tabs.close")}
                  className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm text-muted hover:bg-panel hover:text-ink"
                  onClick={(event) => {
                    event.stopPropagation();
                    closeTab(tab.id);
                  }}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </ContextMenu.Trigger>
            <ContextMenu.Portal>
              <ContextMenu.Content data-testid="image-tab-menu" className="z-[90] min-w-56 overflow-hidden rounded-md border border-line bg-panel p-1 text-ink shadow-pop">
                <Row icon={X} label={t("tabs.close")} onSelect={() => closeTab(tab.id)} />
                <Row icon={Copy} label={t("tabs.closeOthers")} disabled={!others} onSelect={() => closeOtherTabs(tab.id)} />
                <Row
                  icon={rtl ? ChevronLeft : ChevronRight}
                  label={t(rtl ? "tabs.closeLeft" : "tabs.closeRight")}
                  disabled={!toEdge}
                  onSelect={() => closeTabsToRight(tab.id, rtl)}
                />
                <Row icon={SquareStack} label={t("tabs.closeAll")} onSelect={closeAllTabs} />
                <ContextMenu.Separator className="my-1 h-px bg-line" />
                <Row icon={Copy} label={t("context.copyName")} onSelect={() => copyText(tab.name)} />
                <Row icon={Copy} label={t("tabs.copyPath")} disabled={!full} onSelect={() => copyText(full)} />
                <Row icon={Copy} label={t("tabs.copyRelative")} disabled={!rel} onSelect={() => copyText(rel)} />
                <ContextMenu.Separator className="my-1 h-px bg-line" />
                <Row icon={FolderOpen} label={t("explorer.reveal")} disabled={!project || !rel} onSelect={() => revealFile(tab.id)} />
                <Row icon={Images} label={t("tabs.revealImages")} onSelect={() => revealImages(tab.id)} />
                <ContextMenu.Separator className="my-1 h-px bg-line" />
                <Row icon={RotateCcw} label={t("tabs.reopen")} disabled={!reopen} onSelect={reopenClosedTab} />
              </ContextMenu.Content>
            </ContextMenu.Portal>
          </ContextMenu.Root>
        );
      })}
      </div>
      {overflowing ? (
        <div className="flex shrink-0 items-stretch border-s border-line">
          <button
            type="button"
            aria-label={t("tabs.scrollStart")}
            title={t("tabs.scrollStart")}
            disabled={!overflow.start}
            className="flex h-full w-6 items-center justify-center text-muted hover:bg-panel-2 hover:text-ink disabled:pointer-events-none disabled:opacity-25"
            onClick={() => shiftTabs(-1)}
          >
            <StartIcon className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label={t("tabs.scrollEnd")}
            title={t("tabs.scrollEnd")}
            disabled={!overflow.end}
            className="flex h-full w-6 items-center justify-center text-muted hover:bg-panel-2 hover:text-ink disabled:pointer-events-none disabled:opacity-25"
            onClick={() => shiftTabs(1)}
          >
            <EndIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}
    </div>
  );
}

function Row({ icon: Icon, label, disabled, onSelect }: { icon: LucideIcon; label: string; disabled?: boolean; onSelect: () => void }) {
  return (
    <ContextMenu.Item disabled={disabled} onSelect={onSelect} className={itemClass}>
      <Icon className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </ContextMenu.Item>
  );
}
