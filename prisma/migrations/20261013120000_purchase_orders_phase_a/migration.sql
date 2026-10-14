-- RW-08 Phases A/B/C: Purchase Orders, goods receipts, supplier profile
-- (DO NOT APPLY without approval). Additive only: new enums/tables plus
-- nullable columns on Supplier / PurchaseBill. No drops, no data rewrites.
-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM (
  'DRAFT',
  'PENDING_APPROVAL',
  'OPEN',
  'SENT',
  'PARTIALLY_RECEIVED',
  'CLOSED',
  'CANCELLED'
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
    "supplierId" TEXT NOT NULL,
    "warehouseCode" TEXT NOT NULL DEFAULT 'MAIN',
    "expectedDelivery" TIMESTAMP(3),
    "notes" TEXT,
    "subtotal" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "cancelReason" TEXT,
    "sentAt" TIMESTAMP(3),
    "sentById" TEXT,
    "sentVia" TEXT,
    "sentTo" TEXT,
    "sentNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderLine" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "lensType" "LensType" NOT NULL,
    "lensId" TEXT NOT NULL,
    "productLabel" TEXT,
    "rangeLabel" TEXT,
    "powerLabel" TEXT,
    "requiredQuantity" INTEGER NOT NULL,
    "poQuantity" INTEGER NOT NULL,
    "rate" DECIMAL(65,30),
    "amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "receivedQuantity" INTEGER NOT NULL DEFAULT 0,
    "cancelledQuantity" INTEGER NOT NULL DEFAULT 0,
    "procurementRequestId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpenPurchaseOrderPower" (
    "lensType" "LensType" NOT NULL,
    "lensId" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "purchaseOrderLineId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OpenPurchaseOrderPower_pkey" PRIMARY KEY ("lensType","lensId")
);

-- CreateTable
-- Exact PR contributions per PO line (written on approve; reversed on cancel).
CREATE TABLE "PurchaseOrderAllocation" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "purchaseOrderLineId" TEXT NOT NULL,
    "procurementRequestId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reversedQuantity" INTEGER NOT NULL DEFAULT 0,
    "receivedQuantity" INTEGER NOT NULL DEFAULT 0,
    "reversedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PurchaseOrderAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateEnum (Phase B)
CREATE TYPE "GoodsReceiptStatus" AS ENUM ('DRAFT', 'VALIDATED', 'CONFIRMED', 'CANCELLED');
CREATE TYPE "GoodsReceiptLineStatus" AS ENUM ('MATCHED', 'SHORT', 'EXTRA', 'INVALID', 'DAMAGED', 'PENDING');

-- CreateTable (Phase B GRN)
CREATE TABLE "GoodsReceipt" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "status" "GoodsReceiptStatus" NOT NULL DEFAULT 'DRAFT',
    "confirmationKey" TEXT,
    "warehouseCode" TEXT NOT NULL DEFAULT 'MAIN',
    "supplierId" TEXT NOT NULL,
    "courier" TEXT,
    "awb" TEXT,
    "dispatchDate" TIMESTAMP(3),
    "packageCount" INTEGER,
    "notes" TEXT,
    "billStoragePath" TEXT,
    "billFileName" TEXT,
    "billMimeType" TEXT,
    "excelStoragePath" TEXT,
    "excelFileName" TEXT,
    "excelMimeType" TEXT,
    "purchaseBillId" TEXT,
    "closeReason" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "confirmedById" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoodsReceipt_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GoodsReceiptLine" (
    "id" TEXT NOT NULL,
    "goodsReceiptId" TEXT NOT NULL,
    "purchaseOrderLineId" TEXT,
    "lensType" "LensType",
    "lensId" TEXT,
    "productLabel" TEXT,
    "rangeLabel" TEXT,
    "powerLabel" TEXT,
    "orderedQuantity" INTEGER NOT NULL DEFAULT 0,
    "previouslyReceived" INTEGER NOT NULL DEFAULT 0,
    "outstandingBefore" INTEGER NOT NULL DEFAULT 0,
    "deliveredQuantity" INTEGER NOT NULL DEFAULT 0,
    "acceptedQuantity" INTEGER NOT NULL DEFAULT 0,
    "damagedQuantity" INTEGER NOT NULL DEFAULT 0,
    "shortQuantity" INTEGER NOT NULL DEFAULT 0,
    "excessQuantity" INTEGER NOT NULL DEFAULT 0,
    "lineStatus" "GoodsReceiptLineStatus" NOT NULL DEFAULT 'PENDING',
    "actionCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoodsReceiptLine_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GoodsReceiptBillSummary" (
    "id" TEXT NOT NULL,
    "goodsReceiptId" TEXT NOT NULL,
    "productLabel" TEXT NOT NULL,
    "rangeLabel" TEXT,
    "billQuantity" INTEGER NOT NULL,
    "excelQuantity" INTEGER NOT NULL DEFAULT 0,
    "difference" INTEGER NOT NULL DEFAULT 0,
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GoodsReceiptBillSummary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_publicId_key" ON "PurchaseOrder"("publicId");

-- CreateIndex
CREATE INDEX "PurchaseOrder_status_createdAt_idx" ON "PurchaseOrder"("status", "createdAt");

-- CreateIndex
CREATE INDEX "PurchaseOrder_supplierId_status_idx" ON "PurchaseOrder"("supplierId", "status");

-- CreateIndex
CREATE INDEX "PurchaseOrderLine_lensType_lensId_idx" ON "PurchaseOrderLine"("lensType", "lensId");

-- CreateIndex
CREATE INDEX "PurchaseOrderLine_procurementRequestId_idx" ON "PurchaseOrderLine"("procurementRequestId");

-- CreateIndex
CREATE INDEX "PurchaseOrderLine_purchaseOrderId_idx" ON "PurchaseOrderLine"("purchaseOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrderLine_purchaseOrderId_lineNumber_key" ON "PurchaseOrderLine"("purchaseOrderId", "lineNumber");

-- CreateIndex
CREATE UNIQUE INDEX "OpenPurchaseOrderPower_purchaseOrderLineId_key" ON "OpenPurchaseOrderPower"("purchaseOrderLineId");

-- CreateIndex
CREATE INDEX "OpenPurchaseOrderPower_purchaseOrderId_idx" ON "OpenPurchaseOrderPower"("purchaseOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrderAllocation_purchaseOrderLineId_procurementRequestId_key" ON "PurchaseOrderAllocation"("purchaseOrderLineId", "procurementRequestId");

-- CreateIndex
CREATE INDEX "PurchaseOrderAllocation_purchaseOrderId_reversedAt_idx" ON "PurchaseOrderAllocation"("purchaseOrderId", "reversedAt");

-- CreateIndex
CREATE INDEX "PurchaseOrderAllocation_procurementRequestId_idx" ON "PurchaseOrderAllocation"("procurementRequestId");

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_procurementRequestId_fkey" FOREIGN KEY ("procurementRequestId") REFERENCES "ProcurementRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpenPurchaseOrderPower" ADD CONSTRAINT "OpenPurchaseOrderPower_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpenPurchaseOrderPower" ADD CONSTRAINT "OpenPurchaseOrderPower_purchaseOrderLineId_fkey" FOREIGN KEY ("purchaseOrderLineId") REFERENCES "PurchaseOrderLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderAllocation" ADD CONSTRAINT "PurchaseOrderAllocation_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderAllocation" ADD CONSTRAINT "PurchaseOrderAllocation_purchaseOrderLineId_fkey" FOREIGN KEY ("purchaseOrderLineId") REFERENCES "PurchaseOrderLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderAllocation" ADD CONSTRAINT "PurchaseOrderAllocation_procurementRequestId_fkey" FOREIGN KEY ("procurementRequestId") REFERENCES "ProcurementRequest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Phase B indexes + FKs
CREATE UNIQUE INDEX "GoodsReceipt_publicId_key" ON "GoodsReceipt"("publicId");
CREATE UNIQUE INDEX "GoodsReceipt_confirmationKey_key" ON "GoodsReceipt"("confirmationKey");
CREATE UNIQUE INDEX "GoodsReceipt_purchaseBillId_key" ON "GoodsReceipt"("purchaseBillId");
CREATE INDEX "GoodsReceipt_purchaseOrderId_status_idx" ON "GoodsReceipt"("purchaseOrderId", "status");
CREATE INDEX "GoodsReceipt_status_createdAt_idx" ON "GoodsReceipt"("status", "createdAt");
CREATE INDEX "GoodsReceiptLine_goodsReceiptId_idx" ON "GoodsReceiptLine"("goodsReceiptId");
CREATE INDEX "GoodsReceiptLine_purchaseOrderLineId_idx" ON "GoodsReceiptLine"("purchaseOrderLineId");
CREATE INDEX "GoodsReceiptLine_lensType_lensId_idx" ON "GoodsReceiptLine"("lensType", "lensId");
CREATE INDEX "GoodsReceiptBillSummary_goodsReceiptId_idx" ON "GoodsReceiptBillSummary"("goodsReceiptId");

ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GoodsReceipt" ADD CONSTRAINT "GoodsReceipt_purchaseBillId_fkey" FOREIGN KEY ("purchaseBillId") REFERENCES "PurchaseBill"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GoodsReceiptLine" ADD CONSTRAINT "GoodsReceiptLine_goodsReceiptId_fkey" FOREIGN KEY ("goodsReceiptId") REFERENCES "GoodsReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GoodsReceiptLine" ADD CONSTRAINT "GoodsReceiptLine_purchaseOrderLineId_fkey" FOREIGN KEY ("purchaseOrderLineId") REFERENCES "PurchaseOrderLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GoodsReceiptBillSummary" ADD CONSTRAINT "GoodsReceiptBillSummary_goodsReceiptId_fkey" FOREIGN KEY ("goodsReceiptId") REFERENCES "GoodsReceipt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Phase C: supplier profile (nullable — existing supplier rows stay valid)
ALTER TABLE "Supplier" ADD COLUMN "businessEntityType" TEXT;
ALTER TABLE "Supplier" ADD COLUMN "contactPerson" TEXT;
ALTER TABLE "Supplier" ADD COLUMN "alternatePhone" TEXT;
ALTER TABLE "Supplier" ADD COLUMN "pan" TEXT;
ALTER TABLE "Supplier" ADD COLUMN "city" TEXT;
ALTER TABLE "Supplier" ADD COLUMN "pincode" TEXT;
ALTER TABLE "Supplier" ADD COLUMN "dispatchAddress" TEXT;
ALTER TABLE "Supplier" ADD COLUMN "notes" TEXT;

-- Phase C: supplier bill document on purchase bills (private storage path)
ALTER TABLE "PurchaseBill" ADD COLUMN "documentStoragePath" TEXT;
ALTER TABLE "PurchaseBill" ADD COLUMN "documentFileName" TEXT;
ALTER TABLE "PurchaseBill" ADD COLUMN "documentMimeType" TEXT;
