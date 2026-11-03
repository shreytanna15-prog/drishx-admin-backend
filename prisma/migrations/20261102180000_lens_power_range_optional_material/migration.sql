-- RC-03: power-range attribute master + optional material on LensProduct.
-- No data migration: delete and recreate existing test LensProduct rows after deploy.

-- CreateTable
CREATE TABLE "LensPowerRange" (
    "id" TEXT NOT NULL,
    "sphMin" DECIMAL(6,2) NOT NULL,
    "sphMax" DECIMAL(6,2) NOT NULL,
    "cylMin" DECIMAL(6,2) NOT NULL,
    "cylMax" DECIMAL(6,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LensPowerRange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LensPowerRange_sphMin_sphMax_cylMin_cylMax_key" ON "LensPowerRange"("sphMin", "sphMax", "cylMin", "cylMax");

-- CreateIndex
CREATE INDEX "LensPowerRange_isActive_sortOrder_idx" ON "LensPowerRange"("isActive", "sortOrder");

-- AlterTable: material optional, power range FK (nullable in DB; service requires it on create)
ALTER TABLE "LensProduct" ALTER COLUMN "materialId" DROP NOT NULL;
ALTER TABLE "LensProduct" ADD COLUMN "powerRangeId" TEXT;

-- CreateIndex
CREATE INDEX "LensProduct_powerRangeId_idx" ON "LensProduct"("powerRangeId");

-- AddForeignKey
ALTER TABLE "LensProduct" ADD CONSTRAINT "LensProduct_powerRangeId_fkey" FOREIGN KEY ("powerRangeId") REFERENCES "LensPowerRange"("id") ON DELETE SET NULL ON UPDATE CASCADE;
