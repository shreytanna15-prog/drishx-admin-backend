import fs from "fs";
import path from "path";

const apiRoot = path.join(import.meta.dirname, "..", "app", "api");

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
  let changed = false;

  if (content.includes("getSession(") && !content.includes("session-auth")) {
    const libDir = path.join(import.meta.dirname, "..", "app", "lib", "session-auth.ts");
    let importPath = path
      .relative(path.dirname(file), libDir)
      .replace(/\\/g, "/")
      .replace(/\.ts$/, "");
    if (!importPath.startsWith(".")) importPath = `./${importPath}`;

    const firstImport = content.match(/^import .+\n/m);
    if (firstImport) {
      const insertAt = firstImport.index + firstImport[0].length;
      content =
        content.slice(0, insertAt) +
        `import { getSession } from "${importPath}";\n` +
        content.slice(insertAt);
      changed = true;
    }
  }

  if (content.includes('from "../../../lib/session-auth.ts"') || content.includes('session-auth.ts"')) {
    content = content.replace(/session-auth\.ts"/g, 'session-auth"');
    changed = true;
  }

  if (content.includes('verifyToken') && content.includes('from "../../lib/auth"')) {
    if (!content.match(/verifyToken\(/)) {
      content = content.replace(/\nimport \{ verifyToken \} from "\.\.\/\.\.\/lib\/auth";\n/, "\n");
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(file, content);
    console.log("fixed", file);
  }
}
