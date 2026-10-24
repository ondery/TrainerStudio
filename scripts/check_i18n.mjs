import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "web", "locales");
const files = readdirSync(root).filter((name) => name.endsWith(".json")).sort();
const english = JSON.parse(readFileSync(join(root, "en.json"), "utf8"));
const keys = Object.keys(english).sort();
let failed = false;

for (const file of files) {
  const data = JSON.parse(readFileSync(join(root, file), "utf8"));
  const got = Object.keys(data).sort();
  const missing = keys.filter((key) => !got.includes(key));
  const extra = got.filter((key) => !keys.includes(key));
  if (missing.length || extra.length) {
    console.error(`${file} missing=${missing.join(",")} extra=${extra.join(",")}`);
    failed = true;
  }
  if (data["app.name"] !== "Trainer Studio") {
    console.error(`${file} app.name must be Trainer Studio`);
    failed = true;
  }
  for (const key of ["images.count", "objects.count"]) {
    if (typeof data[key] !== "string" || !data[key].includes("plural")) {
      console.error(`${file} ${key} must be an ICU plural`);
      failed = true;
    }
  }
}

if (!files.includes("en.json") || files.length < 12) {
  console.error("expected 12 locale catalogs");
  failed = true;
}

if (failed) process.exit(1);
console.log(`${files.length} locales, ${keys.length} keys`);
