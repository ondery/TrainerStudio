"use client";

import { useSyncExternalStore } from "react";

import type { ShortcutAction } from "./shortcuts";

export type CommandCategory =
  | "file"
  | "edit"
  | "view"
  | "image"
  | "tool"
  | "ann"
  | "classes"
  | "tools"
  | "ai"
  | "layout"
  | "ee"
  | "plugin";

export type CommandSpec = {
  id: string;
  titleKey: string;
  title?: string;
  category: CommandCategory;
  shortcut?: ShortcutAction;
  order?: number;
  pluginId?: string;
  run: () => void;
};

export type PluginMenuSpec = {
  pluginId: string;
  id: string;
  title: string;
};

type PrefixHandler = {
  test: (id: string) => boolean;
  run: (id: string) => void;
};

export type CommandCatalog = {
  commands: CommandSpec[];
  menus: PluginMenuSpec[];
};

const commands = new Map<string, CommandSpec>();
const menus: PluginMenuSpec[] = [];
const prefixes: PrefixHandler[] = [];
const listeners = new Set<() => void>();

let snapshot: CommandCatalog = { commands: [], menus: [] };

function publish() {
  snapshot = {
    commands: [...commands.values()].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id)),
    menus: [...menus],
  };
  for (const listener of listeners) listener();
}

export function registerCommand(spec: CommandSpec) {
  commands.set(spec.id, spec);
  publish();
}

export function registerPrefix(test: (id: string) => boolean, run: (id: string) => void) {
  prefixes.push({ test, run });
}

export function getCommand(id: string) {
  return commands.get(id);
}

export function listCommands() {
  return snapshot.commands;
}

export function replacePluginSurface(
  pluginId: string,
  nextCommands: CommandSpec[],
  nextMenus: PluginMenuSpec[],
) {
  for (const [id, spec] of [...commands]) {
    if (spec.pluginId === pluginId) commands.delete(id);
  }
  for (let index = menus.length - 1; index >= 0; index -= 1) {
    if (menus[index].pluginId === pluginId) menus.splice(index, 1);
  }
  for (const spec of nextCommands) commands.set(spec.id, { ...spec, pluginId, category: "plugin" });
  menus.push(...nextMenus.map((menu) => ({ ...menu, pluginId })));
  publish();
}

export function runRegistered(id: string): boolean {
  const spec = commands.get(id);
  if (spec) {
    spec.run();
    return true;
  }
  for (const prefix of prefixes) {
    if (prefix.test(id)) {
      prefix.run(id);
      return true;
    }
  }
  return false;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useCommandCatalog(): CommandCatalog {
  return useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
}
