import { createHash, timingSafeEqual } from "node:crypto";

export function hashOtpCode(code: string): string {
  return createHash("sha256").update(code.trim(), "utf8").digest("hex");
}

export function otpCodeMatches(code: string, codeHash: string | null | undefined): boolean {
  if (!codeHash) return false;
  const a = Buffer.from(hashOtpCode(code), "hex");
  const b = Buffer.from(codeHash, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
