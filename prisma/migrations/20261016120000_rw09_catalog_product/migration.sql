-- RW-09: Catalog product master + ranges + range→leaf map (facade over lens tables).
-- (DO NOT APPLY without approval). Additive only — no drops.
-- Ordered after RW-10 order_attribution (20261015120000).
-- Does not alter SingleVisionLens / KryptokLens / ProgressiveLens columns.
--
-- Option 1B: new ranges generate POWER_WISE exact-power leaves; legacy inventory
-- remains LEGACY_BAND (one shared-quantity row) when backfilled.

CREATE TYPE "CatalogProductStatus" AS ENUM ('ACTIVE', 'HELD', 'ARCHIVED');
CREATE TYPE "CatalogLensFamily" AS ENUM ('SINGLE_VISION', 'KRYPTOK', 'PROGRESSIVE');
CREATE TYPE "CatalogLeafStorage" AS ENUM ('LEGACY_BAND', 'POWER_WISE');

CREATE TABLE "CatalogProduct" (
    "id" TEXT NOT NULL,
    "lensFamily" "CatalogLensFamily" NOT NULL,
    "category" TEXT,
    "brand" TEXT NOT NULL,
    "item" TEXT,
    "index" DECIMAL(65,30),
    "coating" TEXT NOT NULL,
    "progressiveType" TEXT,
    "defaultPrice" DECIMAL(65,30) NOT NULL,
    "defaultCostPrice" DECIMAL(65,30),
    "status" "CatalogProductStatus" NOT NULL DEFAULT 'ACTIVE',
    "identityKey" TEXT NOT NULL,
    "notes" TEXT,
    "heldAt" TIMESTAMP(3),
    "heldByUserId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "archivedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogProduct_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CatalogProduct_identityKey_key" ON "CatalogProduct"("identityKey");
CREATE INDEX "CatalogProduct_lensFamily_status_idx" ON "CatalogProduct"("lensFamily", "status");
CREATE INDEX "CatalogProduct_brand_idx" ON "CatalogProduct"("brand");
CREATE INDEX "CatalogProduct_coating_idx" ON "CatalogProduct"("coating");
CREATE INDEX "CatalogProduct_status_idx" ON "CatalogProduct"("status");

CREATE TABLE "CatalogRange" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sphStart" DECIMAL(65,30) NOT NULL,
    "sphEnd" DECIMAL(65,30) NOT NULL,
    "cylStart" DECIMAL(65,30),
    "cylEnd" DECIMAL(65,30),
    "add" DECIMAL(65,30),
    "axis" INTEGER,
    "eye" "Eye",
    "price" DECIMAL(65,30) NOT NULL,
    "costPrice" DECIMAL(65,30),
    "powerCount" INTEGER NOT NULL DEFAULT 0,
    "leafStorage" "CatalogLeafStorage" NOT NULL DEFAULT 'POWER_WISE',
    "lensType" "LensType" NOT NULL,
    "lensId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogRange_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CatalogRange_productId_label_key" ON "CatalogRange"("productId", "label");
CREATE INDEX "CatalogRange_productId_idx" ON "CatalogRange"("productId");
CREATE INDEX "CatalogRange_lensType_lensId_idx" ON "CatalogRange"("lensType", "lensId");

ALTER TABLE "CatalogRange" ADD CONSTRAINT "CatalogRange_productId_fkey" FOREIGN KEY ("productId") REFERENCES "CatalogProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CatalogRangeLeaf" (
    "id" TEXT NOT NULL,
    "rangeId" TEXT NOT NULL,
    "lensType" "LensType" NOT NULL,
    "lensId" TEXT NOT NULL,
    "disabledByProductHold" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CatalogRangeLeaf_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CatalogRangeLeaf_lensType_lensId_key" ON "CatalogRangeLeaf"("lensType", "lensId");
CREATE UNIQUE INDEX "CatalogRangeLeaf_rangeId_lensId_key" ON "CatalogRangeLeaf"("rangeId", "lensId");
CREATE INDEX "CatalogRangeLeaf_rangeId_idx" ON "CatalogRangeLeaf"("rangeId");

ALTER TABLE "CatalogRangeLeaf" ADD CONSTRAINT "CatalogRangeLeaf_rangeId_fkey" FOREIGN KEY ("rangeId") REFERENCES "CatalogRange"("id") ON DELETE CASCADE ON UPDATE CASCADE;
