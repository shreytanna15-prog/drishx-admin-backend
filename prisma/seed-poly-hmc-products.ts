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

/** Poly HMC SV @ 1.59 GREEN — 2nd-last column on POLY price sheet. */
const POLY_HMC_META = {
  category: "poly hmc",
  brand: "",
  item: "poly hmc",
  index: "1.59",
  coating: "GREEN",
} as const;

function row(entry: { sph: string; cyl: string; costPrice: string }): SingleVisionSeedRow {
  const pricing = withSellingPrice(entry.costPrice);
  return {
    ...POLY_HMC_META,
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
    ...POLY_HMC_META,
    sph: null,
    cyl: null,
    crossPower,
    ...pricing,
    quantity: 0,
  };
}

/** Single Vision Poly HMC @ 1.59 GREEN — non-empty, non-scratched rows only. */
const polyHmcRows: SingleVisionSeedRow[] = [
  row({ sph: "-6.00", cyl: "-2.00", costPrice: "63" }),
  row({ sph: "-8.00", cyl: "-2.00", costPrice: "190" }),
  row({ sph: "-6.00", cyl: "-4.00", costPrice: "220" }),

  // +3 SPH, +2/+1 → SPH-only +3 and +2
  row({ sph: "3.00", cyl: "0.00", costPrice: "75" }),
  row({ sph: "2.00", cyl: "0.00", costPrice: "75" }),

  // +6 SPH, +4/+2 → SPH-only +6 and +4
  row({ sph: "6.00", cyl: "0.00", costPrice: "75" }),
  row({ sph: "4.00", cyl: "0.00", costPrice: "75" }),

  crossRow("-2.00", "85"),
];

async function main() {
  console.log(`Refreshing ${polyHmcRows.length} Poly HMC Single Vision products...`);

  const removed = await prisma.singleVisionLens.deleteMany({
    where: {
      category: { equals: POLY_HMC_META.category, mode: "insensitive" },
      item: { equals: POLY_HMC_META.item, mode: "insensitive" },
      index: POLY_HMC_META.index,
      coating: { equals: POLY_HMC_META.coating, mode: "insensitive" },
      brand: POLY_HMC_META.brand,
    },
  });
  console.log(`Removed ${removed.count} existing Poly HMC rows.`);

  const result = await prisma.singleVisionLens.createMany({
    data: polyHmcRows,
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
