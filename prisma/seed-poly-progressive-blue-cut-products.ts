import "dotenv/config";
import { PrismaClient, type Eye } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { withSellingPrice } from "./single-vision-seed-pricing";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const BASE_META = {
  category: "POLY PROGRESSIVE BLUE CUT",
  item: "POLY PROGRESSIVE BLUE CUT",
  brand: "",
  index: "1.59",
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

/** POLY PROGRESSIVE BLUE CUT — Green / Blue DL price sheet. */
const POWER_SPECS: PowerSpec[] = [
  // Plano +0/+0 — Green / Blue DL
  { coating: "Green", sph: "0.00", cyl: "0.00", axis: null, costPrice: "240" },
  { coating: "Blue DL", sph: "0.00", cyl: "0.00", axis: null, costPrice: "250" },

  // SPH only — Green / Blue DL
  { coating: "Green", sph: "3.00", cyl: null, axis: null, costPrice: "295" },
  { coating: "Blue DL", sph: "3.00", cyl: null, axis: null, costPrice: "325" },
  { coating: "Green", sph: "-2.00", cyl: null, axis: null, costPrice: "345" },
  { coating: "Blue DL", sph: "-2.00", cyl: null, axis: null, costPrice: "375" },
  { coating: "Green", sph: "-3.00", cyl: null, axis: null, costPrice: "525" },
  { coating: "Blue DL", sph: "-3.00", cyl: null, axis: null, costPrice: "550" },

  // CYL 2 — Green / Blue DL @ +180 / -90
  { coating: "Green", sph: "0.00", cyl: formatPower(2), axis: 180, costPrice: "450" },
  { coating: "Blue DL", sph: "0.00", cyl: formatPower(2), axis: 180, costPrice: "475" },
  { coating: "Green", sph: "0.00", cyl: formatPower(2), axis: -90, costPrice: "450" },
  { coating: "Blue DL", sph: "0.00", cyl: formatPower(2), axis: -90, costPrice: "475" },

  // CYL 2 — Green only @ +90 / -180
  { coating: "Green", sph: "0.00", cyl: formatPower(2), axis: 90, costPrice: "550" },
  { coating: "Green", sph: "0.00", cyl: formatPower(2), axis: -180, costPrice: "550" },
];

const ALL_ROWS = POWER_SPECS.map(buildRow);

async function main() {
  console.log(`Seeding POLY PROGRESSIVE BLUE CUT (${ALL_ROWS.length} rows)...`);

  const deleted = await prisma.progressiveLens.deleteMany({
    where: {
      category: { equals: BASE_META.category, mode: "insensitive" },
      item: { equals: BASE_META.item, mode: "insensitive" },
      brand: BASE_META.brand,
      index: BASE_META.index,
    },
  });

  console.log(`Removed ${deleted.count} existing POLY PROGRESSIVE BLUE CUT row(s).`);

  const created = await prisma.progressiveLens.createMany({
    data: ALL_ROWS,
  });

  console.log(`Inserted ${created.count} POLY PROGRESSIVE BLUE CUT row(s).`);
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
