import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiRoot = path.join(__dirname, "..", "app", "api");
function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (entry.name === "route.ts") files.push(full);
  }
  return files;
}
for (const file of walk(apiRoot)) {
  let content = fs.readFileSync(file, "utf8");
  if (!content.includes("getSession(")) continue;
  if (/from ["'][^"']*session-auth["']/.test(content)) continue;
  const rel = path.relative(path.dirname(file), path.join(__dirname, "..", "app", "lib", "session-auth")).replace(/\\/g, "/");
  const importPath = rel.startsWith(".") ? rel : `./${rel}`;
  content = content.replace(/\nimport \{ verifyToken \} from "[^"]+";\r?\n/g, "\n");
  const idx = content.indexOf("\n", content.indexOf("import "));
  content = content.slice(0, idx + 1) + `import { getSession } from "${importPath}";\n` + content.slice(idx + 1);
  fs.writeFileSync(file, content);
  console.log("fixed", file);
}
