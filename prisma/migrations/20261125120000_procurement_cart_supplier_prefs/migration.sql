-- AlterTable
ALTER TABLE "LensProductPower" ADD COLUMN "preferredSupplierId" TEXT;

-- AlterTable
ALTER TABLE "ProcurementRequest" ADD COLUMN "supplierId" TEXT;

-- CreateIndex
CREATE INDEX "ProcurementRequest_supplierId_status_idx" ON "ProcurementRequest"("supplierId", "status");

-- AddForeignKey
ALTER TABLE "LensProductPower" ADD CONSTRAINT "LensProductPower_preferredSupplierId_fkey" FOREIGN KEY ("preferredSupplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementRequest" ADD CONSTRAINT "ProcurementRequest_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
