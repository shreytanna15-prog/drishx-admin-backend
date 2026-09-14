/**
 * Tailwind v4: [var(--x)] → (--x)
 * @see https://tailwindcss.com/docs/upgrade-guide#variables-in-arbitrary-values
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const TARGET_DIRS = ["app", "components"];

/** Match [var(...)] including fallbacks like var(--a,rgba(0,0,0,0.1)) */
const VAR_ARBITRARY = /\[var\(((?:[^[\]()]+|\([^)]*\))*)\)\]/g;

function walk(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "api") continue;
      walk(full, files);
    } else if (/\.(tsx|ts|jsx|js)$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

function migrateContent(content) {
  let next = content.replace(VAR_ARBITRARY, "($1)");
  next = next.replace(/\bmin-w-\[10rem\]/g, "min-w-40");
  return next;
}

let changedFiles = 0;
let totalReplacements = 0;

for (const dir of TARGET_DIRS) {
  for (const file of walk(path.join(ROOT, dir))) {
    const original = fs.readFileSync(file, "utf8");
    const matches = original.match(VAR_ARBITRARY);
    const minW = (original.match(/\bmin-w-\[10rem\]/g) ?? []).length;
    if (!matches && !minW) continue;

    const updated = migrateContent(original);
    if (updated === original) continue;

    fs.writeFileSync(file, updated, "utf8");
    changedFiles += 1;
    totalReplacements += (matches?.length ?? 0) + minW;
    console.log(`updated ${path.relative(ROOT, file)} (${(matches?.length ?? 0) + minW} replacements)`);
  }
}

console.log(`\nDone: ${changedFiles} files, ~${totalReplacements} class updates.`);
