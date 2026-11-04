-- RC-05: one LensProduct parent when material is absent.
-- Postgres treats NULL as distinct in UNIQUE, so the old 5-column unique
-- allowed multiple parents with materialId IS NULL. Replace with partial uniques.

DROP INDEX IF EXISTS "LensProduct_familyId_baseId_materialId_indexId_colorId_key";

-- Material present: full attribute tuple must be unique.
CREATE UNIQUE INDEX "LensProduct_attrs_with_material_key"
  ON "LensProduct" ("familyId", "baseId", "materialId", "indexId", "colorId")
  WHERE "materialId" IS NOT NULL;

-- Material absent: one parent per (family, base, index, color).
CREATE UNIQUE INDEX "LensProduct_attrs_null_material_key"
  ON "LensProduct" ("familyId", "baseId", "indexId", "colorId")
  WHERE "materialId" IS NULL;
