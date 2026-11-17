-- Catalog reset: variant names are display labels only and may repeat across
-- ADD/eye children of the same parent. Identity lives in skuCode + the
-- (productId, powerRangeId, axisId, additionId, eye) unique index.
--
-- Existing catalog parents + children are cleared so legacy auto-NORMAL
-- parents can be recreated with the new optional progressive-type rule.
-- Attribute masters (families, bases, materials, indexes, colors, diameters,
-- progressive types, axes, additions, power ranges) are NOT touched.

DELETE FROM "LensProductVariant";
DELETE FROM "LensProduct";

DROP INDEX IF EXISTS "LensProductVariant_name_key";
