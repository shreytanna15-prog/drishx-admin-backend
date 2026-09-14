import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { withSellingPrice } from "./single-vision-seed-pricing";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const CATEGORY = "PG KT";
const COATING = "HC";
const DEFAULT_SPH = "0.00";
const DEFAULT_ADD = "1.00";

type CylRowSpec = {
  label: string;
  cyl: number;
  axis: number;
  costPrice: string;
};

/** PG KT / HC — CYL-only price sheet (ST.AXIS: +CYL → 180, −CYL → 90). */
const CYL_ONLY_ROWS: CylRowSpec[] = [
  { label: "+2/+ ST.AXIS", cyl: 2, axis: 180, costPrice: "75" },
  { label: "-2/+ ST.AXIS", cyl: -2, axis: 90, costPrice: "75" },
  { label: "+3/+ ST.AXIS", cyl: 3, axis: 180, costPrice: "115" },
  { label: "-3/+ ST.AXIS", cyl: -3, axis: 90, costPrice: "115" },
  { label: "+4/+ ST.AXIS", cyl: 4, axis: 180, costPrice: "190" },
  { label: "-4/+ ST.AXIS", cyl: -4, axis: 90, costPrice: "190" },
];

function formatPower(value: number): string {
  return value.toFixed(2);
}

async function main() {
  console.log(`Seeding Kryptok CYL-only ${CATEGORY} / ${COATING}...`);

  const deleted = await prisma.kryptokLens.deleteMany({
    where: {
      category: { equals: CATEGORY, mode: "insensitive" },
      brand: null,
      coating: { equals: COATING, mode: "insensitive" },
      sph: DEFAULT_SPH,
      cyl: { not: null },
      axis: { not: null },
    },
  });

  console.log(`Removed ${deleted.count} existing ${CATEGORY} / ${COATING} CYL-only row(s).`);

  const created = await prisma.kryptokLens.createMany({
    data: CYL_ONLY_ROWS.map((row) => {
      const pricing = withSellingPrice(row.costPrice);
      return {
        category: CATEGORY,
        brand: null,
        coating: COATING,
        sph: DEFAULT_SPH,
        cyl: formatPower(row.cyl),
        axis: row.axis,
        add: DEFAULT_ADD,
        costPrice: pricing.costPrice,
        price: pricing.price,
        quantity: 0,
      };
    }),
  });

  console.log(`Inserted ${created.count} ${CATEGORY} / ${COATING} CYL-only row(s).`);
  for (const row of CYL_ONLY_ROWS) {
    console.log(`  ${row.label}: cyl ${formatPower(row.cyl)} axis ${row.axis} cost ${row.costPrice}`);
  }
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
