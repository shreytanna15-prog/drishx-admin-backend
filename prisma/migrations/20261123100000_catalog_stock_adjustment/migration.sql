-- Stock S2: catalog stock adjustments + StockMovement.lensProductPowerId

CREATE TYPE "CatalogStockAdjustmentStatus" AS ENUM ('APPLIED', 'PENDING_VERIFY', 'REJECTED');

CREATE TABLE "CatalogStockAdjustment" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "lensProductPowerId" TEXT NOT NULL,
    "qtyBefore" INTEGER NOT NULL,
    "countedQty" INTEGER NOT NULL,
    "qtyDelta" INTEGER NOT NULL,
    "qtyAfter" INTEGER NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "reasonText" TEXT,
    "status" "CatalogStockAdjustmentStatus" NOT NULL DEFAULT 'APPLIED',
    "submittedById" TEXT NOT NULL,
    "approvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogStockAdjustment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CatalogStockAdjustment_publicId_key" ON "CatalogStockAdjustment"("publicId");
CREATE INDEX "CatalogStockAdjustment_lensProductPowerId_createdAt_idx" ON "CatalogStockAdjustment"("lensProductPowerId", "createdAt");
CREATE INDEX "CatalogStockAdjustment_submittedById_createdAt_idx" ON "CatalogStockAdjustment"("submittedById", "createdAt");
CREATE INDEX "CatalogStockAdjustment_status_createdAt_idx" ON "CatalogStockAdjustment"("status", "createdAt");
CREATE INDEX "CatalogStockAdjustment_createdAt_idx" ON "CatalogStockAdjustment"("createdAt");

ALTER TABLE "CatalogStockAdjustment"
  ADD CONSTRAINT "CatalogStockAdjustment_lensProductPowerId_fkey"
  FOREIGN KEY ("lensProductPowerId") REFERENCES "LensProductPower"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Allow catalog-only movements (legacy columns optional).
ALTER TABLE "StockMovement" ALTER COLUMN "lensType" DROP NOT NULL;
ALTER TABLE "StockMovement" ALTER COLUMN "lensId" DROP NOT NULL;
ALTER TABLE "StockMovement" ADD COLUMN "lensProductPowerId" TEXT;

CREATE INDEX "StockMovement_lensProductPowerId_createdAt_idx"
  ON "StockMovement"("lensProductPowerId", "createdAt");

ALTER TABLE "StockMovement"
  ADD CONSTRAINT "StockMovement_lensProductPowerId_fkey"
  FOREIGN KEY ("lensProductPowerId") REFERENCES "LensProductPower"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
