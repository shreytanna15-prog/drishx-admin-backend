import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const before = await prisma.kryptokLens.count();
  console.log(`Kryptok rows before: ${before}`);

  const linkedOrders = await prisma.order.count({
    where: { kryptokLensId: { not: null } },
  });

  if (linkedOrders > 0) {
    const unlinked = await prisma.order.updateMany({
      where: { kryptokLensId: { not: null } },
      data: { kryptokLensId: null },
    });
    console.log(`Unlinked ${unlinked.count} order(s) from Kryptok lenses.`);
  }

  const deleted = await prisma.kryptokLens.deleteMany();
  console.log(`Deleted ${deleted.count} Kryptok lens row(s).`);

  const after = await prisma.kryptokLens.count();
  console.log(`Kryptok rows after: ${after}`);
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
