-- Dispatch cutoff: courier dispatch slot snapshot + super-admin manual override
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "dispatchDate" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "cutoffDeferred" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "dispatchOverrideStamp" JSONB;
CREATE INDEX IF NOT EXISTS "Order_dispatchDate_idx" ON "Order"("dispatchDate");

-- Existing orders pre-date the cutoff feature: never block them retroactively.
UPDATE "Order" SET "dispatchDate" = "createdAt" WHERE "dispatchDate" IS NULL;