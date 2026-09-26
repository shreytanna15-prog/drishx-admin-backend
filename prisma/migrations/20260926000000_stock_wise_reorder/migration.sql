-- CreateEnum
CREATE TYPE "ProcurementRequestSource" AS ENUM ('ORDER_SHORTAGE', 'MINIMUM_STOCK_THRESHOLD', 'MANUAL');

-- CreateEnum
CREATE TYPE "ProcurementRequestStatus" AS ENUM ('OPEN', 'UNDER_REVIEW', 'APPROVED', 'CANCELLED', 'RESOLVED');

-- CreateEnum
CREATE TYPE "ProcurementPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'CRITICAL');

-- CreateTable
CREATE TABLE "ReorderRule" (
    "id" TEXT NOT NULL,
    "lensType" "LensType" NOT NULL,
    "lensId" TEXT NOT NULL,
    "minStock" INTEGER NOT NULL DEFAULT 0,
    "targetStock" INTEGER NOT NULL,
    "autoProcure" BOOLEAN NOT NULL DEFAULT false,
    "preferredSupplierId" TEXT,
    "moq" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedById" TEXT,

    CONSTRAINT "ReorderRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcurementRequest" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "lensType" "LensType" NOT NULL,
    "lensId" TEXT NOT NULL,
    "source" "ProcurementRequestSource" NOT NULL,
    "status" "ProcurementRequestStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "ProcurementPriority" NOT NULL DEFAULT 'NORMAL',
    "requiredQuantity" INTEGER NOT NULL,
    "requestedQuantity" INTEGER NOT NULL,
    "orderedQuantity" INTEGER NOT NULL DEFAULT 0,
    "receivedQuantity" INTEGER NOT NULL DEFAULT 0,
    "orderId" TEXT,
    "reorderRuleId" TEXT,
    "stockAtTrigger" INTEGER,
    "minStockAtTrigger" INTEGER,
    "targetStockAtTrigger" INTEGER,
    "availableAtTrigger" INTEGER,
    "incomingAtTrigger" INTEGER,
    "triggerReason" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolutionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,

    CONSTRAINT "ProcurementRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReorderRule_lensType_idx" ON "ReorderRule"("lensType");

-- CreateIndex
CREATE INDEX "ReorderRule_autoProcure_isActive_idx" ON "ReorderRule"("autoProcure", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ReorderRule_lensType_lensId_key" ON "ReorderRule"("lensType", "lensId");

-- CreateIndex
CREATE UNIQUE INDEX "ProcurementRequest_publicId_key" ON "ProcurementRequest"("publicId");

-- CreateIndex
CREATE INDEX "ProcurementRequest_lensType_lensId_status_idx" ON "ProcurementRequest"("lensType", "lensId", "status");

-- CreateIndex
CREATE INDEX "ProcurementRequest_status_source_idx" ON "ProcurementRequest"("status", "source");

-- CreateIndex
CREATE INDEX "ProcurementRequest_orderId_idx" ON "ProcurementRequest"("orderId");

-- CreateIndex
CREATE INDEX "ProcurementRequest_createdAt_idx" ON "ProcurementRequest"("createdAt");

-- AddForeignKey
ALTER TABLE "ReorderRule" ADD CONSTRAINT "ReorderRule_preferredSupplierId_fkey" FOREIGN KEY ("preferredSupplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementRequest" ADD CONSTRAINT "ProcurementRequest_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcurementRequest" ADD CONSTRAINT "ProcurementRequest_reorderRuleId_fkey" FOREIGN KEY ("reorderRuleId") REFERENCES "ReorderRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
