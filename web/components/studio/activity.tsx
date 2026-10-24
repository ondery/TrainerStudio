"use client";

import { useEffect, useState } from "react";
import {
  Boxes,
  FileText,
  FolderTree,
  Layers3,
  Search,
  Settings,
  Sparkles,
  Tags,
  BarChart3,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { loadLayout, shownTabs, type PanelId } from "@/lib/grid";
import { useStudio } from "@/lib/store";
import { cn } from "@/lib/utils";

const ITEMS = [
  { id: "explorer", icon: FolderTree, label: "activity.explorer" },
  { id: "images", icon: Search, label: "activity.search" },
  { id: "classes", icon: Tags, label: "activity.classes" },
  { id: "layers", icon: Layers3, label: "activity.annotations" },
  { id: "stats", icon: BarChart3, label: "activity.stats" },
  { id: "model", icon: Boxes, label: "activity.models" },
  { id: "console", icon: Sparkles, label: "activity.training" },
  { id: "raw", icon: FileText, label: "activity.raw" },
] as const;

function sidebarActivity() {
  const layout = loadLayout();
  const shown = shownTabs(layout.left.root);
  const active = (shown.includes(layout.left.active) ? layout.left.active : shown[0] || (layout.left.tabs.includes(layout.left.active) ? layout.left.active : layout.left.tabs[0])) || "";
  return { active: active as PanelId | "", collapsed: Boolean(layout.left.collapsed) };
}

export function ActivityBar() {
  const { t } = useTranslation();
  const notes = useStudio((state) => state.notes);
  const alerts = notes.filter((note) => note.kind === "error" || note.kind === "update").length;
  const [sidebar, setSidebar] = useState(sidebarActivity);
  useEffect(() => {
    const sync = () => setSidebar(sidebarActivity());
    window.addEventListener("studio-layout-changed", sync);
    return () => window.removeEventListener("studio-layout-changed", sync);
  }, []);
  return (
    <nav data-testid="activity-bar" aria-label={t("activity.explorer")} className="flex h-full min-h-0 w-full flex-col items-center gap-1 overflow-hidden py-1">
      {ITEMS.map((item) => {
        const Icon = item.icon;
        const badge = item.id === "console" ? alerts : 0;
        const current = item.id === sidebar.active;
        return (
          <button
            key={item.id}
            type="button"
            title={t(item.label)}
            aria-label={t(item.label)}
            aria-current={current ? "page" : undefined}
            aria-pressed={current ? !sidebar.collapsed : undefined}
            data-testid={`activity-${item.id}`}
            data-active={current ? "1" : "0"}
            className={cn(
              "relative inline-flex h-9 w-9 items-center justify-center rounded-md text-muted hover:bg-panel-2 hover:text-ink",
              current && "bg-panel-2 text-ink",
            )}
            onClick={() => window.dispatchEvent(new CustomEvent("studio-activity", { detail: item.id }))}
          >
            {current ? <span className="absolute start-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-accent" /> : null}
            <Icon className="h-4 w-4" />
            {badge > 0 ? (
              <span
                data-testid="activity-badge"
                className="absolute end-0.5 top-0.5 min-w-4 rounded-full bg-danger px-1 text-[9px] leading-4 text-white"
                onClick={(event) => {
                  event.stopPropagation();
                  useStudio.getState().dismissNotes();
                }}
              >
                {badge > 99 ? "99+" : badge}
              </span>
            ) : null}
          </button>
        );
      })}
      <span className="flex-1" />
      <button
        type="button"
        title={t("activity.settings")}
        aria-label={t("activity.settings")}
        className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-panel-2"
        onClick={() => useStudio.getState().patchUi({ dialog: "settings" })}
      >
        <Settings className="h-4 w-4" />
      </button>
    </nav>
  );
}
