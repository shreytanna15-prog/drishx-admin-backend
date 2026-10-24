import { isOtpDevMode, otpDevCode } from "./otp-env";
import type { OtpSendResult } from "./otp-types";

/**
 * Email OTP — provider TBD (Resend / SES / SendGrid / Postmark).
 * Until a vendor is chosen, only OTP_DEV_MODE is supported.
 */
export async function emailSendOtp(
  email: string,
  purpose: string
): Promise<OtpSendResult> {
  if (isOtpDevMode()) {
    const code = otpDevCode();
    console.info(
      `[otp:dev] email OTP for ${email} purpose=${purpose} code=${code}`
    );
    return {
      provider: "DEV",
      providerSessionId: `dev-email-${Date.now()}`,
      devCode: code,
    };
  }

  throw new Error(
    "Email OTP provider is not configured yet. Set OTP_DEV_MODE=1 for local/staging, or choose EMAIL_OTP provider."
  );
}

export async function emailVerifyOtp(
  _email: string,
  code: string,
  _sessionId?: string | null
): Promise<boolean> {
  if (isOtpDevMode()) {
    return code.trim() === otpDevCode();
  }
  throw new Error("Email OTP provider is not configured yet.");
}

export function normalizeEmail(input: string): string | null {
  const email = String(input ?? "").trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return null;
  }
  return email;
}
