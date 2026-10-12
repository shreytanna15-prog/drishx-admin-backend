/**
 * Migrate route handlers from getSession + bare 401 to getSessionOrUnauthorized.
 * Run: node scripts/migrate-session-auth.mjs
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

function migrateBody(src) {
  let next = src;
  let count = 0;

  const blockRe =
    /const session = getSession\(req\);\r?\n([ \t]*)if \(!session\) \{\r?\n[ \t]*return NextResponse\.json\(\{ error: "Unauthorized\." \}, \{ status: 401 \}\);\r?\n[ \t]*\}/g;
  next = next.replace(blockRe, (_, indent) => {
    count += 1;
    return (
      `const auth = getSessionOrUnauthorized(req);\n` +
      `${indent}if (!auth.session) {\n` +
      `${indent}  return auth.error;\n` +
      `${indent}}\n` +
      `${indent}const session = auth.session`
    );
  });

  const lineRe =
    /const session = getSession\(req\);\r?\n([ \t]*)if \(!session\) return NextResponse\.json\(\{ error: "Unauthorized\." \}, \{ status: 401 \}\);/g;
  next = next.replace(lineRe, (_, indent) => {
    count += 1;
    return (
      `const auth = getSessionOrUnauthorized(req);\n` +
      `${indent}if (!auth.session) return auth.error;\n` +
      `${indent}const session = auth.session;`
    );
  });

  return { next, count };
}

function fixImports(src) {
  const stillUsesGetSession = /\bgetSession\s*\(/.test(
    src.replaceAll("getSessionOrUnauthorized", "__AUTH__")
  );
  const usesHelper = src.includes("getSessionOrUnauthorized");
  if (!usesHelper) return src;

  const importRe =
    /import\s*\{([^}]*)\}\s*from\s*(["'])([^"']*session-auth[^"']*)\2\s*;?/;
  const match = src.match(importRe);
  if (!match) {
    // Relative imports vary; try to insert near other lib imports
    const insert = `import { getSessionOrUnauthorized } from "../../lib/session-auth";\n`;
    // Prefer next to first existing lib import
    if (/from ["'][^"']*\/lib\//.test(src)) {
      return src.replace(
        /(import .+from ["'][^"']*\/lib\/[^"']+["'];?\r?\n)/,
        `$1${insert}`
      );
    }
    return insert + src;
  }

  let names = match[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((n) => n !== "getSession" && n !== "getSessionOrUnauthorized");

  if (stillUsesGetSession) names.unshift("getSession");
  names.push("getSessionOrUnauthorized");

  return src.replace(
    importRe,
    `import { ${names.join(", ")} } from ${match[2]}${match[3]}${match[2]};`
  );
}

let changedFiles = 0;
let replacements = 0;

for (const file of walk(apiRoot)) {
  const src = fs.readFileSync(file, "utf8");
  if (!src.includes("getSession(req)")) continue;

  const { next: body, count } = migrateBody(src);
  if (count === 0) continue;

  const final = fixImports(body);
  fs.writeFileSync(file, final);
  changedFiles += 1;
  replacements += count;
  console.log(`updated (${count}) ${path.relative(process.cwd(), file)}`);
}

console.log(`Done. files=${changedFiles} replacements=${replacements}`);
