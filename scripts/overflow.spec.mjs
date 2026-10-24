/**
 * Horizontal overflow must stay inside the viewport.
 * Run with Playwright against a running Trainer Studio:
 *   STUDIO_URL=http://127.0.0.1:43150 node scripts/overflow.spec.mjs
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const url = process.env.STUDIO_URL || "http://127.0.0.1:43150";
const out = process.env.SHOT_DIR || "/opt/cursor/artifacts/screenshots";
const sizes = [
  { width: 1280, height: 720, dpr: 1 },
  { width: 1366, height: 768, dpr: 1 },
  { width: 1536, height: 864, dpr: 1.25 },
  { width: 1920, height: 1080, dpr: 1 },
  { width: 2560, height: 1440, dpr: 1.5 },
  { width: 3354, height: 1080, dpr: 1 },
];
const selectors = ["[data-testid=app-shell]", "[data-testid=status-bar]", "[data-testid=activity-bar]", "header"];

const browser = await chromium.launch({ headless: true });
const failures = [];
await mkdir(out, { recursive: true });
for (const size of sizes) {
  const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: size.dpr, locale: "tr-TR" });
  const page = await context.newPage();
  await page.addInitScript(() => localStorage.setItem("trainer-studio.locale", "tr"));
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(400);
  const report = await page.evaluate((names) => {
    const view = { innerWidth: window.innerWidth, innerHeight: window.innerHeight, scrollWidth: document.documentElement.scrollWidth, dpr: window.devicePixelRatio };
    const panels = names.map((selector) => {
      const node = document.querySelector(selector);
      if (!node) return { selector, missing: true };
      const rect = node.getBoundingClientRect();
      return { selector, left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width };
    });
    return { view, panels };
  }, selectors);
  const name = `overflow-${size.width}x${size.height}-dpr${size.dpr}.png`;
  await page.screenshot({ path: `${out}/${name}`, fullPage: false });
  const overflow = report.view.scrollWidth > report.view.innerWidth + 1;
  const outside = report.panels.filter((panel) => !panel.missing && (panel.left < -1 || panel.right > report.view.innerWidth + 1 || panel.bottom > report.view.innerHeight + 1));
  if (overflow || outside.length || Math.abs(report.view.innerWidth - size.width) > 2) {
    failures.push({ size, report, outside });
  }
  console.log(JSON.stringify({ size, inner: report.view.innerWidth, scroll: report.view.scrollWidth, dpr: report.view.dpr }));
  await context.close();
}
await browser.close();
if (failures.length) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}
console.log("overflow ok");
