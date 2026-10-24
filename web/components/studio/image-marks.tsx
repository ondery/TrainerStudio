"use client";

import { BadgeCheck, ClipboardCheck, Flag } from "lucide-react";
import { useTranslation } from "react-i18next";

export function ImageMarks({ flagged, reviewed, review }: { flagged?: boolean; reviewed?: boolean; review?: boolean }) {
  const { t } = useTranslation();
  if (!flagged && !reviewed && !review) return null;
  return (
    <span className="flex shrink-0 items-center gap-0.5" data-testid="image-marks">
      {flagged ? <Flag className="h-3 w-3 fill-current text-danger" aria-label={t("filters.flagged")} /> : null}
      {reviewed ? <BadgeCheck className="h-3 w-3 text-ok" aria-label={t("filters.reviewed")} /> : review ? <ClipboardCheck className="h-3 w-3 text-warn" aria-label={t("filters.review")} /> : null}
    </span>
  );
}

export function marksTitle(name: string, flags: { flagged?: boolean; reviewed?: boolean; review?: boolean }, label: (key: string) => string) {
  const extra = [
    flags.flagged ? label("filters.flagged") : "",
    flags.reviewed ? label("filters.reviewed") : flags.review ? label("filters.review") : "",
  ].filter(Boolean);
  return extra.length ? `${name} · ${extra.join(" · ")}` : name;
}
