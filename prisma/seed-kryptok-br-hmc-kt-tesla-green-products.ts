import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { withSellingPrice } from "./single-vision-seed-pricing";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const META = {
  category: "BR HMC KT",
  brand: "TESLA GREEN",
  coating: "GREEN",
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
  add?: string;
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
    add: spec.add ?? DEFAULT_ADD,
    ...pricing,
    quantity: 0,
  };
}

/** BR HMC KT TESLA GREEN — price sheet (SPH / CYL / compound, sign-based axis). */
const ROW_SPECS: RowSpec[] = [
  // SPH only
  { sph: 3, cyl: null, axis: null, costPrice: "70" },
  { sph: -2, cyl: null, axis: null, costPrice: "80" },
  { sph: 4, cyl: null, axis: null, costPrice: "115" },
  { sph: -4, cyl: null, axis: null, costPrice: "125" },

  // CYL 2 — ST / REV / SPL axis groups
  { sph: 0, cyl: 2, axis: 180, costPrice: "90" },
  { sph: 0, cyl: -2, axis: 90, costPrice: "90" },
  { sph: 0, cyl: 2, axis: 90, costPrice: "105" },
  { sph: 0, cyl: -2, axis: 180, costPrice: "105" },
  { sph: 0, cyl: 2, axis: 45, costPrice: "120" },
  { sph: 0, cyl: 2, axis: 135, costPrice: "120" },
  { sph: 0, cyl: -2, axis: -45, costPrice: "120" },
  { sph: 0, cyl: -2, axis: -135, costPrice: "120" },

  // CYL 3 — ST axis only (+180 / -90)
  { sph: 0, cyl: 3, axis: 180, costPrice: "140" },
  { sph: 0, cyl: -3, axis: 90, costPrice: "140" },

  // Compound 2/1
  { sph: 2, cyl: 1, axis: 180, costPrice: "110" },
  { sph: -2, cyl: -1, axis: 90, costPrice: "120" },
  { sph: 2, cyl: 1, axis: 90, costPrice: "140" },
  { sph: -2, cyl: -1, axis: 180, costPrice: "150" },
  { sph: 2, cyl: 1, axis: 45, costPrice: "150" },
  { sph: -2, cyl: -1, axis: -45, costPrice: "150" },
  { sph: 2, cyl: 1, axis: 135, costPrice: "160" },
  { sph: -2, cyl: -1, axis: -135, costPrice: "160" },

  // Compound 3/1 — ST axis only
  { sph: 3, cyl: 1, axis: 180, costPrice: "140" },
  { sph: -3, cyl: -1, axis: 90, costPrice: "140" },

  // Compound 2/2 — ST axis only
  { sph: 2, cyl: 2, axis: 180, costPrice: "150" },
  { sph: -2, cyl: -2, axis: 90, costPrice: "150" },

  // Compound +1.75/+2 and +2.75/+3 @ 90
  { sph: 1.75, cyl: 2, axis: 90, costPrice: "160" },
  { sph: 2.75, cyl: 3, axis: 90, costPrice: "200" },
];

const ALL_ROWS = ROW_SPECS.map(buildRow);

async function main() {
  console.log(`Seeding BR HMC KT TESLA GREEN (${ALL_ROWS.length} rows)...`);

  const deleted = await prisma.kryptokLens.deleteMany({
    where: {
      category: { equals: META.category, mode: "insensitive" },
      brand: { equals: META.brand, mode: "insensitive" },
      coating: { equals: META.coating, mode: "insensitive" },
    },
  });

  console.log(`Removed ${deleted.count} existing BR HMC KT TESLA GREEN row(s).`);

  const created = await prisma.kryptokLens.createMany({
    data: ALL_ROWS,
  });

  console.log(`Inserted ${created.count} BR HMC KT TESLA GREEN row(s).`);
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
