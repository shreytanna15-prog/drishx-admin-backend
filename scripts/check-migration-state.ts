import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local" });

import { prisma } from "../app/lib/prisma";

async function main() {
  const migrations = await prisma.$queryRawUnsafe(
    `SELECT migration_name, finished_at, rolled_back_at, started_at, logs
     FROM _prisma_migrations
     ORDER BY started_at`
  );
  console.log("MIGRATIONS:", JSON.stringify(migrations, null, 2));

  const cols = await prisma.$queryRawUnsafe(
    `SELECT table_name, column_name, data_type
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND (
         (table_name = 'Order' AND column_name IN ('quantity','reservedQuantity','pickedQuantity','assignedToId','assignedAt'))
         OR (table_name = 'CartReservation' AND column_name IN ('quantity','reservedQuantity'))
         OR (table_name = 'WholesaleOrderLineItem' AND column_name IN ('quantity','reservedQuantity'))
       )
     ORDER BY table_name, column_name`
  );
  console.log("COLUMNS:", JSON.stringify(cols, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit();
  });
