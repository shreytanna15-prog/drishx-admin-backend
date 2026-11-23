-- Stock S1: catalog stock leaf = variant + exact SPH + CYL.
CREATE TABLE "LensProductPower" (
    "id" TEXT NOT NULL,
    "lensProductVariantId" TEXT NOT NULL,
    "sph" DECIMAL(6,2) NOT NULL,
    "cyl" DECIMAL(6,2) NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "blockedQty" INTEGER NOT NULL DEFAULT 0,
    "minStock" INTEGER NOT NULL DEFAULT 0,
    "targetStock" INTEGER NOT NULL DEFAULT 0,
    "legacyLensType" "LensType",
    "legacyLensId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LensProductPower_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LensProductPower_lensProductVariantId_sph_cyl_key"
  ON "LensProductPower"("lensProductVariantId", "sph", "cyl");

CREATE INDEX "LensProductPower_lensProductVariantId_idx"
  ON "LensProductPower"("lensProductVariantId");

CREATE INDEX "LensProductPower_legacyLensType_legacyLensId_idx"
  ON "LensProductPower"("legacyLensType", "legacyLensId");

ALTER TABLE "LensProductPower"
  ADD CONSTRAINT "LensProductPower_lensProductVariantId_fkey"
  FOREIGN KEY ("lensProductVariantId") REFERENCES "LensProductVariant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
