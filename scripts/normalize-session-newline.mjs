/**
 * Pretty-print: "const session = auth.session;  if" → newline between.
 */
import fs from "node:fs";
import path from "node:path";

const apiRoot = path.join(process.cwd(), "app", "api");

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name === "route.ts") out.push(full);
  }
  return out;
}

let count = 0;
for (const file of walk(apiRoot)) {
  const src = fs.readFileSync(file, "utf8");
  const next = src.replace(
    /const session = auth\.session;[ \t]+(?=\S)/g,
    "const session = auth.session;\n  "
  );
  if (next === src) continue;
  fs.writeFileSync(file, next);
  count += 1;
  console.log("normalized", path.relative(process.cwd(), file));
}
console.log("count", count);
