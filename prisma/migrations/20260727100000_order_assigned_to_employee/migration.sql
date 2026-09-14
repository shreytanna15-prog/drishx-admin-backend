-- AlterTable
ALTER TABLE "Order" ADD COLUMN "assignedToId" TEXT;
ALTER TABLE "Order" ADD COLUMN "assignedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Order_assignedToId_idx" ON "Order"("assignedToId");
CREATE INDEX "Order_assignedToId_status_idx" ON "Order"("assignedToId", "status");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
