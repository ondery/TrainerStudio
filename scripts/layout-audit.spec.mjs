/**
 * Layout audit across breakpoints and languages.
 * STUDIO_URL=http://127.0.0.1:43151 node scripts/layout-audit.spec.mjs
 */
import { chromium } from "playwright";

const url = process.env.STUDIO_URL || "http://127.0.0.1:43151";
const widths = [1280, 1366, 1920, 2560, 3354];
const locales = ["en", "tr", "de", "ja", "ar"];

function expectedBreakpoint(width) {
  if (width >= 3354) return "3354";
  if (width >= 2560) return "2560";
  if (width >= 1920) return "1920";
  return "1366";
}

const browser = await chromium.launch({ headless: true });
const failures = [];
for (const locale of locales) {
  for (const width of widths) {
    const context = await browser.newContext({ viewport: { width, height: 800 }, locale });
    const page = await context.newPage();
    await page.addInitScript((code) => localStorage.setItem("trainer-studio.locale", code), locale);
    await page.goto(url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(300);
    const report = await page.evaluate(() => {
      const shell = document.querySelector("[data-testid=app-shell]");
      const areas = ["menu", "palette", "workspace", "status"].map((name) => {
        const node = document.querySelector(`[style*="grid-area: ${name}"], [style*="grid-area:${name}"]`);
        return { name, found: Boolean(node) };
      });
      const named = {};
      if (shell) {
        for (const child of shell.children) {
          const area = child.style?.gridArea;
          if (area) named[area] = true;
        }
      }
      return {
        dir: document.documentElement.dir,
        breakpoint: shell?.getAttribute("data-breakpoint") || "",
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
        toolbar: Boolean(shell?.querySelector("[style*='toolbar']")),
        named,
        workspace: Boolean(document.querySelector("[data-testid=workspace-grid], [data-testid=app-shell]")),
      };
    });
    const want = expectedBreakpoint(width);
    const overflow = report.scrollWidth > report.innerWidth + 1;
    const dirOk = locale === "ar" ? report.dir === "rtl" : report.dir !== "rtl";
    const areasOk = ["menu", "palette", "workspace", "status"].every((name) => report.named[name]);
    if (overflow || !dirOk || report.breakpoint !== want || !areasOk || report.toolbar || !report.workspace) {
      failures.push({ locale, width, want, report, overflow, dirOk, areasOk });
    }
    await context.close();
  }
}
await browser.close();
if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}
console.log("layout audit ok");
