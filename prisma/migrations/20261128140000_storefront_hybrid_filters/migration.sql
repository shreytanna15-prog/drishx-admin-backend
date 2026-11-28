-- Rework Storefront Catalog to hybrid filters + pin/exclude (Maulik revised plan)

DROP TABLE IF EXISTS "StorefrontCardProduct";
DROP TABLE IF EXISTS "StorefrontCoatingChip";

-- Filter FKs on StorefrontCard
ALTER TABLE "StorefrontCard" ADD COLUMN IF NOT EXISTS "baseId" TEXT;
ALTER TABLE "StorefrontCard" ADD COLUMN IF NOT EXISTS "materialId" TEXT;
ALTER TABLE "StorefrontCard" ADD COLUMN IF NOT EXISTS "indexId" TEXT;
ALTER TABLE "StorefrontCard" ADD COLUMN IF NOT EXISTS "coatingId" TEXT;
ALTER TABLE "StorefrontCard" ADD COLUMN IF NOT EXISTS "colorId" TEXT;
ALTER TABLE "StorefrontCard" ADD COLUMN IF NOT EXISTS "diameterId" TEXT;
ALTER TABLE "StorefrontCard" ADD COLUMN IF NOT EXISTS "progressiveTypeId" TEXT;

DO $$ BEGIN
  CREATE TYPE "StorefrontCardOverrideKind" AS ENUM ('PIN', 'EXCLUDE');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "StorefrontCardProductOverride" (
    "id" TEXT NOT NULL,
    "storefrontCardId" TEXT NOT NULL,
    "lensProductId" TEXT NOT NULL,
    "kind" "StorefrontCardOverrideKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StorefrontCardProductOverride_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "StorefrontCardProductOverride_storefrontCardId_lensProductId_key"
  ON "StorefrontCardProductOverride"("storefrontCardId", "lensProductId");
CREATE INDEX IF NOT EXISTS "StorefrontCardProductOverride_lensProductId_idx"
  ON "StorefrontCardProductOverride"("lensProductId");
CREATE INDEX IF NOT EXISTS "StorefrontCardProductOverride_storefrontCardId_kind_idx"
  ON "StorefrontCardProductOverride"("storefrontCardId", "kind");

DO $$ BEGIN
  ALTER TABLE "StorefrontCard" ADD CONSTRAINT "StorefrontCard_baseId_fkey"
    FOREIGN KEY ("baseId") REFERENCES "LensBase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "StorefrontCard" ADD CONSTRAINT "StorefrontCard_materialId_fkey"
    FOREIGN KEY ("materialId") REFERENCES "LensMaterial"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "StorefrontCard" ADD CONSTRAINT "StorefrontCard_indexId_fkey"
    FOREIGN KEY ("indexId") REFERENCES "LensIndex"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "StorefrontCard" ADD CONSTRAINT "StorefrontCard_coatingId_fkey"
    FOREIGN KEY ("coatingId") REFERENCES "LensCoating"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "StorefrontCard" ADD CONSTRAINT "StorefrontCard_colorId_fkey"
    FOREIGN KEY ("colorId") REFERENCES "LensColor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "StorefrontCard" ADD CONSTRAINT "StorefrontCard_diameterId_fkey"
    FOREIGN KEY ("diameterId") REFERENCES "LensDiameter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "StorefrontCard" ADD CONSTRAINT "StorefrontCard_progressiveTypeId_fkey"
    FOREIGN KEY ("progressiveTypeId") REFERENCES "LensProgressiveType"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "StorefrontCardProductOverride" ADD CONSTRAINT "StorefrontCardProductOverride_storefrontCardId_fkey"
    FOREIGN KEY ("storefrontCardId") REFERENCES "StorefrontCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "StorefrontCardProductOverride" ADD CONSTRAINT "StorefrontCardProductOverride_lensProductId_fkey"
    FOREIGN KEY ("lensProductId") REFERENCES "LensProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;