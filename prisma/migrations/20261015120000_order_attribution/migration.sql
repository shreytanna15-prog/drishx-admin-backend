-- RW-10: Order placement attribution (admin / employee on-behalf).
-- (DO NOT APPLY without approval). Additive only — no drops, no backfill guesses.
-- Legacy rows keep orderSource NULL and placedByUserId NULL.

CREATE TYPE "OrderSource" AS ENUM ('CUSTOMER_APP', 'EMPLOYEE_ON_BEHALF', 'ADMIN_PANEL');

ALTER TABLE "Order" ADD COLUMN "placedByUserId" TEXT;
ALTER TABLE "Order" ADD COLUMN "orderSource" "OrderSource";

CREATE INDEX "Order_placedByUserId_idx" ON "Order"("placedByUserId");
CREATE INDEX "Order_orderSource_idx" ON "Order"("orderSource");

ALTER TABLE "Order" ADD CONSTRAINT "Order_placedByUserId_fkey" FOREIGN KEY ("placedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
