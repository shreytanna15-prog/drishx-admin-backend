import "dotenv/config";
import { PrismaClient, type Eye } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { withSellingPrice } from "./single-vision-seed-pricing";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const BASE_META = {
  category: "PG PROGRESSIVE",
  item: "PG PROGRESSIVE 1.56",
  brand: "",
  index: "1.56",
  type: "HC",
  add: "0.00",
  eye: "LEFT" as Eye,
} as const;

type ProgressiveSeedRow = {
  category: string;
  item: string;
  brand: string;
  index: string;
  type: string;
  coating: string;
  sph: string;
  cyl: string | null;
  axis: number | null;
  add: string;
  eye: Eye;
  costPrice: string;
  price: string;
  quantity: number;
};

type PowerSpec = {
  coating: string;
  sph: string;
  cyl: string | null;
  axis: number | null;
  costPrice: string;
};

function buildRow(spec: PowerSpec): ProgressiveSeedRow {
  const pricing = withSellingPrice(spec.costPrice);
  return {
    ...BASE_META,
    coating: spec.coating,
    sph: spec.sph,
    cyl: spec.cyl,
    axis: spec.axis,
    ...pricing,
    quantity: 0,
  };
}

/** PG PROGRESSIVE 1.56 — price sheet (STARK/SPRO/Comp 2/0 excluded). */
const POWER_SPECS: PowerSpec[] = [
  // SPH only — HC / Green
  { coating: "HC", sph: "3.00", cyl: null, axis: null, costPrice: "150" },
  { coating: "Green", sph: "3.00", cyl: null, axis: null, costPrice: "190" },
  { coating: "HC", sph: "-2.00", cyl: null, axis: null, costPrice: "180" },
  { coating: "Green", sph: "-2.00", cyl: null, axis: null, costPrice: "220" },
  // CYL only — HC @ +180 / -90
  { coating: "HC", sph: "0.00", cyl: "2.00", axis: 180, costPrice: "220" },
  { coating: "HC", sph: "0.00", cyl: "2.00", axis: 90, costPrice: "220" },
  // Compound +2/+1 — HC @ 180 only
  { coating: "HC", sph: "2.00", cyl: "1.00", axis: 180, costPrice: "300" },
];

const ALL_ROWS = POWER_SPECS.map(buildRow);

async function main() {
  console.log(`Seeding PG PROGRESSIVE 1.56 (${ALL_ROWS.length} rows)...`);

  const deleted = await prisma.progressiveLens.deleteMany({
    where: {
      category: { equals: BASE_META.category, mode: "insensitive" },
      item: { equals: BASE_META.item, mode: "insensitive" },
      brand: BASE_META.brand,
      index: BASE_META.index,
    },
  });

  console.log(`Removed ${deleted.count} existing PG PROGRESSIVE 1.56 row(s).`);

  const created = await prisma.progressiveLens.createMany({
    data: ALL_ROWS,
  });

  console.log(`Inserted ${created.count} PG PROGRESSIVE 1.56 row(s).`);
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
