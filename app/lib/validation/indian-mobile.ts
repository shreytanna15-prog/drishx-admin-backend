import { z } from "zod";

/**
 * Normalize Indian mobile numbers for OTP identity.
 * Accepts 10-digit, +91, 91, or 0-prefixed forms → returns 10-digit string.
 */
export function normalizeIndianMobile(input: string): string | null {
  const digits = String(input ?? "").replace(/\D/g, "");
  if (digits.length === 10 && /^[6-9]/.test(digits)) {
    return digits;
  }
  if (digits.length === 11 && digits.startsWith("0") && /^[6-9]/.test(digits.slice(1))) {
    return digits.slice(1);
  }
  if (digits.length === 12 && digits.startsWith("91") && /^[6-9]/.test(digits.slice(2))) {
    return digits.slice(2);
  }
  return null;
}

/** E.164-ish for 2factor (+91XXXXXXXXXX). */
export function toTwoFactorMobile(tenDigit: string): string {
  return `91${tenDigit}`;
}

export const indianMobileSchema = z
  .unknown()
  .transform((value, ctx) => {
    const normalized = normalizeIndianMobile(String(value ?? ""));
    if (!normalized) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter a valid Indian mobile number.",
      });
      return z.NEVER;
    }
    return normalized;
  });
