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

/** Blue Cut 55mm SV @ 1.56 GREEN — Dia 55mm price sheet. */
const BLUE_CUT_55_META = {
  category: "blue cut",
  brand: "",
  item: "blue cut 55",
  index: "1.56",
  coating: "GREEN",
} as const;

function row(entry: { sph: string; cyl: string; costPrice: string }): SingleVisionSeedRow {
  const pricing = withSellingPrice(entry.costPrice);
  return {
    ...BLUE_CUT_55_META,
    sph: entry.sph,
    cyl: entry.cyl,
    crossPower: null,
    ...pricing,
    quantity: 0,
  };
}

/** Blue Cut 55 @ 1.56 GREEN — 55mm dia price sheet. */
const blueCut55Rows: SingleVisionSeedRow[] = [
  row({ sph: "6.00", cyl: "2.00", costPrice: "225" }),
  row({ sph: "8.00", cyl: "2.00", costPrice: "275" }),
  row({ sph: "10.00", cyl: "2.00", costPrice: "325" }),
  row({ sph: "12.00", cyl: "2.00", costPrice: "400" }),
  row({ sph: "14.00", cyl: "0.00", costPrice: "500" }),
  row({ sph: "6.00", cyl: "4.00", costPrice: "275" }),
  row({ sph: "0.00", cyl: "6.00", costPrice: "400" }),
];

async function main() {
  console.log(`Refreshing ${blueCut55Rows.length} Blue Cut 55 Single Vision products...`);

  const removed = await prisma.singleVisionLens.deleteMany({
    where: {
      category: { equals: BLUE_CUT_55_META.category, mode: "insensitive" },
      item: { equals: BLUE_CUT_55_META.item, mode: "insensitive" },
      index: BLUE_CUT_55_META.index,
      coating: { equals: BLUE_CUT_55_META.coating, mode: "insensitive" },
      brand: BLUE_CUT_55_META.brand,
    },
  });
  console.log(`Removed ${removed.count} existing Blue Cut 55 rows.`);

  const result = await prisma.singleVisionLens.createMany({
    data: blueCut55Rows,
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
