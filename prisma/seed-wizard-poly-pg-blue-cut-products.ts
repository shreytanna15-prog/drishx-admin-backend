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

const WIZARD_POLY_PG_META = {
  category: "BLUE CUT SV",
  brand: "WIZARD POLY PG BLUE CUT",
  item: "POLY PG BLUE CUT",
  index: "1.59",
  coating: "BLUE",
} as const;

function row(entry: { sph: string; cyl: string | null; costPrice: string }): SingleVisionSeedRow {
  const pricing = withSellingPrice(entry.costPrice);
  return {
    ...WIZARD_POLY_PG_META,
    sph: entry.sph,
    cyl: entry.cyl,
    crossPower: null,
    ...pricing,
    quantity: 0,
  };
}

/** WIZARD POLY PG BLUE CUT @ 1.59 · BLUE. */
const wizardPolyPgBlueCutRows: SingleVisionSeedRow[] = [
  row({ sph: "-6.00", cyl: "-2.00", costPrice: "475" }),
  row({ sph: "0.00", cyl: "-4.00", costPrice: "725" }),
  row({ sph: "4.00", cyl: "0.00", costPrice: "550" }),
  row({ sph: "3.00", cyl: "1.00", costPrice: "550" }),
];

async function main() {
  console.log(`Refreshing ${wizardPolyPgBlueCutRows.length} WIZARD POLY PG BLUE CUT products...`);

  const removed = await prisma.singleVisionLens.deleteMany({
    where: {
      brand: WIZARD_POLY_PG_META.brand,
      item: WIZARD_POLY_PG_META.item,
      index: WIZARD_POLY_PG_META.index,
      coating: WIZARD_POLY_PG_META.coating,
    },
  });
  console.log(`Removed ${removed.count} existing rows.`);

  const result = await prisma.singleVisionLens.createMany({
    data: wizardPolyPgBlueCutRows,
  });

  console.log(`Inserted ${result.count} rows.`);
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
