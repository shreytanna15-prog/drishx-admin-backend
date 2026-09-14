import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { withSellingPrice } from "./single-vision-seed-pricing";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const CATEGORY = "PG BRC KT";
const DEFAULT_ADD = "1.00";

type KryptokSeedRow = {
  category: string;
  brand: null;
  coating: string;
  sph: string;
  cyl: string | null;
  axis: number | null;
  add: string;
  costPrice: string;
  price: string;
  quantity: number;
};

type RowSpec = {
  coating: string;
  sph: number;
  cyl: number | null;
  axis: number | null;
  costPrice: string;
};

function formatPower(value: number): string {
  return value.toFixed(2);
}

function buildRow(spec: RowSpec): KryptokSeedRow {
  const pricing = withSellingPrice(spec.costPrice);
  return {
    category: CATEGORY,
    brand: null,
    coating: spec.coating,
    sph: formatPower(spec.sph),
    cyl: spec.cyl === null ? null : formatPower(spec.cyl),
    axis: spec.axis,
    add: DEFAULT_ADD,
    ...pricing,
    quantity: 0,
  };
}

/** PG BRC KT — Blue / Green price sheet (SPH / CYL / compound). */
const ROW_SPECS: RowSpec[] = [
  // SPH only — BLUE
  { coating: "BLUE", sph: 3, cyl: null, axis: null, costPrice: "180" },
  { coating: "BLUE", sph: -2, cyl: null, axis: null, costPrice: "220" },
  { coating: "BLUE", sph: 4, cyl: null, axis: null, costPrice: "230" },
  { coating: "BLUE", sph: -4, cyl: null, axis: null, costPrice: "280" },

  // SPH only — GREEN
  { coating: "GREEN", sph: 3, cyl: null, axis: null, costPrice: "145" },
  { coating: "GREEN", sph: -2, cyl: null, axis: null, costPrice: "175" },

  // CYL only — BLUE (ST axis +180 / -90)
  { coating: "BLUE", sph: 0, cyl: 2, axis: 180, costPrice: "220" },
  { coating: "BLUE", sph: 0, cyl: -2, axis: 90, costPrice: "220" },

  // Compound 2/1 — BLUE (ST axis)
  { coating: "BLUE", sph: 2, cyl: 1, axis: 180, costPrice: "275" },
  { coating: "BLUE", sph: -2, cyl: -1, axis: 90, costPrice: "325" },
];

const ALL_ROWS = ROW_SPECS.map(buildRow);

async function main() {
  console.log(`Seeding PG BRC KT Blue / Green (${ALL_ROWS.length} rows)...`);

  const deleted = await prisma.kryptokLens.deleteMany({
    where: {
      category: { equals: CATEGORY, mode: "insensitive" },
      brand: null,
      coating: { in: ["BLUE", "GREEN"] },
    },
  });

  console.log(`Removed ${deleted.count} existing PG BRC KT row(s).`);

  const created = await prisma.kryptokLens.createMany({
    data: ALL_ROWS,
  });

  console.log(`Inserted ${created.count} PG BRC KT row(s).`);
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
