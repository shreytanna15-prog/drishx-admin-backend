import { z } from "zod";
import { indianMobileSchema } from "./indian-mobile";

export type OtpPurpose =
  | "SIGNUP"
  | "LOGIN"
  | "VERIFY_EMAIL"
  | "WALK_IN"
  | "ADMIN_INVITE";

export const OTP_PURPOSES = [
  "SIGNUP",
  "LOGIN",
  "VERIFY_EMAIL",
  "WALK_IN",
  "ADMIN_INVITE",
] as const;

export const otpPurposeSchema = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value, ctx) => {
    const s = String(value ?? "").trim().toUpperCase();
    if (!(OTP_PURPOSES as readonly string[]).includes(s)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid OTP purpose.",
      });
      return z.NEVER;
    }
    return s as OtpPurpose;
  });

/** Email OTP: missing/invalid purpose falls back to VERIFY_EMAIL (legacy behavior). */
export const emailOtpPurposeSchema = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => {
    const s = String(value ?? "").trim().toUpperCase();
    if ((OTP_PURPOSES as readonly string[]).includes(s)) {
      return s as OtpPurpose;
    }
    return "VERIFY_EMAIL" as OtpPurpose;
  });

export function parseOtpPurpose(value: unknown): OtpPurpose | null {
  const parsed = otpPurposeSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export const otpCodeSchema = z
  .union([z.string(), z.number()])
  .transform((value, ctx) => {
    const code = String(value ?? "").trim();
    if (!code) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "OTP code is required.",
      });
      return z.NEVER;
    }
    return code;
  });

const emailDestinationSchema = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value, ctx) => {
    const email = String(value ?? "").trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter a valid email address.",
      });
      return z.NEVER;
    }
    return email;
  });

function providerSessionIdFromBody(body: {
  sessionId?: unknown;
  providerSessionId?: unknown;
}): string | null {
  if (body.sessionId != null) return String(body.sessionId);
  if (body.providerSessionId != null) return String(body.providerSessionId);
  return null;
}

export const mobileOtpSendBodySchema = z.object({
  purpose: otpPurposeSchema,
  mobileNumber: indianMobileSchema,
});

export const mobileOtpVerifyBodySchema = z
  .object({
    purpose: otpPurposeSchema,
    mobileNumber: indianMobileSchema,
    code: otpCodeSchema,
    sessionId: z.unknown().optional(),
    providerSessionId: z.unknown().optional(),
  })
  .transform((body) => ({
    purpose: body.purpose,
    mobileNumber: body.mobileNumber,
    code: body.code,
    providerSessionId: providerSessionIdFromBody(body),
  }));

export const emailOtpSendBodySchema = z.object({
  purpose: emailOtpPurposeSchema,
  email: emailDestinationSchema,
});

export const emailOtpVerifyBodySchema = z
  .object({
    purpose: emailOtpPurposeSchema,
    email: emailDestinationSchema,
    code: otpCodeSchema,
    sessionId: z.unknown().optional(),
    providerSessionId: z.unknown().optional(),
  })
  .transform((body) => ({
    purpose: body.purpose,
    email: body.email,
    code: body.code,
    providerSessionId: providerSessionIdFromBody(body),
  }));
