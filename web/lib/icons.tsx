"use client";

import * as Lucide from "lucide-react";
import type { ComponentType } from "react";

const BANNED = new Set(["Circle", "CircleDot", "Dot"]);

type IconProps = { className?: string; strokeWidth?: number };
type IconCmp = ComponentType<IconProps>;

const pool = Lucide as unknown as Record<string, IconCmp>;

export function Icon({ name, className }: { name?: string; className?: string }) {
  const picked = name && !BANNED.has(name) ? pool[name] : undefined;
  const Cmp = picked || pool.Tag;
  return <Cmp className={className || "h-4 w-4 shrink-0"} strokeWidth={1.75} />;
}

export function classIconName(icon: { kind: string; name?: string } | undefined) {
  if (icon?.kind === "lucide" && icon.name && !BANNED.has(icon.name)) return icon.name;
  return "Tag";
}
