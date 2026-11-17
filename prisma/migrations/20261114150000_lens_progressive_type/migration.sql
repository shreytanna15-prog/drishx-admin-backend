-- Progressive type master + parent FK (V2 identity). Default NORMAL when blank.

ALTER TABLE "LensFamily" ADD COLUMN IF NOT EXISTS "supportsProgressiveType" BOOLEAN NOT NULL DEFAULT false;

UPDATE "LensFamily" SET "supportsProgressiveType" = true WHERE "code" = 'V2';
UPDATE "LensFamily" SET "supportsProgressiveType" = false WHERE "code" <> 'V2';

CREATE TABLE IF NOT EXISTS "LensProgressiveType" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LensProgressiveType_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "LensProgressiveType_code_key" ON "LensProgressiveType"("code");
CREATE INDEX IF NOT EXISTS "LensProgressiveType_isActive_sortOrder_idx" ON "LensProgressiveType"("isActive", "sortOrder");

INSERT INTO "LensProgressiveType" ("id", "code", "name", "isActive", "sortOrder", "createdAt", "updatedAt")
VALUES
  ('seed_prog_type_normal', 'NORMAL', 'Normal', true, 10, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed_prog_type_digital', 'DIGITAL', 'Digital', true, 20, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed_prog_type_freeform', 'FREEFORM', 'Freeform', true, 30, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('seed_prog_type_9p4', '9P4', '9+4 design', true, 40, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO UPDATE SET
  "name" = EXCLUDED."name",
  "isActive" = true,
  "sortOrder" = EXCLUDED."sortOrder",
  "updatedAt" = CURRENT_TIMESTAMP;

ALTER TABLE "LensProduct" ADD COLUMN IF NOT EXISTS "progressiveTypeId" TEXT;
CREATE INDEX IF NOT EXISTS "LensProduct_progressiveTypeId_idx" ON "LensProduct"("progressiveTypeId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'LensProduct_progressiveTypeId_fkey'
  ) THEN
    ALTER TABLE "LensProduct" ADD CONSTRAINT "LensProduct_progressiveTypeId_fkey"
      FOREIGN KEY ("progressiveTypeId") REFERENCES "LensProgressiveType"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- Backfill existing Progressive (V2) parents to Normal.
UPDATE "LensProduct" p
SET "progressiveTypeId" = (
  SELECT t."id" FROM "LensProgressiveType" t WHERE t."code" = 'NORMAL' LIMIT 1
)
FROM "LensFamily" f
WHERE p."familyId" = f."id"
  AND f."supportsProgressiveType" = true
  AND p."progressiveTypeId" IS NULL;

DROP INDEX IF EXISTS "LensProduct_attrs_unique";
CREATE UNIQUE INDEX "LensProduct_attrs_unique"
  ON "LensProduct" ("familyId", "baseId", "materialId", "indexId", "colorId", "diameterId", "progressiveTypeId")
  NULLS NOT DISTINCT;
