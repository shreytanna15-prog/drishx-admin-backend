-- RW-05: Admin hold → warehouse release for RX / photo prescription orders.
-- (DO NOT APPLY without approval). Additive only — no drops.
-- Compatible with unapplied RW-08 migration (independent Order columns).

ALTER TABLE "Order" ADD COLUMN "warehouseHold" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Order" ADD COLUMN "warehouseReleasedAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "warehouseReleasedById" TEXT;

CREATE INDEX "Order_warehouseHold_warehouseReleasedAt_idx" ON "Order"("warehouseHold", "warehouseReleasedAt");
