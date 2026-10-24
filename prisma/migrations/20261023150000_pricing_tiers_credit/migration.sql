-- Phase D: PricingTier A–F + User.pricingTierId + Order tier snapshot columns.

CREATE TABLE "PricingTier" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT,
    "discountPercent" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "isBase" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricingTier_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PricingTier_code_key" ON "PricingTier"("code");

ALTER TABLE "User" ADD COLUMN "pricingTierId" TEXT;

ALTER TABLE "User" ADD CONSTRAINT "User_pricingTierId_fkey"
  FOREIGN KEY ("pricingTierId") REFERENCES "PricingTier"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Order" ADD COLUMN "tierCode" TEXT;
ALTER TABLE "Order" ADD COLUMN "tierDiscountPercent" DECIMAL(65,30);
ALTER TABLE "Order" ADD COLUMN "tierDiscountAmount" DECIMAL(65,30);

-- Seed A–F (D = base). Fixed ids for idempotent references.
INSERT INTO "PricingTier" ("id", "code", "name", "discountPercent", "isBase", "isActive", "sortOrder", "createdAt", "updatedAt")
VALUES
  ('pricing_tier_a', 'A', 'Tier A', 0, false, true, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pricing_tier_b', 'B', 'Tier B', 0, false, true, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pricing_tier_c', 'C', 'Tier C', 0, false, true, 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pricing_tier_d', 'D', 'Tier D (Base)', 0, true, true, 4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pricing_tier_e', 'E', 'Tier E', 0, false, true, 5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('pricing_tier_f', 'F', 'Tier F', 0, false, true, 6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;
