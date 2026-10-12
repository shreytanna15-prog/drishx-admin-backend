/**
 * Pass 2: fix missing semicolons + migrate compound getSession checks.
 * Run: node scripts/migrate-session-auth-pass2.mjs
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

function ensureImport(src) {
  if (!src.includes("getSessionOrUnauthorized")) return src;
  if (/getSessionOrUnauthorized/.test(
    (src.match(/import\s*\{[^}]*\}\s*from\s*["'][^"']*session-auth["']/) || [])[0] || ""
  )) {
    return src;
  }

  const stillGetSession = /\bgetSession\s*\(/.test(
    src.replaceAll("getSessionOrUnauthorized", "__X__")
  );

  const importRe =
    /import\s*\{([^}]*)\}\s*from\s*(["'])([^"']*session-auth[^"']*)\2\s*;?/;
  if (importRe.test(src)) {
    return src.replace(importRe, (m, names, q, mod) => {
      let list = names
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .filter((n) => n !== "getSession" && n !== "getSessionOrUnauthorized");
      if (stillGetSession) list.unshift("getSession");
      list.push("getSessionOrUnauthorized");
      return `import { ${list.join(", ")} } from ${q}${mod}${q};`;
    });
  }
  return src;
}

let files = 0;
let fixes = 0;

for (const file of walk(apiRoot)) {
  let src = fs.readFileSync(file, "utf8");
  let next = src;

  // Missing semicolon from pass 1
  next = next.replace(
    /const session = auth\.session(\r?\n)/g,
    () => {
      fixes += 1;
      return "const session = auth.session;$1";
    }
  );
  // Fix if replace callback got wrong - do simple replace
  next = next.replace(/const session = auth\.session\r?\n/g, "const session = auth.session;\n");

  // Compound: getSession then !session || role → Unauthorized 401
  const compoundUnauthorized =
    /const session = getSession\(req\);\r?\n([ \t]*)if \(!session \|\| ([^)]+)\) \{\r?\n[ \t]*return NextResponse\.json\(\{ error: "Unauthorized\." \}, \{ status: 401 \}\);\r?\n[ \t]*\}/g;

  next = next.replace(compoundUnauthorized, (_, indent, roleExpr) => {
    fixes += 1;
    return (
      `const auth = getSessionOrUnauthorized(req);\n` +
      `${indent}if (!auth.session) {\n` +
      `${indent}  return auth.error;\n` +
      `${indent}}\n` +
      `${indent}const session = auth.session;\n` +
      `${indent}if (!(${roleExpr})) {\n` +
      `${indent}  return NextResponse.json({ error: "Forbidden." }, { status: 403 });\n` +
      `${indent}}`
    );
  });

  // Single-line compound Unauthorized
  const compoundLine =
    /const session = getSession\(req\);\r?\n([ \t]*)if \(!session \|\| ([^)]+)\) \{\r?\n?[ \t]*return NextResponse\.json\(\{ error: "Unauthorized\." \}, \{ status: 401 \}\);\r?\n?[ \t]*\}/g;

  // requireAdmin / requireStaff style: getSession + !session → { error: Unauthorized json }
  const helperUnauthorized =
    /const session = getSession\(req\);\r?\n([ \t]*)if \(!session\) \{\r?\n[ \t]*return \{\r?\n[ \t]*error: NextResponse\.json\(\{ error: "Unauthorized\." \}, \{ status: 401 \}\),\r?\n[ \t]*\};\r?\n[ \t]*\}/g;

  next = next.replace(helperUnauthorized, (_, indent) => {
    fixes += 1;
    return (
      `const auth = getSessionOrUnauthorized(req);\n` +
      `${indent}if (!auth.session) {\n` +
      `${indent}  return { error: auth.error };\n` +
      `${indent}}\n` +
      `${indent}const session = auth.session;`
    );
  });

  // Simple remaining: getSession + !session Unauthorized (any formatting)
  const simpleRemaining =
    /const session = getSession\(req\);\r?\n([ \t]*)if \(!session\) \{\r?\n[ \t]*return NextResponse\.json\(\{ error: "Unauthorized\." \}, \{ status: 401 \}\);\r?\n[ \t]*\}/g;
  next = next.replace(simpleRemaining, (_, indent) => {
    fixes += 1;
    return (
      `const auth = getSessionOrUnauthorized(req);\n` +
      `${indent}if (!auth.session) {\n` +
      `${indent}  return auth.error;\n` +
      `${indent}}\n` +
      `${indent}const session = auth.session;`
    );
  });

  const simpleLine =
    /const session = getSession\(req\);\r?\n([ \t]*)if \(!session\) return NextResponse\.json\(\{ error: "Unauthorized\." \}, \{ status: 401 \}\);/g;
  next = next.replace(simpleLine, (_, indent) => {
    fixes += 1;
    return (
      `const auth = getSessionOrUnauthorized(req);\n` +
      `${indent}if (!auth.session) return auth.error;\n` +
      `${indent}const session = auth.session;`
    );
  });

  if (next === src) continue;

  next = ensureImport(next);
  fs.writeFileSync(file, next);
  files += 1;
  console.log("updated", path.relative(process.cwd(), file));
}

console.log(`Done. files=${files} fixes≈${fixes}`);
