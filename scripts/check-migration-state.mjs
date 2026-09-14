import { config } from "dotenv";
config();

import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL missing");
}

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
  max: 1,
});

async function main() {
  const migrations = await pool.query(
    `SELECT migration_name, finished_at, rolled_back_at, started_at, LEFT(COALESCE(logs, ''), 800) AS logs
     FROM _prisma_migrations
     ORDER BY started_at`
  );
  console.log("MIGRATIONS");
  for (const row of migrations.rows) {
    console.log(JSON.stringify(row));
  }

  const cols = await pool.query(
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
  console.log("COLUMNS");
  for (const row of cols.rows) {
    console.log(JSON.stringify(row));
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
