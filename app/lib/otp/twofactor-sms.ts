import { toTwoFactorMobile } from "./mobile-normalize";
import { isOtpDevMode, otpDevCode, twoFactorApiKey, twoFactorBaseUrl } from "./otp-env";
import type { OtpSendResult } from "./otp-types";

type TwoFactorJson = {
  Status?: string;
  Details?: string;
  DetailsMessage?: string;
};

async function parseJson(res: Response): Promise<TwoFactorJson> {
  try {
    return (await res.json()) as TwoFactorJson;
  } catch {
    return {};
  }
}

/**
 * Send mobile OTP via 2factor.in.
 * In OTP_DEV_MODE, does not call the network; returns a fixed/dev code.
 */
export async function twoFactorSendOtp(
  tenDigitMobile: string,
  _purpose: string
): Promise<OtpSendResult> {
  if (isOtpDevMode()) {
    const code = otpDevCode();
    console.info(
      `[otp:dev] mobile OTP for ${tenDigitMobile} purpose=${_purpose} code=${code}`
    );
    return {
      provider: "DEV",
      providerSessionId: `dev-${tenDigitMobile}-${Date.now()}`,
      devCode: code,
    };
  }

  const apiKey = twoFactorApiKey();
  if (!apiKey) {
    throw new Error("TWOFACTOR_API_KEY is not configured.");
  }

  const mobile = toTwoFactorMobile(tenDigitMobile);
  const url = `${twoFactorBaseUrl()}/${encodeURIComponent(apiKey)}/SMS/${encodeURIComponent(mobile)}/AUTOGEN`;
  const res = await fetch(url, { method: "GET" });
  const json = await parseJson(res);
  if (!res.ok || String(json.Status).toUpperCase() !== "SUCCESS") {
    throw new Error(
      json.Details || json.DetailsMessage || "2factor send OTP failed."
    );
  }
  return {
    provider: "TWOFACTOR",
    providerSessionId: json.Details || undefined,
  };
}

export async function twoFactorVerifyOtp(
  tenDigitMobile: string,
  code: string,
  sessionId?: string | null
): Promise<boolean> {
  if (isOtpDevMode()) {
    return code.trim() === otpDevCode();
  }

  const apiKey = twoFactorApiKey();
  if (!apiKey) {
    throw new Error("TWOFACTOR_API_KEY is not configured.");
  }
  if (!sessionId) {
    return false;
  }

  const url = `${twoFactorBaseUrl()}/${encodeURIComponent(apiKey)}/SMS/VERIFY/${encodeURIComponent(sessionId)}/${encodeURIComponent(code.trim())}`;
  const res = await fetch(url, { method: "GET" });
  const json = await parseJson(res);
  return res.ok && String(json.Status).toUpperCase() === "SUCCESS";
}

/** Kept for API symmetry with DEVELOPER-GUIDE; unused until production path needs it. */
export function twoFactorDestinationLabel(tenDigit: string): string {
  return toTwoFactorMobile(tenDigit);
}
