import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { resolveProgressiveAxis } from "../app/lib/progressive-axis";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const rows = await prisma.progressiveLens.findMany({
    where: { cyl: { not: null }, axis: null },
    select: { id: true, sph: true, cyl: true },
  });

  console.log(`Found ${rows.length} progressive rows with CYL but no axis.`);

  const byAxis = new Map<number, string[]>();
  for (const row of rows) {
    const axis = resolveProgressiveAxis(row.sph.toString(), row.cyl?.toString() ?? null);
    if (axis == null) continue;
    const ids = byAxis.get(axis) ?? [];
    ids.push(row.id);
    byAxis.set(axis, ids);
  }

  let updated = 0;
  for (const [axis, ids] of byAxis) {
    const result = await prisma.progressiveLens.updateMany({
      where: { id: { in: ids } },
      data: { axis },
    });
    updated += result.count;
  }

  const remaining = await prisma.progressiveLens.count({
    where: { cyl: { not: null }, axis: null },
  });

  console.log(`Updated ${updated} rows. Remaining without axis: ${remaining}.`);
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
