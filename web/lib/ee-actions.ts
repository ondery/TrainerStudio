import { api } from "./api";
import { i18n } from "./i18n";
import { useStudio } from "./store";

type EeHost = {
  api: typeof api;
  i18n: typeof i18n;
  useStudio: typeof useStudio;
};

type EeAddon = { runEnterprise?: (command: string) => Promise<void> };

/** Load the private add-on from the server. The paid commands stay out of this bundle. */
export async function runEnterprise(id: string) {
  const studio = useStudio.getState();
  const host = window as Window & { __studioEe?: EeHost };
  host.__studioEe = { api, i18n, useStudio };
  try {
    const load = new Function("return import('/ee-addon.js')") as () => Promise<EeAddon>;
    const mod = await load();
    if (!mod.runEnterprise) throw new Error(i18n.t("ee.locked"));
    await mod.runEnterprise(id);
  } catch {
    studio.setNotice(i18n.t("ee.locked"));
  }
}
