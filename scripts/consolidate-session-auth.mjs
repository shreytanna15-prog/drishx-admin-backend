import fs from "fs";
import path from "path";

const root = path.join(import.meta.dirname, "..", "app", "api");

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (entry.name === "route.ts") files.push(full);
  }
  return files;
}

const sessionBlock =
  /function getSession\(req: NextRequest\) \{\s*const auth = req\.headers\.get\("authorization"\)[\s\S]*?return verifyToken\(token\);\s*\}\s*/;

for (const file of walk(root)) {
  if (file.includes(`${path.sep}auth${path.sep}`)) continue;
  let content = fs.readFileSync(file, "utf8");
  if (!sessionBlock.test(content)) continue;

  content = content.replace(sessionBlock, "");
  content = content.replace(/\nimport \{ verifyToken \} from "[^"]+";\n/, "\n");

  const rel = path
    .relative(path.dirname(file), path.join(import.meta.dirname, "..", "app", "lib", "session-auth.ts"))
    .replace(/\\/g, "/")
    .replace(/\.ts$/, "");
  const importPath = rel.startsWith(".") ? rel : `./${rel}`;

  if (!content.includes('from "../lib/session-auth"') && !content.includes("session-auth")) {
    const nextImport = content.match(/^import .+ from .+;\n/m);
    if (nextImport) {
      const insertAt = content.indexOf(nextImport[0]) + nextImport[0].length;
      content =
        content.slice(0, insertAt) +
        `import { getSession } from "${importPath.replace(/\\/g, "/")}";\n` +
        content.slice(insertAt);
    }
  }

  fs.writeFileSync(file, content);
  console.log("updated", file);
}
