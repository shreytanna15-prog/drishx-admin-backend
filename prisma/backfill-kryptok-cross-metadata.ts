import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { matchesCrossProduct } from "../app/lib/cross-product";

const KRYPTOK_CROSS_ITEM = "CROSS";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const rows = await prisma.kryptokLens.findMany({
    select: {
      id: true,
      sph: true,
      cyl: true,
      crossPower: true,
      item: true,
    },
  });

  let updated = 0;

  for (const row of rows) {
    if (!matchesCrossProduct(row)) {
      continue;
    }

    const cylValue = row.cyl !== null && row.cyl !== undefined ? Number(row.cyl) : null;
    if (cylValue === null || !Number.isFinite(cylValue)) {
      continue;
    }

    const nextItem = KRYPTOK_CROSS_ITEM;
    const nextCrossPower = cylValue;
    const currentCrossPower =
      row.crossPower !== null && row.crossPower !== undefined ? Number(row.crossPower) : null;

    if (row.item === nextItem && currentCrossPower === nextCrossPower) {
      continue;
    }

    await prisma.kryptokLens.update({
      where: { id: row.id },
      data: {
        item: nextItem,
        crossPower: nextCrossPower,
      },
    });
    updated += 1;
  }

  console.log(`Updated ${updated} Kryptok cross row(s) with item="${KRYPTOK_CROSS_ITEM}" and crossPower.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
