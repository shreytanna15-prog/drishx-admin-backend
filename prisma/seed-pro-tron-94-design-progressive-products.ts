import "dotenv/config";
import { PrismaClient, type Eye } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { withSellingPrice } from "./single-vision-seed-pricing";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const BASE_META = {
  category: "Pro-Tron 9+4 Design",
  item: "BLUE CUT PROGRESSIVE 1.56",
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

/** Pro-Tron 9+4 Design — Clik / LR Green price sheet (index 1.56). */
const POWER_SPECS: PowerSpec[] = [
  // SPH only — Clik / LR Green
  { coating: "Clik", sph: "3.00", cyl: null, axis: null, costPrice: "190" },
  { coating: "Clik", sph: "-2.00", cyl: null, axis: null, costPrice: "240" },
  { coating: "LR Green", sph: "3.00", cyl: null, axis: null, costPrice: "140" },
  { coating: "LR Green", sph: "-2.00", cyl: null, axis: null, costPrice: "170" },

  // CYL 2 — Clik / LR Green
  { coating: "Clik", sph: "0.00", cyl: formatPower(2), axis: 180, costPrice: "240" },
  { coating: "Clik", sph: "0.00", cyl: formatPower(2), axis: -90, costPrice: "240" },
  { coating: "Clik", sph: "0.00", cyl: formatPower(2), axis: 90, costPrice: "290" },
  { coating: "Clik", sph: "0.00", cyl: formatPower(2), axis: -180, costPrice: "290" },
  { coating: "LR Green", sph: "0.00", cyl: formatPower(2), axis: 180, costPrice: "160" },
  { coating: "LR Green", sph: "0.00", cyl: formatPower(2), axis: -90, costPrice: "160" },
  { coating: "LR Green", sph: "0.00", cyl: formatPower(2), axis: 90, costPrice: "200" },
  { coating: "LR Green", sph: "0.00", cyl: formatPower(2), axis: -180, costPrice: "200" },

  // Compound — Clik / LR Green
  { coating: "Clik", sph: formatPower(2), cyl: formatPower(1), axis: 180, costPrice: "280" },
  { coating: "Clik", sph: formatPower(2), cyl: formatPower(2), axis: -90, costPrice: "320" },
  { coating: "Clik", sph: formatPower(2), cyl: formatPower(2), axis: 90, costPrice: "330" },
  { coating: "Clik", sph: formatPower(2), cyl: formatPower(2), axis: -180, costPrice: "370" },
  { coating: "LR Green", sph: formatPower(2), cyl: formatPower(1), axis: 180, costPrice: "190" },
  { coating: "LR Green", sph: formatPower(2), cyl: formatPower(2), axis: -90, costPrice: "240" },
  { coating: "LR Green", sph: formatPower(2), cyl: formatPower(2), axis: 90, costPrice: "250" },
  { coating: "LR Green", sph: formatPower(2), cyl: formatPower(2), axis: -180, costPrice: "290" },
];

const ALL_ROWS = POWER_SPECS.map(buildRow);

async function main() {
  console.log(`Seeding Pro-Tron 9+4 Design (${ALL_ROWS.length} rows)...`);

  const deleted = await prisma.progressiveLens.deleteMany({
    where: {
      category: { equals: BASE_META.category, mode: "insensitive" },
      item: { equals: BASE_META.item, mode: "insensitive" },
      brand: BASE_META.brand,
      index: BASE_META.index,
    },
  });

  console.log(`Removed ${deleted.count} existing Pro-Tron 9+4 Design row(s).`);

  const created = await prisma.progressiveLens.createMany({
    data: ALL_ROWS,
  });

  console.log(`Inserted ${created.count} Pro-Tron 9+4 Design row(s).`);
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
