-- Admin Orders Full Control: staff notes, shipping, cancel reason, activity log
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "internalNotes" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "cancelReason" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "courierName" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "trackingNumber" TEXT;

CREATE INDEX IF NOT EXISTS "Order_status_idx" ON "Order"("status");

CREATE TABLE IF NOT EXISTS "OrderActivityLog" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderActivityLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "OrderActivityLog_orderId_createdAt_idx" ON "OrderActivityLog"("orderId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "OrderActivityLog" ADD CONSTRAINT "OrderActivityLog_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "OrderActivityLog" ADD CONSTRAINT "OrderActivityLog_actorUserId_fkey"
    FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
