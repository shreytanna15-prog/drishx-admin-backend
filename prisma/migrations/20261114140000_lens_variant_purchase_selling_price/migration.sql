-- Replace optional defaultPrice with required purchasePrice + sellingPrice (default 0).

ALTER TABLE "LensProductVariant" ADD COLUMN IF NOT EXISTS "purchasePrice" DECIMAL(12,2);
ALTER TABLE "LensProductVariant" ADD COLUMN IF NOT EXISTS "sellingPrice" DECIMAL(12,2);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'LensProductVariant'
      AND column_name = 'defaultPrice'
  ) THEN
    EXECUTE $u$
      UPDATE "LensProductVariant"
      SET
        "purchasePrice" = COALESCE("purchasePrice", 0),
        "sellingPrice" = COALESCE("sellingPrice", COALESCE("defaultPrice", 0))
    $u$;
    EXECUTE 'ALTER TABLE "LensProductVariant" DROP COLUMN "defaultPrice"';
  ELSE
    UPDATE "LensProductVariant"
    SET
      "purchasePrice" = COALESCE("purchasePrice", 0),
      "sellingPrice" = COALESCE("sellingPrice", 0);
  END IF;
END $$;

ALTER TABLE "LensProductVariant" ALTER COLUMN "purchasePrice" SET DEFAULT 0;
ALTER TABLE "LensProductVariant" ALTER COLUMN "sellingPrice" SET DEFAULT 0;
UPDATE "LensProductVariant" SET "purchasePrice" = 0 WHERE "purchasePrice" IS NULL;
UPDATE "LensProductVariant" SET "sellingPrice" = 0 WHERE "sellingPrice" IS NULL;
ALTER TABLE "LensProductVariant" ALTER COLUMN "purchasePrice" SET NOT NULL;
ALTER TABLE "LensProductVariant" ALTER COLUMN "sellingPrice" SET NOT NULL;
