import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { withSellingPrice } from "./single-vision-seed-pricing";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const META = {
  category: "PG BR Green",
  brand: "Magnus",
  item: "PG SV Hi-index",
  index: "1.67",
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

/** Magnus PG SV Hi-index 1.67 PG BR Green — price sheet (GREEN). */
const POWER_SPECS: PowerSpec[] = [
  { sph: -12, cyl: 0, costPrice: "950" },
  { sph: -10, cyl: -2, costPrice: "950" },
  { sph: -15, cyl: 0, costPrice: "1150" },
  { sph: -12, cyl: -2, costPrice: "1150" },
  { sph: -10, cyl: -4, costPrice: "1150" },
];

const ALL_ROWS = POWER_SPECS.map(buildRow);

async function main() {
  console.log(`Seeding Magnus PG SV Hi-index 1.67 (${ALL_ROWS.length} rows)...`);

  const deleted = await prisma.singleVisionLens.deleteMany({
    where: {
      category: { equals: META.category, mode: "insensitive" },
      brand: { equals: META.brand, mode: "insensitive" },
      item: { equals: META.item, mode: "insensitive" },
      index: META.index,
      coating: META.coating,
    },
  });

  console.log(`Removed ${deleted.count} existing Magnus PG SV Hi-index row(s).`);

  const created = await prisma.singleVisionLens.createMany({
    data: ALL_ROWS,
  });

  console.log(`Inserted ${created.count} Magnus PG SV Hi-index GREEN row(s).`);
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
