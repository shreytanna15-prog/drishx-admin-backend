-- Delivery Module: service master + per-order audit record
CREATE TABLE IF NOT EXISTS "DeliveryService" (
  "id" TEXT NOT NULL,
  "courierCompany" TEXT NOT NULL,
  "serviceName" TEXT NOT NULL,
  "serviceType" TEXT NOT NULL DEFAULT 'LAND',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "customerRate" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "billingMethod" TEXT NOT NULL DEFAULT 'PER_KG',
  "flatCharge" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "minCharge" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "minWeight" DECIMAL(65,30) NOT NULL DEFAULT 1,
  "weightRounding" TEXT NOT NULL DEFAULT 'NEXT_1KG',
  "internalCostRate" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "internalMinCost" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "etaText" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DeliveryService_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "DeliveryService_isActive_idx" ON "DeliveryService"("isActive");

CREATE TABLE IF NOT EXISTS "OrderDelivery" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "deliveryServiceId" TEXT NOT NULL,
  "actualWeight" DECIMAL(65,30) NOT NULL,
  "chargeableWeight" DECIMAL(65,30) NOT NULL,
  "customerCharge" DECIMAL(65,30) NOT NULL,
  "internalCost" DECIMAL(65,30) NOT NULL,
  "margin" DECIMAL(65,30) NOT NULL,
  "packages" JSONB,
  "weightEnteredBy" TEXT,
  "weightEnteredAt" TIMESTAMP(3),
  "weightHistory" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OrderDelivery_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "OrderDelivery_orderId_key" ON "OrderDelivery"("orderId");
CREATE INDEX IF NOT EXISTS "OrderDelivery_deliveryServiceId_idx" ON "OrderDelivery"("deliveryServiceId");

ALTER TABLE "OrderDelivery" ADD CONSTRAINT "OrderDelivery_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderDelivery" ADD CONSTRAINT "OrderDelivery_deliveryServiceId_fkey" FOREIGN KEY ("deliveryServiceId") REFERENCES "DeliveryService"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "deliveryServiceId" TEXT;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Order_deliveryServiceId_fkey') THEN
    ALTER TABLE "Order" ADD CONSTRAINT "Order_deliveryServiceId_fkey" FOREIGN KEY ("deliveryServiceId") REFERENCES "DeliveryService"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
