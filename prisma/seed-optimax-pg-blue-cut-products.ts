import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { withSellingPrice } from "./single-vision-seed-pricing";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

type SingleVisionSeedRow = {
  category: string;
  brand: string;
  item: string;
  index: string;
  coating: string;
  sph: string | null;
  cyl: string | null;
  crossPower: string | null;
  costPrice: string;
  price: string;
  quantity: number;
};

const OPTIMAX_MARI_BLU_META = {
  category: "OPTIMAX SV PG BLUE CUT",
  brand: "OPTIMAX PG BLUE CUT MARI BLU",
  item: "OPTIMAX PG BLUE CUT",
  coating: "INVISIBLE BLUE",
} as const;

function row(entry: { sph: string; cyl: string | null; costPrice: string }): SingleVisionSeedRow {
  const pricing = withSellingPrice(entry.costPrice);
  return {
    ...OPTIMAX_MARI_BLU_META,
    index: "1.56",
    sph: entry.sph,
    cyl: entry.cyl,
    crossPower: null,
    ...pricing,
    quantity: 0,
  };
}

function crossRow(crossPower: string, costPrice: string): SingleVisionSeedRow {
  const pricing = withSellingPrice(costPrice);
  return {
    ...OPTIMAX_MARI_BLU_META,
    index: "1.56",
    sph: null,
    cyl: null,
    crossPower,
    ...pricing,
    quantity: 0,
  };
}

/** OPTIMAX SV PG BLUE CUT — MARI BLU @ 1.56 · INVISIBLE BLUE. */
const optimaxPgBlueCutRows: SingleVisionSeedRow[] = [
  row({ sph: "-6.00", cyl: "-2.00", costPrice: "270" }),
  row({ sph: "-8.00", cyl: "-2.00", costPrice: "270" }),
  row({ sph: "-6.00", cyl: "-4.00", costPrice: "450" }),
  row({ sph: "4.00", cyl: "0.00", costPrice: "320" }),
  row({ sph: "3.00", cyl: "1.00", costPrice: "320" }),
  crossRow("-2.00", "370"),
  crossRow("-4.00", "500"),
];

async function main() {
  console.log(`Refreshing ${optimaxPgBlueCutRows.length} OPTIMAX PG BLUE CUT MARI BLU products...`);

  const removed = await prisma.singleVisionLens.deleteMany({
    where: {
      brand: OPTIMAX_MARI_BLU_META.brand,
      item: OPTIMAX_MARI_BLU_META.item,
      coating: OPTIMAX_MARI_BLU_META.coating,
    },
  });
  console.log(`Removed ${removed.count} existing rows.`);

  const result = await prisma.singleVisionLens.createMany({
    data: optimaxPgBlueCutRows,
  });

  console.log(`Inserted ${result.count} rows.`);

  const total = await prisma.singleVisionLens.count({
    where: { brand: OPTIMAX_MARI_BLU_META.brand },
  });
  console.log(`OPTIMAX PG BLUE CUT MARI BLU count: ${total}`);
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
