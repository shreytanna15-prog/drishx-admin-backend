-- CreateTable
CREATE TABLE "LoyaltySettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "pointValue" INTEGER NOT NULL DEFAULT 1,
    "baseRatePct" DECIMAL NOT NULL DEFAULT 0.5,
    "advanceBonusPct" DECIMAL NOT NULL DEFAULT 1.0,
    "fullPaymentRatePct" DECIMAL NOT NULL DEFAULT 0.5,
    "minMarginPct" DECIMAL NOT NULL DEFAULT 5,
    "maxRedemptionPct" DECIMAL NOT NULL DEFAULT 5,
    "expiryDays" INTEGER NOT NULL DEFAULT 365,
    "minInvoiceValue" DECIMAL NOT NULL DEFAULT 0,
    "maxPointsPerInvoice" DECIMAL NOT NULL DEFAULT 0,
    "freightEligible" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoyaltySettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltyWallet" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "availablePoints" DECIMAL NOT NULL DEFAULT 0,
    "pendingPoints" DECIMAL NOT NULL DEFAULT 0,
    "totalEarned" DECIMAL NOT NULL DEFAULT 0,
    "totalRedeemed" DECIMAL NOT NULL DEFAULT 0,
    "totalExpired" DECIMAL NOT NULL DEFAULT 0,
    "totalReversed" DECIMAL NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoyaltyWallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltyTransaction" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "points" DECIMAL NOT NULL,
    "balanceAfter" DECIMAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reason" TEXT,
    "invoiceId" TEXT,
    "orderId" TEXT,
    "paymentId" TEXT,
    "creditNoteId" TEXT,
    "returnRequestId" TEXT,
    "createdById" TEXT,
    "expiresAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoyaltyTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyWallet_customerId_key" ON "LoyaltyWallet"("customerId");

-- CreateIndex
CREATE INDEX "LoyaltyTransaction_customerId_createdAt_idx" ON "LoyaltyTransaction"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "LoyaltyTransaction_orderId_idx" ON "LoyaltyTransaction"("orderId");

-- CreateIndex
CREATE INDEX "LoyaltyTransaction_invoiceId_idx" ON "LoyaltyTransaction"("invoiceId");

-- CreateIndex
CREATE INDEX "LoyaltyTransaction_customerId_status_idx" ON "LoyaltyTransaction"("customerId", "status");

-- AddForeignKey
ALTER TABLE "LoyaltyWallet" ADD CONSTRAINT "LoyaltyWallet_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyTransaction" ADD CONSTRAINT "LoyaltyTransaction_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyTransaction" ADD CONSTRAINT "LoyaltyTransaction_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
