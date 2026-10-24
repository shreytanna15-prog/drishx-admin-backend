-- Phase A1: customer OTP identity (verified flags + OtpChallenge).
-- Does not yet enforce unique/required mobile or nullable email (A2 migration).

CREATE TYPE "OtpChannel" AS ENUM ('MOBILE', 'EMAIL');

CREATE TYPE "OtpPurpose" AS ENUM ('SIGNUP', 'LOGIN', 'VERIFY_EMAIL', 'WALK_IN', 'ADMIN_INVITE');

ALTER TABLE "User" ADD COLUMN "mobileVerifiedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);

CREATE TABLE "OtpChallenge" (
    "id" TEXT NOT NULL,
    "channel" "OtpChannel" NOT NULL,
    "destination" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerSessionId" TEXT,
    "purpose" "OtpPurpose" NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumedAt" TIMESTAMP(3),
    "createdByStaffId" TEXT,
    "codeHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpChallenge_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OtpChallenge_destination_channel_createdAt_idx" ON "OtpChallenge"("destination", "channel", "createdAt");
CREATE INDEX "OtpChallenge_destination_purpose_consumedAt_idx" ON "OtpChallenge"("destination", "purpose", "consumedAt");
