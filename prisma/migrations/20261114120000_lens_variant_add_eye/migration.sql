-- Move ADD off parent onto variant; drop parent eye; uniqueness includes additionId + eye.
-- Keeps diameter on parent. Idempotent relative to 20261105200000_lens_axis_add_diameter_eye.

DELETE FROM "LensProductVariant";
DELETE FROM "LensProduct";

-- Drop parent addition / eye (may exist from prior migration)
ALTER TABLE "LensProduct" DROP CONSTRAINT IF EXISTS "LensProduct_additionId_fkey";
DROP INDEX IF EXISTS "LensProduct_additionId_idx";
DROP INDEX IF EXISTS "LensProduct_attrs_key";

ALTER TABLE "LensProduct" DROP COLUMN IF EXISTS "additionId";
ALTER TABLE "LensProduct" DROP COLUMN IF EXISTS "eye";

-- Ensure diameter column/FK (from prior migration)
ALTER TABLE "LensProduct" ADD COLUMN IF NOT EXISTS "diameterId" TEXT;
CREATE INDEX IF NOT EXISTS "LensProduct_diameterId_idx" ON "LensProduct"("diameterId");
DO $$ BEGIN
  ALTER TABLE "LensProduct" ADD CONSTRAINT "LensProduct_diameterId_fkey"
    FOREIGN KEY ("diameterId") REFERENCES "LensDiameter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX "LensProduct_attrs_key"
  ON "LensProduct" ("familyId", "baseId", "materialId", "indexId", "colorId", "diameterId")
  NULLS NOT DISTINCT;

-- Variant axisId (may already exist)
ALTER TABLE "LensProductVariant" ADD COLUMN IF NOT EXISTS "axisId" TEXT;
CREATE INDEX IF NOT EXISTS "LensProductVariant_axisId_idx" ON "LensProductVariant"("axisId");
DO $$ BEGIN
  ALTER TABLE "LensProductVariant" ADD CONSTRAINT "LensProductVariant_axisId_fkey"
    FOREIGN KEY ("axisId") REFERENCES "LensAxis"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Variant additionId
ALTER TABLE "LensProductVariant" ADD COLUMN IF NOT EXISTS "additionId" TEXT;
CREATE INDEX IF NOT EXISTS "LensProductVariant_additionId_idx" ON "LensProductVariant"("additionId");
DO $$ BEGIN
  ALTER TABLE "LensProductVariant" ADD CONSTRAINT "LensProductVariant_additionId_fkey"
    FOREIGN KEY ("additionId") REFERENCES "LensAddition"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "LensProductVariant" DROP CONSTRAINT IF EXISTS "LensProductVariant_productId_powerRangeId_key";
DROP INDEX IF EXISTS "LensProductVariant_productId_powerRangeId_key";
DROP INDEX IF EXISTS "LensProductVariant_product_range_axis_key";

CREATE UNIQUE INDEX "LensProductVariant_product_range_axis_add_eye_key"
  ON "LensProductVariant" ("productId", "powerRangeId", "axisId", "additionId", "eye")
  NULLS NOT DISTINCT;
