-- Stock S3: rebind PO / GRN / open-power lock to catalog stock leaves

-- PurchaseOrderLine: optional legacy + catalog leaf identity
ALTER TABLE "PurchaseOrderLine" ALTER COLUMN "lensType" DROP NOT NULL;
ALTER TABLE "PurchaseOrderLine" ALTER COLUMN "lensId" DROP NOT NULL;

ALTER TABLE "PurchaseOrderLine" ADD COLUMN "lensProductVariantId" TEXT;
ALTER TABLE "PurchaseOrderLine" ADD COLUMN "lensProductPowerId" TEXT;
ALTER TABLE "PurchaseOrderLine" ADD COLUMN "sph" DECIMAL(6,2);
ALTER TABLE "PurchaseOrderLine" ADD COLUMN "cyl" DECIMAL(6,2);

CREATE INDEX "PurchaseOrderLine_lensProductPowerId_idx" ON "PurchaseOrderLine"("lensProductPowerId");
CREATE INDEX "PurchaseOrderLine_lensProductVariantId_sph_cyl_idx" ON "PurchaseOrderLine"("lensProductVariantId", "sph", "cyl");

ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_lensProductVariantId_fkey" FOREIGN KEY ("lensProductVariantId") REFERENCES "LensProductVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_lensProductPowerId_fkey" FOREIGN KEY ("lensProductPowerId") REFERENCES "LensProductPower"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- GoodsReceiptLine: catalog leaf identity
ALTER TABLE "GoodsReceiptLine" ADD COLUMN "lensProductVariantId" TEXT;
ALTER TABLE "GoodsReceiptLine" ADD COLUMN "lensProductPowerId" TEXT;
ALTER TABLE "GoodsReceiptLine" ADD COLUMN "sph" DECIMAL(6,2);
ALTER TABLE "GoodsReceiptLine" ADD COLUMN "cyl" DECIMAL(6,2);

CREATE INDEX "GoodsReceiptLine_lensProductPowerId_idx" ON "GoodsReceiptLine"("lensProductPowerId");

ALTER TABLE "GoodsReceiptLine" ADD CONSTRAINT "GoodsReceiptLine_lensProductVariantId_fkey" FOREIGN KEY ("lensProductVariantId") REFERENCES "LensProductVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GoodsReceiptLine" ADD CONSTRAINT "GoodsReceiptLine_lensProductPowerId_fkey" FOREIGN KEY ("lensProductPowerId") REFERENCES "LensProductPower"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- OpenPurchaseOrderPower: id PK + optional catalog/legacy keys
ALTER TABLE "OpenPurchaseOrderPower" ADD COLUMN "id" TEXT;
UPDATE "OpenPurchaseOrderPower" SET "id" = md5(random()::text || clock_timestamp()::text || "lensId");
ALTER TABLE "OpenPurchaseOrderPower" ALTER COLUMN "id" SET NOT NULL;

ALTER TABLE "OpenPurchaseOrderPower" DROP CONSTRAINT "OpenPurchaseOrderPower_pkey";

ALTER TABLE "OpenPurchaseOrderPower" ALTER COLUMN "lensType" DROP NOT NULL;
ALTER TABLE "OpenPurchaseOrderPower" ALTER COLUMN "lensId" DROP NOT NULL;

ALTER TABLE "OpenPurchaseOrderPower" ADD COLUMN "lensProductPowerId" TEXT;

ALTER TABLE "OpenPurchaseOrderPower" ADD CONSTRAINT "OpenPurchaseOrderPower_pkey" PRIMARY KEY ("id");

CREATE UNIQUE INDEX "OpenPurchaseOrderPower_lensType_lensId_key" ON "OpenPurchaseOrderPower"("lensType", "lensId");
CREATE UNIQUE INDEX "OpenPurchaseOrderPower_lensProductPowerId_key" ON "OpenPurchaseOrderPower"("lensProductPowerId");

ALTER TABLE "OpenPurchaseOrderPower" ADD CONSTRAINT "OpenPurchaseOrderPower_lensProductPowerId_fkey" FOREIGN KEY ("lensProductPowerId") REFERENCES "LensProductPower"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
