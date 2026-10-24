"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { PanelBody } from "@/components/studio/panels";
import { Workspace } from "@/components/studio/workspace";
import { api } from "@/lib/api";
import { applyLocale, detectLocale } from "@/lib/i18n";
import type { PanelId } from "@/lib/grid";

export default function Page() {
  const [ready, setReady] = useState(false);
  const [popout, setPopout] = useState("");
  useEffect(() => {
    applyLocale(detectLocale());
    setPopout(new URLSearchParams(window.location.search).get("popout") || "");
    setReady(true);
  }, []);
  if (!ready) return <main className="h-screen bg-bg" />;
  if (popout) return <Popout panel={popout} />;
  return <Workspace />;
}

function Popout({ panel }: { panel: string }) {
  const { t } = useTranslation();
  const [state, setState] = useState<"wait" | "ok" | "no">("wait");
  useEffect(() => {
    void api(`/api/ee/popout?panel=${encodeURIComponent(panel)}`).then(() => setState("ok")).catch(() => setState("no"));
  }, [panel]);
  if (state !== "ok") return <main className="grid h-screen place-items-center bg-bg text-sm text-muted">{state === "no" ? t("ee.locked") : ""}</main>;
  return (
    <main className="h-screen min-h-0 bg-bg">
      <PanelBody id={panel as PanelId} />
    </main>
  );
}
