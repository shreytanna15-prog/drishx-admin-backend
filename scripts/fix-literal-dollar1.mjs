import fs from "node:fs";
import path from "node:path";

const apiRoot = path.join(process.cwd(), "app", "api");
const needle = "auth.session;$1";

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
  if (!src.includes(needle)) continue;
  fs.writeFileSync(file, src.split(needle).join("auth.session;"));
  count += 1;
  console.log("fixed", path.relative(process.cwd(), file));
}
console.log("count", count);
