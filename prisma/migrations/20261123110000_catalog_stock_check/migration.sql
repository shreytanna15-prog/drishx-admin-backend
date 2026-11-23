-- Stock S2b: physical stock check sessions + freeze

CREATE TYPE "CatalogStockCheckStatus" AS ENUM ('OPEN', 'SUBMITTED', 'VERIFIED', 'CANCELLED');

CREATE TABLE "CatalogStockCheckSession" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "productId" TEXT,
    "status" "CatalogStockCheckStatus" NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "startedById" TEXT NOT NULL,
    "submittedById" TEXT,
    "verifiedById" TEXT,
    "cancelledById" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogStockCheckSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CatalogStockCheckSession_publicId_key" ON "CatalogStockCheckSession"("publicId");
CREATE INDEX "CatalogStockCheckSession_status_startedAt_idx" ON "CatalogStockCheckSession"("status", "startedAt");
CREATE INDEX "CatalogStockCheckSession_productId_status_idx" ON "CatalogStockCheckSession"("productId", "status");
CREATE INDEX "CatalogStockCheckSession_startedById_startedAt_idx" ON "CatalogStockCheckSession"("startedById", "startedAt");
CREATE INDEX "CatalogStockCheckSession_createdAt_idx" ON "CatalogStockCheckSession"("createdAt");

CREATE TABLE "CatalogStockCheckLine" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "lensProductPowerId" TEXT NOT NULL,
    "systemQtyAtStart" INTEGER NOT NULL,
    "countedQty" INTEGER,
    "verifiedCountedQty" INTEGER,
    "adjustmentId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogStockCheckLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CatalogStockCheckLine_sessionId_lensProductPowerId_key"
  ON "CatalogStockCheckLine"("sessionId", "lensProductPowerId");
CREATE INDEX "CatalogStockCheckLine_lensProductPowerId_idx" ON "CatalogStockCheckLine"("lensProductPowerId");
CREATE INDEX "CatalogStockCheckLine_sessionId_idx" ON "CatalogStockCheckLine"("sessionId");

ALTER TABLE "CatalogStockCheckLine"
  ADD CONSTRAINT "CatalogStockCheckLine_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "CatalogStockCheckSession"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CatalogStockCheckLine"
  ADD CONSTRAINT "CatalogStockCheckLine_lensProductPowerId_fkey"
  FOREIGN KEY ("lensProductPowerId") REFERENCES "LensProductPower"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
