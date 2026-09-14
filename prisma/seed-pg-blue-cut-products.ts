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

const PG_BLUE_CUT_META = {
  category: "PG BLUE CUT",
  brand: "PG BLUE CUT",
  item: "PG BLUE CUT",
  coating: "GREEN/BLUE/INVISIBLE MARI BLUE",
  index: "1.67",
} as const;

function row(entry: { sph: string; cyl: string | null; costPrice: string }): SingleVisionSeedRow {
  const pricing = withSellingPrice(entry.costPrice);
  return {
    ...PG_BLUE_CUT_META,
    sph: entry.sph,
    cyl: entry.cyl,
    crossPower: null,
    ...pricing,
    quantity: 0,
  };
}

/** PG BLUE CUT Single Vision @ 1.67 — GREEN/BLUE/INVISIBLE MARI BLUE. */
const pgBlueCutRows: SingleVisionSeedRow[] = [
  row({ sph: "-6.00", cyl: "-2.00", costPrice: "900" }),
  row({ sph: "-8.00", cyl: "-2.00", costPrice: "900" }),
  row({ sph: "-10.00", cyl: "-2.00", costPrice: "900" }),
  row({ sph: "-15.00", cyl: "0.00", costPrice: "1000" }),
  row({ sph: "-12.00", cyl: "-2.00", costPrice: "1000" }),
  row({ sph: "-6.00", cyl: "-4.00", costPrice: "1200" }),
  row({ sph: "-8.00", cyl: "-4.00", costPrice: "1200" }),
  row({ sph: "-10.00", cyl: "-4.00", costPrice: "1200" }),
  row({ sph: "-16.00", cyl: "0.00", costPrice: "2000" }),
  row({ sph: "-14.00", cyl: "-2.00", costPrice: "2000" }),
  row({ sph: "-12.00", cyl: "-4.00", costPrice: "2000" }),
];

async function main() {
  console.log(`Refreshing ${pgBlueCutRows.length} PG BLUE CUT (1.67) products...`);

  const removed = await prisma.singleVisionLens.deleteMany({
    where: {
      category: PG_BLUE_CUT_META.category,
      index: PG_BLUE_CUT_META.index,
      coating: PG_BLUE_CUT_META.coating,
    },
  });
  console.log(`Removed ${removed.count} existing rows.`);

  const result = await prisma.singleVisionLens.createMany({
    data: pgBlueCutRows,
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
