-- Older multi-ADD migration left a unique index that omitted eye.
-- Eye is part of the sellable child identity, so LEFT and RIGHT must coexist
-- for the same product/range/axis/ADD. Keep the eye-aware unique index.

DROP INDEX IF EXISTS "LensProductVariant_product_range_axis_add_key";
