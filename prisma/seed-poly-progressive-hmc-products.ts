import "dotenv/config";
import { PrismaClient, type Eye } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { withSellingPrice } from "./single-vision-seed-pricing";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const BASE_META = {
  category: "POLY PROGRESSIVE",
  item: "POLY PROGRESSIVE HMC",
  brand: "",
  index: "1.59",
  type: "HMC",
  coating: "HMC",
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
  sph: string;
  cyl: string | null;
  axis: number | null;
  add: string;
  costPrice: string;
};

function buildRow(spec: PowerSpec): ProgressiveSeedRow {
  const pricing = withSellingPrice(spec.costPrice);
  return {
    ...BASE_META,
    sph: spec.sph,
    cyl: spec.cyl,
    axis: spec.axis,
    add: spec.add,
    ...pricing,
    quantity: 0,
  };
}

/** POLY PROGRESSIVE HMC — price sheet (SPRO/SUPER Green excluded). */
const POWER_SPECS: PowerSpec[] = [
  { sph: "0.00", cyl: "0.00", axis: null, add: "1.00", costPrice: "240" },
  { sph: "3.00", cyl: null, axis: null, add: "0.00", costPrice: "295" },
  { sph: "-2.00", cyl: null, axis: null, add: "0.00", costPrice: "345" },
];

const ALL_ROWS = POWER_SPECS.map(buildRow);

async function main() {
  console.log(`Seeding POLY PROGRESSIVE HMC (${ALL_ROWS.length} rows)...`);

  const deleted = await prisma.progressiveLens.deleteMany({
    where: {
      category: { equals: BASE_META.category, mode: "insensitive" },
      item: { equals: BASE_META.item, mode: "insensitive" },
      brand: BASE_META.brand,
      type: BASE_META.type,
      coating: BASE_META.coating,
    },
  });

  console.log(`Removed ${deleted.count} existing POLY PROGRESSIVE HMC row(s).`);

  const created = await prisma.progressiveLens.createMany({
    data: ALL_ROWS,
  });

  console.log(`Inserted ${created.count} POLY PROGRESSIVE HMC row(s).`);
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
