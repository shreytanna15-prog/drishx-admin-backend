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

const ASH_BLUE_CUT_META = {
  category: "BLUE CUT",
  brand: "ASH",
  item: "BLUE CUT",
  index: "1.60",
  coating: "GREEN",
} as const;

function row(entry: { sph: string; cyl: string; costPrice: string }): SingleVisionSeedRow {
  const pricing = withSellingPrice(entry.costPrice);
  return {
    ...ASH_BLUE_CUT_META,
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
    ...ASH_BLUE_CUT_META,
    sph: null,
    cyl: null,
    crossPower,
    ...pricing,
    quantity: 0,
  };
}

/** ASH Single Vision Blue Cut @ 1.60 GREEN — price sheet (5 rows). */
const ashBlueCutRows: SingleVisionSeedRow[] = [
  row({ sph: "-6.00", cyl: "-2.00", costPrice: "72" }),
  row({ sph: "-8.00", cyl: "-2.00", costPrice: "72" }),
  row({ sph: "6.00", cyl: "0.00", costPrice: "82" }),
  row({ sph: "4.00", cyl: "0.00", costPrice: "82" }),
  crossRow("-2.00", "94"),
];

async function main() {
  console.log(`Refreshing ${ashBlueCutRows.length} ASH BLUE CUT Single Vision products...`);

  const removed = await prisma.singleVisionLens.deleteMany({
    where: {
      brand: { equals: ASH_BLUE_CUT_META.brand, mode: "insensitive" },
      item: { equals: ASH_BLUE_CUT_META.item, mode: "insensitive" },
      index: ASH_BLUE_CUT_META.index,
      coating: { equals: ASH_BLUE_CUT_META.coating, mode: "insensitive" },
    },
  });
  console.log(`Removed ${removed.count} existing ASH BLUE CUT rows.`);

  const result = await prisma.singleVisionLens.createMany({
    data: ashBlueCutRows,
  });

  console.log(`Inserted ${result.count} rows:`);
  for (const entry of ashBlueCutRows) {
    const power =
      entry.crossPower !== null
        ? `cross ${entry.crossPower}`
        : `${entry.sph} / ${entry.cyl}`;
    console.log(`  ${power} — cost ₹${entry.costPrice}, sell ₹${entry.price}`);
  }
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
