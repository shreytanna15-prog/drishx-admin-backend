/**
 * Pass 3: fix inverted role checks from pass2; migrate remaining helpers + compounds.
 * Run: node scripts/migrate-session-auth-pass3.mjs
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

function ensureImport(src, preferAlias = false) {
  if (!src.includes("getSessionOrUnauthorized")) return src;

  const importRe =
    /import\s*\{([^}]*)\}\s*from\s*(["'])([^"']*session-auth[^"']*)\2\s*;?/;
  if (!importRe.test(src)) {
    // Add import near top after next/server import if possible
    const rel = preferAlias
      ? "@/app/lib/session-auth"
      : null;
    if (!rel) return src;
    return `import { getSessionOrUnauthorized } from "${rel}";\n` + src;
  }

  const stillGetSession = /\bgetSession\s*\(/.test(
    src.replaceAll("getSessionOrUnauthorized", "__X__")
  );

  return src.replace(importRe, (m, names, q, mod) => {
    let list = names
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((n) => n !== "getSession" && n !== "getSessionOrUnauthorized");
    if (stillGetSession) list.unshift("getSession");
    list.push("getSessionOrUnauthorized");
    // dedupe preserve order
    list = [...new Set(list)];
    return `import { ${list.join(", ")} } from ${q}${mod}${q};`;
  });
}

function relativeSessionAuthImport(file) {
  const dir = path.dirname(file);
  let rel = path.relative(dir, path.join(process.cwd(), "app", "lib", "session-auth"));
  rel = rel.split(path.sep).join("/");
  if (!rel.startsWith(".")) rel = "./" + rel;
  return rel;
}

let files = 0;
let fixes = 0;

for (const file of walk(apiRoot)) {
  let src = fs.readFileSync(file, "utf8");
  let next = src;

  // Fix pass2 inverted role gates: if (!(EXPR)) → if (EXPR)
  next = next.replace(
    /if \(!\((session\.role[^)]*|session\.role === "[^"]+"|session\.role !== "[^"]+")\)\) \{/g,
    (m) => {
      fixes += 1;
      return m.replace("if (!(", "if (").replace(")) {", ") {");
    }
  );
  // Broader: if (!(...role...)) {
  next = next.replace(/if \(!\(([^)]*session\.role[^)]*)\)\) \{/g, (_, expr) => {
    fixes += 1;
    return `if (${expr}) {`;
  });

  // requireAdmin / requireXxx helpers with getSession + Unauthorized object return
  next = next.replace(
    /const session = getSession\(req\);\r?\n([ \t]*)if \(!session\) \{\r?\n[ \t]*return \{ error: NextResponse\.json\(\{ error: "Unauthorized\." \}, \{ status: 401 \}\) \};\r?\n[ \t]*\}/g,
    (_, indent) => {
      fixes += 1;
      return (
        `const auth = getSessionOrUnauthorized(req);\n` +
        `${indent}if (!auth.session) {\n` +
        `${indent}  return { error: auth.error };\n` +
        `${indent}}\n` +
        `${indent}const session = auth.session;`
      );
    }
  );

  // Multi-line object return Unauthorized
  next = next.replace(
    /const session = getSession\(req\);\r?\n([ \t]*)if \(!session\) \{\r?\n[ \t]*return \{\r?\n[ \t]*error: NextResponse\.json\(\{ error: "Unauthorized\." \}, \{ status: 401 \}\),\r?\n[ \t]*\};\r?\n[ \t]*\}/g,
    (_, indent) => {
      fixes += 1;
      return (
        `const auth = getSessionOrUnauthorized(req);\n` +
        `${indent}if (!auth.session) {\n` +
        `${indent}  return { error: auth.error };\n` +
        `${indent}}\n` +
        `${indent}const session = auth.session;`
      );
    }
  );

  // Compound getSession + !session || roleExpr → Unauthorized 401
  // CORRECT: keep roleExpr as-is (already the deny condition)
  next = next.replace(
    /const session = getSession\(req\);\r?\n([ \t]*)if \(!session \|\| ([^\n]+)\) \{\r?\n[ \t]*return NextResponse\.json\(\{ error: "Unauthorized\." \}, \{ status: 401 \}\);\r?\n[ \t]*\}/g,
    (_, indent, roleExpr) => {
      fixes += 1;
      const cond = roleExpr.trim();
      return (
        `const auth = getSessionOrUnauthorized(req);\n` +
        `${indent}if (!auth.session) {\n` +
        `${indent}  return auth.error;\n` +
        `${indent}}\n` +
        `${indent}const session = auth.session;\n` +
        `${indent}if (${cond}) {\n` +
        `${indent}  return NextResponse.json({ error: "Forbidden." }, { status: 403 });\n` +
        `${indent}}`
      );
    }
  );

  // Compound with Staff authorization / other 403 messages — still need TOKEN_* for missing session
  next = next.replace(
    /const session = getSession\(req\);\r?\n([ \t]*)if \(!session \|\| ([^\n]+)\) \{\r?\n[ \t]*return NextResponse\.json\(\{ error: ("[^"]+") \}, \{ status: 403 \}\);\r?\n[ \t]*\}/g,
    (_, indent, roleExpr, errMsg) => {
      fixes += 1;
      const cond = roleExpr.trim();
      return (
        `const auth = getSessionOrUnauthorized(req);\n` +
        `${indent}if (!auth.session) {\n` +
        `${indent}  return auth.error;\n` +
        `${indent}}\n` +
        `${indent}const session = auth.session;\n` +
        `${indent}if (${cond}) {\n` +
        `${indent}  return NextResponse.json({ error: ${errMsg} }, { status: 403 });\n` +
        `${indent}}`
      );
    }
  );

  // requireStaff(getSession(req)) pattern — rewrite function + call sites carefully per-file below

  if (next === src) continue;

  // Ensure import exists when we introduced getSessionOrUnauthorized
  if (next.includes("getSessionOrUnauthorized")) {
    if (!/from\s*["'][^"']*session-auth["']/.test(next)) {
      const rel = relativeSessionAuthImport(file);
      next =
        `import { getSessionOrUnauthorized } from "${rel}";\n` + next;
    } else {
      next = ensureImport(next);
    }
  }

  fs.writeFileSync(file, next);
  files += 1;
  console.log("updated", path.relative(process.cwd(), file));
}

console.log(`Done. files=${files} fixes≈${fixes}`);
