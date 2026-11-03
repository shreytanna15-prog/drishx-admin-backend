-- RC-04: LensProduct becomes parent; LensProductVariant holds sellable SKU/name.
-- Cutover: drop existing test catalog products (no data migration).

DELETE FROM "LensProduct";

-- Drop old LensProduct columns / FKs that move to variants or leave identity
ALTER TABLE "LensProduct" DROP CONSTRAINT IF EXISTS "LensProduct_coatingId_fkey";
ALTER TABLE "LensProduct" DROP CONSTRAINT IF EXISTS "LensProduct_powerRangeId_fkey";
ALTER TABLE "LensProduct" DROP CONSTRAINT IF EXISTS "LensProduct_skuCode_key";

DROP INDEX IF EXISTS "LensProduct_powerRangeId_idx";

ALTER TABLE "LensProduct" DROP COLUMN IF EXISTS "skuCode";
ALTER TABLE "LensProduct" DROP COLUMN IF EXISTS "name";
ALTER TABLE "LensProduct" DROP COLUMN IF EXISTS "coatingId";
ALTER TABLE "LensProduct" DROP COLUMN IF EXISTS "powerRangeId";
ALTER TABLE "LensProduct" DROP COLUMN IF EXISTS "rangeType";
ALTER TABLE "LensProduct" DROP COLUMN IF EXISTS "sphMin";
ALTER TABLE "LensProduct" DROP COLUMN IF EXISTS "sphMax";
ALTER TABLE "LensProduct" DROP COLUMN IF EXISTS "cylMin";
ALTER TABLE "LensProduct" DROP COLUMN IF EXISTS "cylMax";
ALTER TABLE "LensProduct" DROP COLUMN IF EXISTS "addMin";
ALTER TABLE "LensProduct" DROP COLUMN IF EXISTS "addMax";
ALTER TABLE "LensProduct" DROP COLUMN IF EXISTS "axis";
ALTER TABLE "LensProduct" DROP COLUMN IF EXISTS "eye";
ALTER TABLE "LensProduct" DROP COLUMN IF EXISTS "defaultPrice";

-- Parent fields
ALTER TABLE "LensProduct" ADD COLUMN IF NOT EXISTS "baseCode" TEXT;
-- Temporary placeholder for empty table; enforce NOT NULL after backfill
UPDATE "LensProduct" SET "baseCode" = "id" WHERE "baseCode" IS NULL;
ALTER TABLE "LensProduct" ALTER COLUMN "baseCode" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "LensProduct_baseCode_key" ON "LensProduct"("baseCode");

-- indexId / colorId required on parent
ALTER TABLE "LensProduct" ALTER COLUMN "indexId" SET NOT NULL;
ALTER TABLE "LensProduct" ALTER COLUMN "colorId" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "LensProduct_familyId_baseId_materialId_indexId_colorId_key"
  ON "LensProduct"("familyId", "baseId", "materialId", "indexId", "colorId");

CREATE TABLE IF NOT EXISTS "LensProductVariant" (
  "id" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "powerRangeId" TEXT NOT NULL,
  "skuCode" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "rangeType" TEXT NOT NULL DEFAULT 'NORMAL',
  "sphMin" DECIMAL(6,2) NOT NULL,
  "sphMax" DECIMAL(6,2) NOT NULL,
  "cylMin" DECIMAL(6,2) NOT NULL,
  "cylMax" DECIMAL(6,2) NOT NULL,
  "addMin" DECIMAL(65,30),
  "addMax" DECIMAL(65,30),
  "axis" INTEGER,
  "eye" TEXT,
  "defaultPrice" DECIMAL(65,30),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LensProductVariant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "LensProductVariant_skuCode_key" ON "LensProductVariant"("skuCode");
CREATE UNIQUE INDEX IF NOT EXISTS "LensProductVariant_name_key" ON "LensProductVariant"("name");
CREATE UNIQUE INDEX IF NOT EXISTS "LensProductVariant_productId_powerRangeId_key"
  ON "LensProductVariant"("productId", "powerRangeId");
CREATE INDEX IF NOT EXISTS "LensProductVariant_productId_isActive_idx"
  ON "LensProductVariant"("productId", "isActive");
CREATE INDEX IF NOT EXISTS "LensProductVariant_powerRangeId_idx"
  ON "LensProductVariant"("powerRangeId");
CREATE INDEX IF NOT EXISTS "LensProductVariant_isActive_updatedAt_idx"
  ON "LensProductVariant"("isActive", "updatedAt");

ALTER TABLE "LensProductVariant"
  DROP CONSTRAINT IF EXISTS "LensProductVariant_productId_fkey";
ALTER TABLE "LensProductVariant"
  ADD CONSTRAINT "LensProductVariant_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "LensProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "LensProductVariant"
  DROP CONSTRAINT IF EXISTS "LensProductVariant_powerRangeId_fkey";
ALTER TABLE "LensProductVariant"
  ADD CONSTRAINT "LensProductVariant_powerRangeId_fkey"
  FOREIGN KEY ("powerRangeId") REFERENCES "LensPowerRange"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
