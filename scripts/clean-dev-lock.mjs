import { existsSync, readFileSync, unlinkSync } from "fs";
import { join } from "path";

const lockPath = join(process.cwd(), ".next/dev/lock");

if (!existsSync(lockPath)) {
  process.exit(0);
}

try {
  const { pid } = JSON.parse(readFileSync(lockPath, "utf8"));
  process.kill(pid, 0);
} catch {
  unlinkSync(lockPath);
}
