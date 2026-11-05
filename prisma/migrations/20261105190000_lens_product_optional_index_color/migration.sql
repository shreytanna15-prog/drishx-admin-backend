-- Make Index + Color optional on LensProduct parents (Family + Base remain required).
-- Replace partial material uniques with one NULLS NOT DISTINCT unique on the full attr tuple.

DROP INDEX IF EXISTS "LensProduct_attrs_with_material_key";
DROP INDEX IF EXISTS "LensProduct_attrs_null_material_key";

ALTER TABLE "LensProduct" ALTER COLUMN "indexId" DROP NOT NULL;
ALTER TABLE "LensProduct" ALTER COLUMN "colorId" DROP NOT NULL;

CREATE UNIQUE INDEX "LensProduct_attrs_key"
  ON "LensProduct" ("familyId", "baseId", "materialId", "indexId", "colorId")
  NULLS NOT DISTINCT;
