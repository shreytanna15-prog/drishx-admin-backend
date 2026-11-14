import type { OtpPurpose } from "../validation/otp";

export type OtpChannel = "MOBILE" | "EMAIL";

export type { OtpPurpose } from "../validation/otp";
export { OTP_PURPOSES, parseOtpPurpose } from "../validation/otp";

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
