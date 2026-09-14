import "dotenv/config";
import { PrismaClient, type Eye } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { withSellingPrice } from "./single-vision-seed-pricing";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const BASE_META = {
  category: "BRC V2",
  item: "BRC V2",
  brand: "",
  index: "1.56",
  type: "SHMC",
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

/** BRC V2 — Green / Blue price sheet (SPH / CYL / compound). */
const POWER_SPECS: PowerSpec[] = [
  // SPH only — Green / Blue
  { coating: "Green", sph: "3.00", cyl: null, axis: null, costPrice: "110" },
  { coating: "Blue", sph: "3.00", cyl: null, axis: null, costPrice: "160" },
  { coating: "Green", sph: "-2.00", cyl: null, axis: null, costPrice: "140" },
  { coating: "Blue", sph: "-2.00", cyl: null, axis: null, costPrice: "190" },
  { coating: "Green", sph: "4.00", cyl: null, axis: null, costPrice: "250" },
  { coating: "Green", sph: "-3.00", cyl: null, axis: null, costPrice: "200" },
  { coating: "Green", sph: "-4.00", cyl: null, axis: null, costPrice: "250" },

  // CYL only — Blue
  { coating: "Blue", sph: "0.00", cyl: formatPower(2), axis: 180, costPrice: "200" },
  { coating: "Blue", sph: "0.00", cyl: formatPower(2), axis: -90, costPrice: "200" },

  // CYL only — Green
  { coating: "Green", sph: "0.00", cyl: formatPower(2), axis: 180, costPrice: "150" },
  { coating: "Green", sph: "0.00", cyl: formatPower(2), axis: -90, costPrice: "150" },
  { coating: "Green", sph: "0.00", cyl: formatPower(2), axis: 90, costPrice: "190" },
  { coating: "Green", sph: "0.00", cyl: formatPower(2), axis: -180, costPrice: "190" },
  { coating: "Green", sph: "0.00", cyl: formatPower(3), axis: 180, costPrice: "200" },
  { coating: "Green", sph: "0.00", cyl: formatPower(3), axis: -90, costPrice: "200" },

  // Compound — Green only
  { coating: "Green", sph: formatPower(2), cyl: formatPower(2), axis: 180, costPrice: "190" },
  { coating: "Green", sph: formatPower(2), cyl: formatPower(2), axis: -90, costPrice: "240" },
  { coating: "Green", sph: formatPower(2), cyl: formatPower(1), axis: 90, costPrice: "250" },
  { coating: "Green", sph: formatPower(2), cyl: formatPower(1), axis: -180, costPrice: "285" },
  { coating: "Green", sph: formatPower(3), cyl: formatPower(1), axis: 180, costPrice: "240" },
  { coating: "Green", sph: formatPower(3), cyl: formatPower(1), axis: -90, costPrice: "290" },
  { coating: "Green", sph: formatPower(2), cyl: formatPower(2), axis: 180, costPrice: "240" },
  { coating: "Green", sph: formatPower(2), cyl: formatPower(2), axis: -90, costPrice: "290" },
];

const ALL_ROWS = POWER_SPECS.map(buildRow);

async function main() {
  console.log(`Seeding BRC V2 Green / Blue (${ALL_ROWS.length} rows)...`);

  const deleted = await prisma.progressiveLens.deleteMany({
    where: {
      category: { equals: BASE_META.category, mode: "insensitive" },
      item: { equals: BASE_META.item, mode: "insensitive" },
      brand: BASE_META.brand,
    },
  });

  console.log(`Removed ${deleted.count} existing BRC V2 row(s).`);

  const created = await prisma.progressiveLens.createMany({
    data: ALL_ROWS,
  });

  console.log(`Inserted ${created.count} BRC V2 row(s).`);
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
