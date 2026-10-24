export type OtpChannel = "MOBILE" | "EMAIL";

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

export function parseOtpPurpose(value: unknown): OtpPurpose | null {
  const s = String(value ?? "").trim().toUpperCase();
  return (OTP_PURPOSES as readonly string[]).includes(s)
    ? (s as OtpPurpose)
    : null;
}

export type OtpSendResult = {
  provider: string;
  providerSessionId?: string;
  /** Present only in OTP_DEV_MODE so local/staging can verify without SMS. */
  devCode?: string;
};

export type OtpSender = {
  send(input: {
    channel: OtpChannel;
    destination: string;
    purpose: OtpPurpose;
  }): Promise<OtpSendResult>;
  verify(input: {
    channel: OtpChannel;
    destination: string;
    code: string;
    providerSessionId?: string | null;
  }): Promise<boolean>;
};

export const OTP_RATE_LIMIT = {
  minIntervalMs: 60_000,
  maxPerHour: 5,
  maxVerifyAttempts: 5,
  ttlMs: 10 * 60_000,
} as const;

export const OTP_DEV_CODE_DEFAULT = "123456";
