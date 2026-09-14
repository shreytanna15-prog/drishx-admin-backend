import "dotenv/config";
import { PrismaClient, type Eye } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { withSellingPrice } from "./single-vision-seed-pricing";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const META = {
  category: "PHOTO BROWN BR PROG",
  item: "PHOTO BROWN BR PROG",
  brand: "9+4 Design",
  index: "1.56",
  type: "HMC",
  coating: "Clik",
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
  sph: string;
  costPrice: string;
};

function buildRow(spec: PowerSpec): ProgressiveSeedRow {
  const pricing = withSellingPrice(spec.costPrice);
  return {
    ...META,
    sph: spec.sph,
    cyl: null,
    axis: null,
    ...pricing,
    quantity: 0,
  };
}

/** PHOTO BROWN BR PROG 9+4 Design — Clik coating, SPH-only price sheet. */
const POWER_SPECS: PowerSpec[] = [
  { sph: "3.00", costPrice: "550" },
  { sph: "-2.00", costPrice: "650" },
];

const ALL_ROWS = POWER_SPECS.map(buildRow);

async function main() {
  console.log(`Seeding PHOTO BROWN BR PROG Clik (${ALL_ROWS.length} rows)...`);

  const deleted = await prisma.progressiveLens.deleteMany({
    where: {
      category: { equals: META.category, mode: "insensitive" },
      item: { equals: META.item, mode: "insensitive" },
      brand: META.brand,
      coating: { equals: META.coating, mode: "insensitive" },
    },
  });

  console.log(`Removed ${deleted.count} existing PHOTO BROWN BR PROG Clik row(s).`);

  const created = await prisma.progressiveLens.createMany({
    data: ALL_ROWS,
  });

  console.log(`Inserted ${created.count} PHOTO BROWN BR PROG Clik row(s).`);
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
