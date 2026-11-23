-- Stock S4: ProcurementRequest catalog leaf identity

ALTER TABLE "ProcurementRequest" ALTER COLUMN "lensType" DROP NOT NULL;
ALTER TABLE "ProcurementRequest" ALTER COLUMN "lensId" DROP NOT NULL;

ALTER TABLE "ProcurementRequest" ADD COLUMN "lensProductPowerId" TEXT;

CREATE INDEX "ProcurementRequest_lensProductPowerId_status_idx" ON "ProcurementRequest"("lensProductPowerId", "status");

ALTER TABLE "ProcurementRequest" ADD CONSTRAINT "ProcurementRequest_lensProductPowerId_fkey" FOREIGN KEY ("lensProductPowerId") REFERENCES "LensProductPower"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "LensProductPower_minStock_targetStock_idx" ON "LensProductPower"("minStock", "targetStock");
