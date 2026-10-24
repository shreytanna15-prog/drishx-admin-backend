import type { OtpChannel as DbOtpChannel, OtpPurpose as DbOtpPurpose } from "@prisma/client";
import { prisma } from "../prisma";
import { hashOtpCode, otpCodeMatches } from "./otp-code-hash";
import { emailSendOtp, emailVerifyOtp } from "./email-otp";
import { twoFactorSendOtp, twoFactorVerifyOtp } from "./twofactor-sms";
import {
  OTP_RATE_LIMIT,
  type OtpChannel,
  type OtpPurpose,
  type OtpSendResult,
} from "./otp-types";

export type RateLimitDenial = {
  ok: false;
  code: "OTP_RATE_LIMITED";
  message: string;
};

export type SendChallengeOk = {
  ok: true;
  challengeId: string;
  provider: string;
  providerSessionId: string | null;
  expiresAt: Date;
  /** Only when OTP_DEV_MODE — never log in production handlers. */
  devCode?: string;
};

export type VerifyChallengeResult =
  | { ok: true; challengeId: string }
  | {
      ok: false;
      code: "OTP_INVALID" | "OTP_RATE_LIMITED";
      message: string;
    };

async function assertNotRateLimited(
  channel: OtpChannel,
  destination: string
): Promise<RateLimitDenial | null> {
  const now = Date.now();
  const sinceMinute = new Date(now - OTP_RATE_LIMIT.minIntervalMs);
  const sinceHour = new Date(now - 60 * 60_000);

  const recent = await prisma.otpChallenge.findFirst({
    where: {
      channel: channel as DbOtpChannel,
      destination,
      createdAt: { gte: sinceMinute },
    },
    orderBy: { createdAt: "desc" },
  });
  if (recent) {
    return {
      ok: false,
      code: "OTP_RATE_LIMITED",
      message: "Please wait before requesting another OTP.",
    };
  }

  const hourCount = await prisma.otpChallenge.count({
    where: {
      channel: channel as DbOtpChannel,
      destination,
      createdAt: { gte: sinceHour },
    },
  });
  if (hourCount >= OTP_RATE_LIMIT.maxPerHour) {
    return {
      ok: false,
      code: "OTP_RATE_LIMITED",
      message: "Too many OTP requests. Try again later.",
    };
  }
  return null;
}

async function dispatchSend(
  channel: OtpChannel,
  destination: string,
  purpose: OtpPurpose
): Promise<OtpSendResult> {
  if (channel === "MOBILE") {
    return twoFactorSendOtp(destination, purpose);
  }
  return emailSendOtp(destination, purpose);
}

export async function sendOtpChallenge(input: {
  channel: OtpChannel;
  destination: string;
  purpose: OtpPurpose;
  createdByStaffId?: string | null;
}): Promise<SendChallengeOk | RateLimitDenial> {
  const limited = await assertNotRateLimited(input.channel, input.destination);
  if (limited) return limited;

  const sent = await dispatchSend(input.channel, input.destination, input.purpose);
  const expiresAt = new Date(Date.now() + OTP_RATE_LIMIT.ttlMs);
  const codeHash = sent.devCode ? hashOtpCode(sent.devCode) : null;

  const row = await prisma.otpChallenge.create({
    data: {
      channel: input.channel as DbOtpChannel,
      destination: input.destination,
      provider: sent.provider,
      providerSessionId: sent.providerSessionId ?? null,
      purpose: input.purpose as DbOtpPurpose,
      expiresAt,
      createdByStaffId: input.createdByStaffId ?? null,
      codeHash,
    },
  });

  return {
    ok: true,
    challengeId: row.id,
    provider: sent.provider,
    providerSessionId: row.providerSessionId,
    expiresAt,
    devCode: sent.devCode,
  };
}

export async function verifyOtpChallenge(input: {
  channel: OtpChannel;
  destination: string;
  purpose: OtpPurpose;
  code: string;
  providerSessionId?: string | null;
}): Promise<VerifyChallengeResult> {
  const challenge = await prisma.otpChallenge.findFirst({
    where: {
      channel: input.channel as DbOtpChannel,
      destination: input.destination,
      purpose: input.purpose as DbOtpPurpose,
      consumedAt: null,
    },
    orderBy: { createdAt: "desc" },
  });

  if (!challenge) {
    return {
      ok: false,
      code: "OTP_INVALID",
      message: "No active OTP. Request a new code.",
    };
  }

  if (challenge.expiresAt.getTime() < Date.now()) {
    return {
      ok: false,
      code: "OTP_INVALID",
      message: "OTP expired. Request a new code.",
    };
  }

  if (challenge.attempts >= OTP_RATE_LIMIT.maxVerifyAttempts) {
    return {
      ok: false,
      code: "OTP_RATE_LIMITED",
      message: "Too many incorrect attempts. Request a new code.",
    };
  }

  const sessionId = input.providerSessionId ?? challenge.providerSessionId;
  let matched = false;

  if (challenge.codeHash) {
    matched = otpCodeMatches(input.code, challenge.codeHash);
  } else if (input.channel === "MOBILE") {
    matched = await twoFactorVerifyOtp(input.destination, input.code, sessionId);
  } else {
    matched = await emailVerifyOtp(input.destination, input.code, sessionId);
  }

  if (!matched) {
    await prisma.otpChallenge.update({
      where: { id: challenge.id },
      data: { attempts: { increment: 1 } },
    });
    return {
      ok: false,
      code: "OTP_INVALID",
      message: "Invalid OTP code.",
    };
  }

  await prisma.otpChallenge.update({
    where: { id: challenge.id },
    data: { consumedAt: new Date() },
  });

  return { ok: true, challengeId: challenge.id };
}
