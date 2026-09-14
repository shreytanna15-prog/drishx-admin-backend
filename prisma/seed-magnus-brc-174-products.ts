import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { withSellingPrice } from "./single-vision-seed-pricing";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const META = {
  category: "BRC",
  brand: "Magnus",
  item: "MAGNUS 1.74",
  index: "1.74",
  coating: "GREEN",
} as const;

type SingleVisionSeedRow = {
  category: string;
  brand: string;
  item: string;
  index: string;
  coating: string;
  sph: string;
  cyl: string;
  crossPower: null;
  costPrice: string;
  price: string;
  quantity: number;
};

type PowerSpec = {
  sph: number;
  cyl: number;
  costPrice: string;
};

function formatPower(value: number): string {
  return value.toFixed(2);
}

function buildRow(spec: PowerSpec): SingleVisionSeedRow {
  const pricing = withSellingPrice(spec.costPrice);
  return {
    ...META,
    sph: formatPower(spec.sph),
    cyl: formatPower(spec.cyl),
    crossPower: null,
    ...pricing,
    quantity: 0,
  };
}

/** Magnus BRC 1.74 — price sheet (GREEN only). */
const POWER_SPECS: PowerSpec[] = [
  { sph: -12, cyl: 0, costPrice: "1450" },
  { sph: -10, cyl: -2, costPrice: "1450" },
  { sph: -15, cyl: 0, costPrice: "1900" },
  { sph: -12, cyl: -2, costPrice: "1900" },
  { sph: -10, cyl: -4, costPrice: "1900" },
  { sph: -24, cyl: 0, costPrice: "2850" },
  { sph: -20, cyl: -2, costPrice: "2850" },
  { sph: -14, cyl: -4, costPrice: "2850" },
];

const ALL_ROWS = POWER_SPECS.map(buildRow);

async function main() {
  console.log(`Seeding Magnus BRC 1.74 Single Vision (${ALL_ROWS.length} rows)...`);

  const deleted = await prisma.singleVisionLens.deleteMany({
    where: {
      category: { equals: META.category, mode: "insensitive" },
      brand: { equals: META.brand, mode: "insensitive" },
      item: { equals: META.item, mode: "insensitive" },
      index: META.index,
      coating: META.coating,
    },
  });

  console.log(`Removed ${deleted.count} existing Magnus BRC 1.74 row(s).`);

  const created = await prisma.singleVisionLens.createMany({
    data: ALL_ROWS,
  });

  console.log(`Inserted ${created.count} Magnus BRC 1.74 GREEN row(s).`);
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
