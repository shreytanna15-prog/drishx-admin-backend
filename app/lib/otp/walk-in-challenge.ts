/**
 * Prove a mobile was verified via WALK_IN OTP before Path C create.
 */

import { prisma } from "../prisma";

const WALK_IN_CLAIM_WINDOW_MS = 30 * 60_000;

export type WalkInChallengeResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * challengeId must be a recently consumed MOBILE / WALK_IN challenge
 * for the given 10-digit mobile.
 */
export async function assertWalkInMobileVerified(input: {
  mobileNumber: string;
  challengeId: string;
}): Promise<WalkInChallengeResult> {
  const challenge = await prisma.otpChallenge.findUnique({
    where: { id: input.challengeId },
  });

  if (!challenge) {
    return { ok: false, error: "Invalid or expired mobile verification." };
  }
  if (challenge.channel !== "MOBILE" || challenge.purpose !== "WALK_IN") {
    return { ok: false, error: "Invalid or expired mobile verification." };
  }
  if (challenge.destination !== input.mobileNumber) {
    return {
      ok: false,
      error: "Mobile number does not match the verified OTP session.",
    };
  }
  if (!challenge.consumedAt) {
    return {
      ok: false,
      error: "Verify the mobile OTP before creating a walk-in customer.",
    };
  }
  const age = Date.now() - challenge.consumedAt.getTime();
  if (age < 0 || age > WALK_IN_CLAIM_WINDOW_MS) {
    return {
      ok: false,
      error: "Mobile verification expired. Send and verify OTP again.",
    };
  }

  return { ok: true };
}
