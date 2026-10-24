-- Phase F: cancelled-order refund due + payouts

CREATE TYPE "OrderRefundStatus" AS ENUM ('DUE', 'PARTIAL', 'PAID', 'CANCELLED');

CREATE TABLE "OrderRefund" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "amountDue" DECIMAL(65,30) NOT NULL,
    "amountPaid" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "status" "OrderRefundStatus" NOT NULL DEFAULT 'DUE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderRefund_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OrderRefundPayout" (
    "id" TEXT NOT NULL,
    "refundId" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "mode" "PaymentMode" NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderRefundPayout_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrderRefund_orderId_key" ON "OrderRefund"("orderId");
CREATE INDEX "OrderRefund_customerId_status_idx" ON "OrderRefund"("customerId", "status");
CREATE INDEX "OrderRefund_status_createdAt_idx" ON "OrderRefund"("status", "createdAt");
CREATE INDEX "OrderRefundPayout_refundId_paidAt_idx" ON "OrderRefundPayout"("refundId", "paidAt");

ALTER TABLE "OrderRefund" ADD CONSTRAINT "OrderRefund_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderRefund" ADD CONSTRAINT "OrderRefund_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderRefundPayout" ADD CONSTRAINT "OrderRefundPayout_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "OrderRefund"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderRefundPayout" ADD CONSTRAINT "OrderRefundPayout_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
