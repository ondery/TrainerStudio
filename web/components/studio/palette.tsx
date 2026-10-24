"use client";

import { Command } from "cmdk";
import { useTranslation } from "react-i18next";
import { LOCALES, applyLocale } from "@/lib/i18n";
import { useStudio } from "@/lib/store";
import { classTitle } from "./lists";

export function Palette() {
  const { t, i18n } = useTranslation();
  const open = useStudio((state) => state.ui.palette);
  const patchUi = useStudio((state) => state.patchUi);
  const classes = useStudio((state) => state.classes);
  const setActiveClass = useStudio((state) => state.setActiveClass);
  const setTool = useStudio((state) => state.setTool);
  if (!open) return null;
  const close = () => patchUi({ palette: false });
  const go = (fn: () => void) => {
    fn();
    close();
  };
  return (
    <Command.Dialog open onOpenChange={(next) => patchUi({ palette: next })} label={t("palette.placeholder")} data-testid="command-palette">
      <Command.Input placeholder={t("palette.placeholder")} />
      <Command.List>
        <Command.Empty>{t("welcome.empty")}</Command.Empty>
        <Command.Group heading={t("tabs.classes")}>
          {classes.map((row) => (
            <Command.Item key={row.id} value={`${row.id} ${row.title} ${row.titleEn}`} onSelect={() => go(() => setActiveClass(row.id))}>
              <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: row.color }} />
              <span className="truncate">{classTitle(row, i18n.language)}</span>
            </Command.Item>
          ))}
        </Command.Group>
        <Command.Group heading={t("palette.language")}>
          {LOCALES.map((item) => (
            <Command.Item key={item.code} value={item.name} onSelect={() => go(() => applyLocale(item.code))}>
              {item.name}
            </Command.Item>
          ))}
        </Command.Group>
        <Command.Group heading={t("tools.select")}>
          <Command.Item onSelect={() => go(() => setTool("select"))}>{t("tools.select")}</Command.Item>
          <Command.Item onSelect={() => go(() => setTool("bbox"))}>{t("tools.bbox")}</Command.Item>
          <Command.Item onSelect={() => go(() => setTool("polygon"))}>{t("tools.polygon")}</Command.Item>
          <Command.Item onSelect={() => go(() => setTool("pose"))}>{t("tools.pose")}</Command.Item>
          <Command.Item onSelect={() => go(() => setTool("obb"))}>{t("tools.obb")}</Command.Item>
          <Command.Item onSelect={() => go(() => setTool("sam"))}>{t("tools.sam")}</Command.Item>
          <Command.Item onSelect={() => go(() => patchUi({ dialog: "export" }))}>{t("top.export")}</Command.Item>
          <Command.Item onSelect={() => go(() => patchUi({ dialog: "settings" }))}>{t("top.settings")}</Command.Item>
          <Command.Item onSelect={() => go(() => patchUi({ dialog: "schema" }))}>{t("schema.title")}</Command.Item>
          <Command.Item onSelect={() => go(() => patchUi({ dialog: "jobs" }))}>{t("top.jobs")}</Command.Item>
          <Command.Item onSelect={() => go(() => patchUi({ dialog: "qc" }))}>{t("top.qc")}</Command.Item>
          <Command.Item onSelect={() => go(() => patchUi({ dialog: "shortcuts" }))}>{t("top.shortcuts")}</Command.Item>
          <Command.Item onSelect={() => go(() => patchUi({ dialog: "history" }))}>{t("top.history")}</Command.Item>
        </Command.Group>
      </Command.List>
    </Command.Dialog>
  );
}
