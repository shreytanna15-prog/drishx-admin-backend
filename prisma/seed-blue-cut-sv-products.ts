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

const BLUE_CUT_SV_META = {
  category: "BLUE CUT",
  brand: "BLUE CUT SV",
  item: "BLUE CUT SV",
  index: "1.60",
  coating: "GREEN",
} as const;

function row(entry: { sph: string; cyl: string; costPrice: string }): SingleVisionSeedRow {
  const pricing = withSellingPrice(entry.costPrice);
  return {
    ...BLUE_CUT_SV_META,
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
    ...BLUE_CUT_SV_META,
    sph: null,
    cyl: null,
    crossPower,
    ...pricing,
    quantity: 0,
  };
}

/** BLUE CUT SV Single Vision @ 1.60 GREEN — price sheet. */
const blueCutSvRows: SingleVisionSeedRow[] = [
  // MINUS / CYL -2.00
  row({ sph: "-6.00", cyl: "-2.00", costPrice: "72" }),
  row({ sph: "-8.00", cyl: "-2.00", costPrice: "72" }),
  row({ sph: "-10.00", cyl: "-2.00", costPrice: "130" }),
  row({ sph: "-15.00", cyl: "0.00", costPrice: "300" }),
  row({ sph: "-12.00", cyl: "-2.00", costPrice: "300" }),
  row({ sph: "-14.00", cyl: "-2.00", costPrice: "350" }),
  row({ sph: "-15.00", cyl: "-2.00", costPrice: "350" }),
  row({ sph: "-16.00", cyl: "-2.00", costPrice: "400" }),
  row({ sph: "-18.00", cyl: "-2.00", costPrice: "400" }),
  row({ sph: "-20.00", cyl: "-2.00", costPrice: "400" }),

  // MINUS / CYL -4.00
  row({ sph: "-6.00", cyl: "-4.00", costPrice: "125" }),
  row({ sph: "-12.00", cyl: "-4.00", costPrice: "400" }),
  row({ sph: "-14.00", cyl: "-4.00", costPrice: "400" }),
  row({ sph: "-15.00", cyl: "-4.00", costPrice: "400" }),
  row({ sph: "-16.00", cyl: "-4.00", costPrice: "450" }),
  row({ sph: "-18.00", cyl: "-4.00", costPrice: "450" }),
  row({ sph: "-20.00", cyl: "-4.00", costPrice: "450" }),

  // MINUS / CYL -6.00
  row({ sph: "-6.00", cyl: "-6.00", costPrice: "270" }),

  // PLUS (+6sph, +4/+2 → SPH-only: +6 and +4, both CYL 0)
  row({ sph: "6.00", cyl: "0.00", costPrice: "72" }),
  row({ sph: "4.00", cyl: "0.00", costPrice: "72" }),

  // CROSS
  crossRow("-2.00", "84"),
  crossRow("-4.00", "170"),
  crossRow("-6.00", "320"),
];

async function main() {
  console.log(`Refreshing ${blueCutSvRows.length} BLUE CUT SV Single Vision products...`);

  const removed = await prisma.singleVisionLens.deleteMany({
    where: {
      brand: { equals: BLUE_CUT_SV_META.brand, mode: "insensitive" },
      item: { equals: BLUE_CUT_SV_META.item, mode: "insensitive" },
      index: BLUE_CUT_SV_META.index,
      coating: { equals: BLUE_CUT_SV_META.coating, mode: "insensitive" },
    },
  });
  console.log(`Removed ${removed.count} existing BLUE CUT SV rows.`);

  const result = await prisma.singleVisionLens.createMany({
    data: blueCutSvRows,
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
