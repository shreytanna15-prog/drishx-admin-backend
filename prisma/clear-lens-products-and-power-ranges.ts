/**
 * One-off wipe: all LensProduct (+ cascaded variants) then all LensPowerRange.
 * Keeps attribute masters (Family, Base, Coating, Axis, ADD, …).
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const before = {
    products: await prisma.lensProduct.count(),
    variants: await prisma.lensProductVariant.count(),
    powerRanges: await prisma.lensPowerRange.count(),
  };
  console.log("Before:", before);

  const products = await prisma.lensProduct.deleteMany();
  console.log(`Deleted ${products.count} LensProduct row(s) (variants cascade).`);

  const powerRanges = await prisma.lensPowerRange.deleteMany();
  console.log(`Deleted ${powerRanges.count} LensPowerRange row(s).`);

  const after = {
    products: await prisma.lensProduct.count(),
    variants: await prisma.lensProductVariant.count(),
    powerRanges: await prisma.lensPowerRange.count(),
  };
  console.log("After:", after);
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
