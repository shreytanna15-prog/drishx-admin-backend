-- Existing products are left unclassified. Do not guess a coating from base,
-- material, color, or a legacy lens row; new products require an explicit choice.
ALTER TABLE "LensProduct" ADD COLUMN "coatingId" TEXT;

CREATE INDEX "LensProduct_coatingId_idx" ON "LensProduct"("coatingId");
ALTER TABLE "LensProduct" ADD CONSTRAINT "LensProduct_coatingId_fkey"
  FOREIGN KEY ("coatingId") REFERENCES "LensCoating"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

DROP INDEX "LensProduct_attrs_unique";
CREATE UNIQUE INDEX "LensProduct_attrs_unique"
  ON "LensProduct" ("familyId", "baseId", "materialId", "indexId", "colorId", "diameterId", "progressiveTypeId", "coatingId")
  NULLS NOT DISTINCT;
