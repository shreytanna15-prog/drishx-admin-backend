-- RC-01: address verification flag (set on Admin approve; clear on address change)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "addressVerifiedAt" TIMESTAMP(3);
