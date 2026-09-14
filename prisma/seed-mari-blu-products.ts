import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  buildSingleVisionWholesaleItemWhere,
} from "../app/lib/single-vision-wholesale-catalog";
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

const MARI_BLU_META = {
  category: "BLUE CUT SV",
  brand: "MARI BLU",
  item: "MARI-BLUE",
  coating: "INVISIBLE BLUE EXTRA WHITE",
} as const;

function row(
  index: string,
  entry: { sph: string; cyl: string | null; costPrice: string }
): SingleVisionSeedRow {
  const pricing = withSellingPrice(entry.costPrice);
  return {
    ...MARI_BLU_META,
    index,
    sph: entry.sph,
    cyl: entry.cyl,
    crossPower: null,
    ...pricing,
    quantity: 0,
  };
}

function crossRow(index: string, crossPower: string, costPrice: string): SingleVisionSeedRow {
  const pricing = withSellingPrice(costPrice);
  return {
    ...MARI_BLU_META,
    index,
    sph: null,
    cyl: null,
    crossPower,
    ...pricing,
    quantity: 0,
  };
}

/** MARI BLU Single Vision Blue Cut — INVISIBLE BLUE EXTRA WHITE price sheet. */
const mariBluRows: SingleVisionSeedRow[] = [
  // Index 1.56
  row("1.56", { sph: "-6.00", cyl: "-2.00", costPrice: "160" }),
  row("1.56", { sph: "-8.00", cyl: "-2.00", costPrice: "160" }),
  row("1.56", { sph: "-10.00", cyl: "-2.00", costPrice: "260" }),
  row("1.56", { sph: "-6.00", cyl: "-4.00", costPrice: "260" }),
  row("1.56", { sph: "4.00", cyl: "0.00", costPrice: "180" }),
  row("1.56", { sph: "3.00", cyl: "1.00", costPrice: "180" }),
  row("1.56", { sph: "6.00", cyl: "0.00", costPrice: "180" }),
  row("1.56", { sph: "4.00", cyl: "2.00", costPrice: "180" }),
  crossRow("1.56", "-2.00", "190"),
  crossRow("1.56", "-4.00", "310"),

  // Index 1.67
  row("1.67", { sph: "-6.00", cyl: "-2.00", costPrice: "500" }),
  row("1.67", { sph: "-8.00", cyl: "-2.00", costPrice: "500" }),
  row("1.67", { sph: "-10.00", cyl: "-2.00", costPrice: "500" }),
  row("1.67", { sph: "-15.00", cyl: "0.00", costPrice: "550" }),
  row("1.67", { sph: "-12.00", cyl: "-2.00", costPrice: "550" }),
  row("1.67", { sph: "-6.00", cyl: "-4.00", costPrice: "750" }),
  row("1.67", { sph: "-8.00", cyl: "-4.00", costPrice: "750" }),
  row("1.67", { sph: "-10.00", cyl: "-4.00", costPrice: "750" }),
  row("1.67", { sph: "-16.00", cyl: "0.00", costPrice: "1600" }),
  row("1.67", { sph: "-14.00", cyl: "-2.00", costPrice: "1600" }),
  row("1.67", { sph: "-20.00", cyl: "-2.00", costPrice: "1600" }),
  row("1.67", { sph: "-12.00", cyl: "-4.00", costPrice: "1600" }),
  row("1.67", { sph: "-20.00", cyl: "-4.00", costPrice: "1600" }),

  // Index 1.74
  row("1.74", { sph: "-6.00", cyl: "-2.00", costPrice: "1700" }),
  row("1.74", { sph: "-8.00", cyl: "-2.00", costPrice: "1700" }),
  row("1.74", { sph: "-10.00", cyl: "-2.00", costPrice: "1700" }),
  row("1.74", { sph: "-15.00", cyl: "0.00", costPrice: "1900" }),
  row("1.74", { sph: "-12.00", cyl: "-2.00", costPrice: "1900" }),
];

async function main() {
  console.log(`Refreshing ${mariBluRows.length} MARI BLU Single Vision products...`);

  const removed = await prisma.singleVisionLens.deleteMany({
    where: {
      brand: MARI_BLU_META.brand,
      coating: MARI_BLU_META.coating,
    },
  });
  console.log(`Removed ${removed.count} existing MARI BLU rows.`);

  const result = await prisma.singleVisionLens.createMany({
    data: mariBluRows,
  });

  console.log(`Inserted ${result.count} rows.`);

  const mariBlueCount = await prisma.singleVisionLens.count({
    where: buildSingleVisionWholesaleItemWhere("MARI-BLUE"),
  });
  console.log(`MARI-BLUE wholesale catalog count: ${mariBlueCount}`);
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
