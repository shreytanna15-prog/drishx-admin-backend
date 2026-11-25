ALTER TABLE "Order" ADD COLUMN "lensProductPowerId" TEXT;
ALTER TABLE "OrderPowerVersion" ADD COLUMN "lensProductPowerId" TEXT;
ALTER TABLE "CartReservation" ADD COLUMN "lensProductPowerId" TEXT;
ALTER TABLE "WholesaleOrderLineItem" ADD COLUMN "lensProductPowerId" TEXT;
ALTER TABLE "ReturnRequestItem" ADD COLUMN "lensProductPowerId" TEXT,
  ADD COLUMN "saleableRestockedQuantity" INTEGER NOT NULL DEFAULT 0;
ALTER TYPE "ReturnTimelineEventType" ADD VALUE 'STOCK_CORRECTED';

CREATE TYPE "OrderModificationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TABLE "OrderModificationRequest" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "requestedById" TEXT NOT NULL,
  "requestedQuantity" INTEGER NOT NULL,
  "requestedPowerId" TEXT,
  "reason" TEXT NOT NULL,
  "status" "OrderModificationStatus" NOT NULL DEFAULT 'PENDING',
  "decidedById" TEXT,
  "decisionReason" TEXT,
  "goodsReturnedConfirmed" BOOLEAN NOT NULL DEFAULT false,
  "decidedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderModificationRequest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OrderModificationRequest_orderId_status_idx" ON "OrderModificationRequest"("orderId", "status");
CREATE INDEX "OrderModificationRequest_status_createdAt_idx" ON "OrderModificationRequest"("status", "createdAt");
CREATE UNIQUE INDEX "OrderModificationRequest_one_pending_per_order" ON "OrderModificationRequest"("orderId") WHERE "status" = 'PENDING';
ALTER TABLE "OrderModificationRequest" ADD CONSTRAINT "OrderModificationRequest_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "Order_lensProductPowerId_status_idx" ON "Order"("lensProductPowerId", "status");
CREATE INDEX "OrderPowerVersion_lensProductPowerId_idx" ON "OrderPowerVersion"("lensProductPowerId");
CREATE INDEX "CartReservation_lensProductPowerId_idx" ON "CartReservation"("lensProductPowerId");
CREATE INDEX "WholesaleOrderLineItem_lensProductPowerId_idx" ON "WholesaleOrderLineItem"("lensProductPowerId");
CREATE INDEX "ReturnRequestItem_lensProductPowerId_idx" ON "ReturnRequestItem"("lensProductPowerId");

ALTER TABLE "Order" ADD CONSTRAINT "Order_lensProductPowerId_fkey" FOREIGN KEY ("lensProductPowerId") REFERENCES "LensProductPower"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderPowerVersion" ADD CONSTRAINT "OrderPowerVersion_lensProductPowerId_fkey" FOREIGN KEY ("lensProductPowerId") REFERENCES "LensProductPower"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CartReservation" ADD CONSTRAINT "CartReservation_lensProductPowerId_fkey" FOREIGN KEY ("lensProductPowerId") REFERENCES "LensProductPower"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WholesaleOrderLineItem" ADD CONSTRAINT "WholesaleOrderLineItem_lensProductPowerId_fkey" FOREIGN KEY ("lensProductPowerId") REFERENCES "LensProductPower"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReturnRequestItem" ADD CONSTRAINT "ReturnRequestItem_lensProductPowerId_fkey" FOREIGN KEY ("lensProductPowerId") REFERENCES "LensProductPower"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
