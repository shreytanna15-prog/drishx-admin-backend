import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { withSellingPrice } from "./single-vision-seed-pricing";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const CATEGORY = "Poly BRC KT";
const COATING = "BLUE";
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
    coating: COATING,
    sph: formatPower(spec.sph),
    cyl: spec.cyl === null ? null : formatPower(spec.cyl),
    axis: spec.axis,
    add: DEFAULT_ADD,
    ...pricing,
    quantity: 0,
  };
}

/**
 * Poly BRC KT Blue — SPH-only and CYL-only price sheet.
 * SPH signs and axis signs per explanation table.
 */
const ROW_SPECS: RowSpec[] = [
  // SPH only
  { sph: 2, cyl: null, axis: null, costPrice: "160" },
  { sph: -2, cyl: null, axis: null, costPrice: "190" },

  // CYL 2 only — axis signs as shown
  { sph: 0, cyl: 2, axis: 180, costPrice: "290" },
  { sph: 0, cyl: 2, axis: -90, costPrice: "290" },
  { sph: 0, cyl: 2, axis: 90, costPrice: "340" },
  { sph: 0, cyl: 2, axis: -180, costPrice: "340" },
];

const ALL_ROWS = ROW_SPECS.map(buildRow);

async function main() {
  console.log(`Seeding Poly BRC KT Blue (${ALL_ROWS.length} rows)...`);

  const deleted = await prisma.kryptokLens.deleteMany({
    where: {
      category: { equals: CATEGORY, mode: "insensitive" },
      brand: null,
      coating: { equals: COATING, mode: "insensitive" },
    },
  });

  console.log(`Removed ${deleted.count} existing Poly BRC KT Blue row(s).`);

  const created = await prisma.kryptokLens.createMany({
    data: ALL_ROWS,
  });

  console.log(`Inserted ${created.count} Poly BRC KT Blue row(s).`);
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
