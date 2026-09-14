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

type ProductMeta = {
  category: string;
  brand: string;
  item: string;
  coating: string;
};

const MR8_META: ProductMeta = {
  category: "DUAL COATING",
  brand: "1.61 MR8",
  item: "DUAL COATING",
  coating: "MR8",
};

const ZION_META: ProductMeta = {
  category: "DUAL COATING",
  brand: "ZION",
  item: "DUAL COATING",
  coating: "DARK BLU/CRYSTAL GREEN",
};

function row(
  meta: ProductMeta,
  index: string,
  entry: { sph: string; cyl: string | null; costPrice: string }
): SingleVisionSeedRow {
  const pricing = withSellingPrice(entry.costPrice);
  return {
    ...meta,
    index,
    sph: entry.sph,
    cyl: entry.cyl,
    crossPower: null,
    ...pricing,
    quantity: 0,
  };
}

/** Dual Coating Single Vision — 1.61 MR8 + ZION only (no Majestic). */
const dualCoatingRows: SingleVisionSeedRow[] = [
  // 1.61 MR8
  row(MR8_META, "1.61", { sph: "-6.00", cyl: "-2.00", costPrice: "250" }),
  row(MR8_META, "1.61", { sph: "-8.00", cyl: "-2.00", costPrice: "250" }),
  row(MR8_META, "1.61", { sph: "-10.00", cyl: "-2.00", costPrice: "350" }),
  row(MR8_META, "1.61", { sph: "-6.00", cyl: "-4.00", costPrice: "350" }),
  row(MR8_META, "1.61", { sph: "-8.00", cyl: "-4.00", costPrice: "400" }),

  // ZION · index 1.67
  row(ZION_META, "1.67", { sph: "-6.00", cyl: "-2.00", costPrice: "515" }),
  row(ZION_META, "1.67", { sph: "-8.00", cyl: "-2.00", costPrice: "515" }),
  row(ZION_META, "1.67", { sph: "-10.00", cyl: "-2.00", costPrice: "515" }),
  row(ZION_META, "1.67", { sph: "-15.00", cyl: "0.00", costPrice: "565" }),
  row(ZION_META, "1.67", { sph: "-12.00", cyl: "-2.00", costPrice: "565" }),
  row(ZION_META, "1.67", { sph: "-6.00", cyl: "-4.00", costPrice: "815" }),
  row(ZION_META, "1.67", { sph: "-8.00", cyl: "-4.00", costPrice: "815" }),
  row(ZION_META, "1.67", { sph: "-10.00", cyl: "-4.00", costPrice: "815" }),
  row(ZION_META, "1.67", { sph: "-16.00", cyl: "0.00", costPrice: "1600" }),
  row(ZION_META, "1.67", { sph: "-14.00", cyl: "-2.00", costPrice: "1600" }),
  row(ZION_META, "1.67", { sph: "-20.00", cyl: "-2.00", costPrice: "1600" }),
  row(ZION_META, "1.67", { sph: "-12.00", cyl: "-4.00", costPrice: "1600" }),
  row(ZION_META, "1.67", { sph: "-20.00", cyl: "-4.00", costPrice: "1600" }),
];

async function main() {
  console.log(`Refreshing ${dualCoatingRows.length} Dual Coating Single Vision products...`);

  const removed = await prisma.singleVisionLens.deleteMany({
    where: {
      category: "DUAL COATING",
      brand: { in: [MR8_META.brand, ZION_META.brand] },
    },
  });
  console.log(`Removed ${removed.count} existing Dual Coating rows.`);

  const result = await prisma.singleVisionLens.createMany({
    data: dualCoatingRows,
  });

  console.log(`Inserted ${result.count} rows.`);

  const mr8Count = await prisma.singleVisionLens.count({
    where: { brand: MR8_META.brand },
  });
  const zionCount = await prisma.singleVisionLens.count({
    where: { brand: ZION_META.brand },
  });
  console.log(`1.61 MR8 count: ${mr8Count}`);
  console.log(`ZION count: ${zionCount}`);
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
