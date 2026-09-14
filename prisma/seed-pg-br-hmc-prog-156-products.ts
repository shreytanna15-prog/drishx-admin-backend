import "dotenv/config";
import { PrismaClient, type Eye } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { withSellingPrice } from "./single-vision-seed-pricing";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const BASE_META = {
  category: "PG BR HMC",
  item: "PG BR HMC PROG 1.56",
  brand: "",
  index: "1.56",
  type: "HMC",
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

function formatPower(value: number): string {
  return value.toFixed(2);
}

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

/** PG BR HMC PROG 1.56 — Green / Blue DL / Clik price sheet. */
const POWER_SPECS: PowerSpec[] = [
  // SPH only — Green / Blue DL / Clik
  { coating: "Green", sph: "3.00", cyl: null, axis: null, costPrice: "240" },
  { coating: "Green", sph: "-2.00", cyl: null, axis: null, costPrice: "290" },
  { coating: "Blue DL", sph: "3.00", cyl: null, axis: null, costPrice: "260" },
  { coating: "Blue DL", sph: "-2.00", cyl: null, axis: null, costPrice: "310" },
  { coating: "Clik", sph: "3.00", cyl: null, axis: null, costPrice: "240" },
  { coating: "Clik", sph: "-2.00", cyl: null, axis: null, costPrice: "290" },

  // CYL only — Blue DL
  { coating: "Blue DL", sph: "0.00", cyl: formatPower(2), axis: 180, costPrice: "375" },
  { coating: "Blue DL", sph: "0.00", cyl: formatPower(2), axis: -90, costPrice: "375" },
  { coating: "Blue DL", sph: "0.00", cyl: formatPower(2), axis: 90, costPrice: "425" },
  { coating: "Blue DL", sph: "0.00", cyl: formatPower(2), axis: -180, costPrice: "425" },

  // Compound — Blue DL
  { coating: "Blue DL", sph: formatPower(2), cyl: formatPower(1), axis: 180, costPrice: "475" },
  { coating: "Blue DL", sph: formatPower(-2), cyl: formatPower(-1), axis: 90, costPrice: "525" },
];

const ALL_ROWS = POWER_SPECS.map(buildRow);

async function main() {
  console.log(`Seeding PG BR HMC PROG 1.56 (${ALL_ROWS.length} rows)...`);

  const deleted = await prisma.progressiveLens.deleteMany({
    where: {
      category: { equals: BASE_META.category, mode: "insensitive" },
      item: { equals: BASE_META.item, mode: "insensitive" },
      brand: BASE_META.brand,
      index: BASE_META.index,
    },
  });

  console.log(`Removed ${deleted.count} existing PG BR HMC PROG 1.56 row(s).`);

  const created = await prisma.progressiveLens.createMany({
    data: ALL_ROWS,
  });

  console.log(`Inserted ${created.count} PG BR HMC PROG 1.56 row(s).`);
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
