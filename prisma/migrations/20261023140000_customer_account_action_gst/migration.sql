-- Phase B: accountAction, creditAllowed, staff create attribution, GST verify cache.

CREATE TYPE "AccountAction" AS ENUM ('NONE', 'BLOCKED', 'CREDIT_SUSPENDED', 'CLOSED');

CREATE TYPE "GstinVerifyStatus" AS ENUM ('UNKNOWN', 'ACTIVE', 'INACTIVE', 'INVALID', 'ERROR');

ALTER TABLE "User" ADD COLUMN "creditAllowed" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN "accountAction" "AccountAction" NOT NULL DEFAULT 'NONE';
ALTER TABLE "User" ADD COLUMN "createdByStaffId" TEXT;
ALTER TABLE "User" ADD COLUMN "gstinVerifyStatus" "GstinVerifyStatus" NOT NULL DEFAULT 'UNKNOWN';
ALTER TABLE "User" ADD COLUMN "gstinVerifiedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "gstinVerifyRaw" JSONB;
ALTER TABLE "User" ADD COLUMN "gstinVerifiedById" TEXT;
