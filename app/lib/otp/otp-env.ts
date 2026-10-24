import { OTP_DEV_CODE_DEFAULT } from "./otp-types";

export function isOtpDevMode(): boolean {
  const v = process.env.OTP_DEV_MODE?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function otpDevCode(): string {
  const fromEnv = process.env.OTP_DEV_CODE?.trim();
  return fromEnv && fromEnv.length >= 4 ? fromEnv : OTP_DEV_CODE_DEFAULT;
}

export function twoFactorApiKey(): string | null {
  const key = process.env.TWOFACTOR_API_KEY?.trim();
  return key || null;
}

export function twoFactorBaseUrl(): string {
  return (
    process.env.TWOFACTOR_BASE_URL?.trim() ||
    "https://2factor.in/API/V1"
  );
}
