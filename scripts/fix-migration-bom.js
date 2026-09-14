const fs = require("fs");

function writeNoBom(path, content) {
  fs.writeFileSync(path, Buffer.from(content, "utf8"));
  const bytes = fs.readFileSync(path);
  const hasBom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  console.log(path, "bom=", hasBom, "starts=", bytes.slice(0, 12).toString("hex"));
}

writeNoBom(
  "prisma/migrations/20260710120000_cart_order_quantity_float/migration.sql",
  [
    "-- AlterTable",
    'ALTER TABLE "CartReservation" ALTER COLUMN "quantity" SET DATA TYPE DOUBLE PRECISION;',
    'ALTER TABLE "CartReservation" ALTER COLUMN "reservedQuantity" SET DATA TYPE DOUBLE PRECISION;',
    "",
    "-- AlterTable",
    'ALTER TABLE "Order" ALTER COLUMN "quantity" SET DATA TYPE DOUBLE PRECISION;',
    'ALTER TABLE "Order" ALTER COLUMN "reservedQuantity" SET DATA TYPE DOUBLE PRECISION;',
    'ALTER TABLE "Order" ALTER COLUMN "pickedQuantity" SET DATA TYPE DOUBLE PRECISION;',
    "",
    "-- AlterTable",
    'ALTER TABLE "WholesaleOrderLineItem" ALTER COLUMN "quantity" SET DATA TYPE DOUBLE PRECISION;',
    'ALTER TABLE "WholesaleOrderLineItem" ALTER COLUMN "reservedQuantity" SET DATA TYPE DOUBLE PRECISION;',
    "",
  ].join("\n")
);

writeNoBom(
  "prisma/migrations/20260727100000_order_assigned_to_employee/migration.sql",
  [
    "-- AlterTable",
    'ALTER TABLE "Order" ADD COLUMN "assignedToId" TEXT;',
    'ALTER TABLE "Order" ADD COLUMN "assignedAt" TIMESTAMP(3);',
    "",
    "-- CreateIndex",
    'CREATE INDEX "Order_assignedToId_idx" ON "Order"("assignedToId");',
    'CREATE INDEX "Order_assignedToId_status_idx" ON "Order"("assignedToId", "status");',
    "",
    "-- AddForeignKey",
    'ALTER TABLE "Order" ADD CONSTRAINT "Order_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;',
    "",
  ].join("\n")
);
