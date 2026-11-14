import { z } from "zod";

export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

export function optionalTrim(value: unknown): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

export function normalizeGstin(value: unknown): string | null {
  const trimmed = optionalTrim(value);
  return trimmed ? trimmed.toUpperCase() : null;
}

export function normalizePan(value: unknown): string | null {
  const trimmed = optionalTrim(value);
  return trimmed ? trimmed.toUpperCase() : null;
}

export function isValidGstin(value: string): boolean {
  return GSTIN_REGEX.test(value);
}

export function isValidPan(value: string): boolean {
  return PAN_REGEX.test(value);
}

export const optionalGstinSchema = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value, ctx) => {
    const gst = normalizeGstin(value);
    if (gst && !isValidGstin(gst)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid GSTIN format.",
      });
      return z.NEVER;
    }
    return gst;
  });

export const optionalPanSchema = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value, ctx) => {
    const pan = normalizePan(value);
    if (pan && !isValidPan(pan)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid PAN format.",
      });
      return z.NEVER;
    }
    return pan;
  });

export const optionalGstinPanSchema = z
  .object({
    gstNumber: z.unknown().optional(),
    panNumber: z.unknown().optional(),
  })
  .transform((input, ctx) => {
    const gstNumber = normalizeGstin(input.gstNumber);
    const panNumber = normalizePan(input.panNumber);
    if (gstNumber && !isValidGstin(gstNumber)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid GSTIN format.",
      });
      return z.NEVER;
    }
    if (panNumber && !isValidPan(panNumber)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid PAN format.",
      });
      return z.NEVER;
    }
    return { gstNumber, panNumber };
  });

export type GstinPanValidation =
  | { ok: true; gstNumber: string | null; panNumber: string | null }
  | { ok: false; error: string };

/** Validate GSTIN/PAN only when non-empty. Empty/omitted → null (ok). */
export function validateOptionalGstinPan(input: {
  gstNumber?: unknown;
  panNumber?: unknown;
}): GstinPanValidation {
  const parsed = optionalGstinPanSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid GSTIN/PAN.",
    };
  }
  return { ok: true, ...parsed.data };
}
