"use client";

import { Command } from "cmdk";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { runCommand } from "@/lib/commands";
import { LOCALES, applyLocale } from "@/lib/i18n";
import { popOverlay, pushOverlay } from "@/lib/overlay";
import { useCommandCatalog } from "@/lib/registry";
import { formatCombo, loadShortcuts } from "@/lib/shortcuts";
import { useStudio } from "@/lib/store";
import { classTitle } from "./lists";

export function Palette() {
  const { t, i18n } = useTranslation();
  const open = useStudio((state) => state.ui.palette);
  const patchUi = useStudio((state) => state.patchUi);
  const classes = useStudio((state) => state.classes);
  const setActiveClass = useStudio((state) => state.setActiveClass);
  const catalog = useCommandCatalog();
  useEffect(() => {
    if (!open) return undefined;
    pushOverlay({
      id: "command-palette",
      close: () => patchUi({ palette: false }),
      dismissPointer: false,
    });
    return () => popOverlay("command-palette");
  }, [open, patchUi]);
  if (!open) return null;
  const close = () => patchUi({ palette: false });
  const go = (fn: () => void) => {
    fn();
    close();
  };
  const shortcuts = loadShortcuts();
  const groups = new Map<string, typeof catalog.commands>();
  for (const command of catalog.commands) {
    if (command.category === "plugin") continue;
    const list = groups.get(command.category) || [];
    list.push(command);
    groups.set(command.category, list);
  }
  const plugins = catalog.commands.filter((command) => command.category === "plugin");
  return (
    <Command.Dialog
      open
      onOpenChange={(next) => patchUi({ palette: next })}
      label={t("palette.placeholder")}
      data-testid="command-palette"
    >
      <Command.Input placeholder={t("palette.placeholder")} />
      <Command.List>
        <Command.Empty>{t("welcome.empty")}</Command.Empty>
        <Command.Group heading={t("tabs.classes")}>
          {classes.map((row) => (
            <Command.Item
              key={row.id}
              value={`${row.id} ${row.title} ${row.titleEn}`}
              onSelect={() => go(() => setActiveClass(row.id))}
            >
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
        {[...groups.entries()].map(([category, rows]) => (
          <Command.Group key={category} heading={t(`palette.group.${category}`, { defaultValue: t("palette.commands") })}>
            {rows.map((command) => (
              <Command.Item
                key={command.id}
                value={`${command.id} ${t(command.titleKey, { defaultValue: command.title || command.id })}`}
                onSelect={() => go(() => runCommand(command.id))}
              >
                <span className="min-w-0 flex-1 truncate">{t(command.titleKey, { defaultValue: command.title || command.id })}</span>
                {command.shortcut ? (
                  <span className="ms-3 shrink-0 text-[11px] text-muted">{formatCombo(shortcuts[command.shortcut])}</span>
                ) : null}
              </Command.Item>
            ))}
          </Command.Group>
        ))}
        {plugins.length ? (
          <Command.Group heading={t("menu.plugins")}>
            {plugins.map((command) => (
              <Command.Item
                key={command.id}
                value={`${command.id} ${command.title || command.titleKey}`}
                data-testid={`palette-${command.id}`}
                onSelect={() => go(() => runCommand(command.id))}
              >
                <span className="truncate">{command.title || t(command.titleKey, { defaultValue: command.id })}</span>
              </Command.Item>
            ))}
          </Command.Group>
        ) : null}
      </Command.List>
    </Command.Dialog>
  );
}
