import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { withSellingPrice } from "./single-vision-seed-pricing";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const META = {
  category: "BLUE CUT SV 1.56 Premium Range",
  brand: "",
  item: "EVO 1.56 Green",
  index: "1.56",
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

/** EVO 1.56 Green — BLUE CUT SV 1.56 Premium Range price sheet. */
const POWER_SPECS: PowerSpec[] = [
  { sph: -8, cyl: -2, costPrice: "120" },
  { sph: -6, cyl: -4, costPrice: "210" },
  { sph: 6, cyl: 0, costPrice: "140" },
  { sph: 4, cyl: 2, costPrice: "140" },
  { sph: 1.75, cyl: -2, costPrice: "170" },
  { sph: 2, cyl: 4, costPrice: "210" },
  { sph: 2, cyl: -4, costPrice: "210" },
];

const ALL_ROWS = POWER_SPECS.map(buildRow);

async function main() {
  console.log(`Seeding EVO 1.56 Green (${ALL_ROWS.length} rows)...`);

  const deleted = await prisma.singleVisionLens.deleteMany({
    where: {
      category: { equals: META.category, mode: "insensitive" },
      brand: META.brand,
      item: { equals: META.item, mode: "insensitive" },
      index: META.index,
      coating: META.coating,
    },
  });

  console.log(`Removed ${deleted.count} existing EVO 1.56 Green row(s).`);

  const created = await prisma.singleVisionLens.createMany({
    data: ALL_ROWS,
  });

  console.log(`Inserted ${created.count} EVO 1.56 Green row(s).`);
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
