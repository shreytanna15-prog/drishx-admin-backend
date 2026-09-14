import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { withSellingPrice } from "./single-vision-seed-pricing";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const META = {
  category: "BRC KT",
  brand: "VIOLET KT",
  coating: "BLUE",
} as const;

const DEFAULT_ADD = "1.00";

type KryptokSeedRow = {
  category: string;
  brand: string;
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
    ...META,
    sph: formatPower(spec.sph),
    cyl: spec.cyl === null ? null : formatPower(spec.cyl),
    axis: spec.axis,
    add: DEFAULT_ADD,
    ...pricing,
    quantity: 0,
  };
}

/**
 * BRC KT VIOLET KT Blue — price sheet.
 * All SPH/CYL magnitudes stored positive; axis sign per explanation table row.
 */
const ROW_SPECS: RowSpec[] = [
  // SPH only (cyl 0)
  { sph: 3, cyl: null, axis: null, costPrice: "90" },
  { sph: 2, cyl: null, axis: null, costPrice: "100" },
  { sph: 4, cyl: null, axis: null, costPrice: "140" },
  { sph: 4, cyl: null, axis: null, costPrice: "150" },

  // CYL 2 only
  { sph: 0, cyl: 2, axis: 180, costPrice: "125" },
  { sph: 0, cyl: 2, axis: -90, costPrice: "115" },
  { sph: 0, cyl: 2, axis: 90, costPrice: "130" },
  { sph: 0, cyl: 2, axis: -180, costPrice: "130" },
  { sph: 0, cyl: 2, axis: 45, costPrice: "150" },
  { sph: 0, cyl: 2, axis: 135, costPrice: "150" },
  { sph: 0, cyl: 2, axis: -45, costPrice: "150" },
  { sph: 0, cyl: 2, axis: -135, costPrice: "150" },

  // Compound 2/1 and 2/2
  { sph: 2, cyl: 1, axis: 180, costPrice: "170" },
  { sph: 2, cyl: 1, axis: -90, costPrice: "170" },
  { sph: 2, cyl: 2, axis: 90, costPrice: "200" },
  { sph: 2, cyl: 1, axis: -180, costPrice: "200" },
  { sph: 2, cyl: 1, axis: 45, costPrice: "230" },
  { sph: 2, cyl: 1, axis: 135, costPrice: "230" },
  { sph: 2, cyl: 2, axis: -45, costPrice: "230" },
  { sph: 2, cyl: 1, axis: -135, costPrice: "230" },

  // Compound 3/1
  { sph: 3, cyl: 1, axis: 180, costPrice: "220" },
  { sph: 3, cyl: 1, axis: -90, costPrice: "220" },
  { sph: 3, cyl: 1, axis: 90, costPrice: "250" },
  { sph: 3, cyl: 1, axis: -180, costPrice: "250" },
  { sph: 3, cyl: 1, axis: 45, costPrice: "280" },
  { sph: 3, cyl: 1, axis: 135, costPrice: "280" },
  { sph: 3, cyl: 1, axis: -45, costPrice: "280" },
  { sph: 3, cyl: 1, axis: -135, costPrice: "280" },

  // Compound 2/2 — ST / REV / SPL axis groups (explanation table)
  { sph: 2, cyl: 2, axis: 180, costPrice: "220" },
  { sph: 2, cyl: 2, axis: -90, costPrice: "220" },
  { sph: 2, cyl: 2, axis: 90, costPrice: "250" },
  { sph: 2, cyl: 2, axis: -180, costPrice: "250" },
  { sph: 2, cyl: 2, axis: 45, costPrice: "280" },
  { sph: 2, cyl: 2, axis: 135, costPrice: "280" },
  { sph: 2, cyl: 2, axis: -45, costPrice: "280" },
  { sph: 2, cyl: 2, axis: -135, costPrice: "280" },

  // Cross / high-add compound
  { sph: 1.75, cyl: 2, axis: 90, costPrice: "250" },
];

const ALL_ROWS = ROW_SPECS.map(buildRow);

async function main() {
  console.log(`Seeding BRC KT VIOLET KT Blue (${ALL_ROWS.length} rows)...`);

  const deleted = await prisma.kryptokLens.deleteMany({
    where: {
      category: { equals: META.category, mode: "insensitive" },
      brand: { equals: META.brand, mode: "insensitive" },
      coating: { equals: META.coating, mode: "insensitive" },
    },
  });

  console.log(`Removed ${deleted.count} existing BRC KT VIOLET KT Blue row(s).`);

  const created = await prisma.kryptokLens.createMany({
    data: ALL_ROWS,
  });

  console.log(`Inserted ${created.count} BRC KT VIOLET KT Blue row(s).`);
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
