"use client";

import { useEffect } from "react";

/** The installed icon opens this origin. It does not start the Python process. */
export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return undefined;
    const local = location.hostname === "127.0.0.1" || location.hostname === "localhost";
    if (!local || location.protocol === "file:") return undefined;
    void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    return undefined;
  }, []);
  return null;
}
