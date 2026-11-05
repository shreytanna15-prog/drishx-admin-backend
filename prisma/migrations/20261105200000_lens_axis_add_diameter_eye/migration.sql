-- Axis / Addition / Diameter masters + family capability flags + parent FKs / eye.
-- Variant axisId; wipe test LensProduct rows; refresh uniqueness indexes.

-- Family capability flags
ALTER TABLE "LensFamily" ADD COLUMN IF NOT EXISTS "supportsAxis" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "LensFamily" ADD COLUMN IF NOT EXISTS "supportsAdd" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "LensFamily" ADD COLUMN IF NOT EXISTS "supportsEye" BOOLEAN NOT NULL DEFAULT false;

UPDATE "LensFamily" SET "supportsAxis" = true, "supportsAdd" = true, "supportsEye" = false WHERE "code" = 'KT';
UPDATE "LensFamily" SET "supportsAxis" = true, "supportsAdd" = true, "supportsEye" = true WHERE "code" = 'V2';
UPDATE "LensFamily" SET "supportsAxis" = false, "supportsAdd" = false, "supportsEye" = false WHERE "code" = 'SV';

-- Masters
CREATE TABLE IF NOT EXISTS "LensAxis" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LensAxis_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "LensAxis_code_key" ON "LensAxis"("code");
CREATE UNIQUE INDEX IF NOT EXISTS "LensAxis_value_key" ON "LensAxis"("value");
CREATE INDEX IF NOT EXISTS "LensAxis_isActive_sortOrder_idx" ON "LensAxis"("isActive", "sortOrder");

CREATE TABLE IF NOT EXISTS "LensAddition" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" DECIMAL(6,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LensAddition_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "LensAddition_code_key" ON "LensAddition"("code");
CREATE UNIQUE INDEX IF NOT EXISTS "LensAddition_value_key" ON "LensAddition"("value");
CREATE INDEX IF NOT EXISTS "LensAddition_isActive_sortOrder_idx" ON "LensAddition"("isActive", "sortOrder");

CREATE TABLE IF NOT EXISTS "LensDiameter" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LensDiameter_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "LensDiameter_code_key" ON "LensDiameter"("code");
CREATE UNIQUE INDEX IF NOT EXISTS "LensDiameter_value_key" ON "LensDiameter"("value");
CREATE INDEX IF NOT EXISTS "LensDiameter_isActive_sortOrder_idx" ON "LensDiameter"("isActive", "sortOrder");

-- Wipe test catalog products before tightening uniqueness
DELETE FROM "LensProductVariant";
DELETE FROM "LensProduct";

-- Parent optional FKs + eye
ALTER TABLE "LensProduct" ADD COLUMN IF NOT EXISTS "additionId" TEXT;
ALTER TABLE "LensProduct" ADD COLUMN IF NOT EXISTS "diameterId" TEXT;
ALTER TABLE "LensProduct" ADD COLUMN IF NOT EXISTS "eye" "Eye";

CREATE INDEX IF NOT EXISTS "LensProduct_additionId_idx" ON "LensProduct"("additionId");
CREATE INDEX IF NOT EXISTS "LensProduct_diameterId_idx" ON "LensProduct"("diameterId");

DO $$ BEGIN
  ALTER TABLE "LensProduct" ADD CONSTRAINT "LensProduct_additionId_fkey"
    FOREIGN KEY ("additionId") REFERENCES "LensAddition"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "LensProduct" ADD CONSTRAINT "LensProduct_diameterId_fkey"
    FOREIGN KEY ("diameterId") REFERENCES "LensDiameter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP INDEX IF EXISTS "LensProduct_attrs_key";
CREATE UNIQUE INDEX "LensProduct_attrs_key"
  ON "LensProduct" ("familyId", "baseId", "materialId", "indexId", "colorId", "additionId", "diameterId", "eye")
  NULLS NOT DISTINCT;

-- Variant axisId
ALTER TABLE "LensProductVariant" ADD COLUMN IF NOT EXISTS "axisId" TEXT;

CREATE INDEX IF NOT EXISTS "LensProductVariant_axisId_idx" ON "LensProductVariant"("axisId");

DO $$ BEGIN
  ALTER TABLE "LensProductVariant" ADD CONSTRAINT "LensProductVariant_axisId_fkey"
    FOREIGN KEY ("axisId") REFERENCES "LensAxis"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "LensProductVariant" DROP CONSTRAINT IF EXISTS "LensProductVariant_productId_powerRangeId_key";
DROP INDEX IF EXISTS "LensProductVariant_productId_powerRangeId_key";

CREATE UNIQUE INDEX "LensProductVariant_product_range_axis_key"
  ON "LensProductVariant" ("productId", "powerRangeId", "axisId")
  NULLS NOT DISTINCT;
