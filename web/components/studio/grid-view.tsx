"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Shared 12-column form grid. Gap is the 8px baseline unless a caller passes another multiple of 8. */
export function Grid({
  cols = 12,
  gap = 8,
  children,
  className,
}: {
  cols?: number;
  gap?: number;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-grid-cols={cols}
      className={cn("grid min-w-0", className)}
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap }}
    >
      {children}
    </div>
  );
}

export function GridItem({ span = 12, children, className }: { span?: number; children: ReactNode; className?: string }) {
  const safe = Math.min(12, Math.max(1, Math.round(span)));
  return (
    <div className={cn("min-w-0", className)} style={{ gridColumn: `span ${safe} / span ${safe}` }}>
      {children}
    </div>
  );
}

/** Label occupies 4 of 12 columns. The control occupies the other 8. */
export function Field({ label, children, span = 12 }: { label: string; children: ReactNode; span?: number }) {
  return (
    <GridItem span={span}>
      <Grid cols={12} gap={8} className="items-center">
        <GridItem span={4}>
          <span className="block truncate text-xs text-muted" title={label}>{label}</span>
        </GridItem>
        <GridItem span={8}>{children}</GridItem>
      </Grid>
    </GridItem>
  );
}
