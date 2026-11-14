import { getEnv } from "../env";
import { OTP_DEV_CODE_DEFAULT } from "./otp-types";

export function isOtpDevMode(): boolean {
  return getEnv().OTP_DEV_MODE;
}

export function otpDevCode(): string {
  const fromEnv = getEnv().OTP_DEV_CODE;
  return fromEnv && fromEnv.length >= 4 ? fromEnv : OTP_DEV_CODE_DEFAULT;
}

export function twoFactorApiKey(): string | null {
  return getEnv().TWOFACTOR_API_KEY ?? null;
}

export function twoFactorBaseUrl(): string {
  return getEnv().TWOFACTOR_BASE_URL || "https://2factor.in/API/V1";
}
