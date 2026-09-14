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

const POLY_BLUE_CUT_ITEM = "POLY BLUE CUT";
const POLY_INDEX = "1.59";

const GREEN_META: ProductMeta = {
  category: "BLUE CUT SV",
  brand: "POLY BLUE CUT GREEN",
  item: POLY_BLUE_CUT_ITEM,
  coating: "GREEN",
};

const BLUE_META: ProductMeta = {
  category: "BLUE CUT SV",
  brand: "POLY BLUE CUT BLUE",
  item: POLY_BLUE_CUT_ITEM,
  coating: "BLUE",
};

const NIGHT_META: ProductMeta = {
  category: "BLUE CUT SV",
  brand: "POLY BLUE CUT NIGHT",
  item: POLY_BLUE_CUT_ITEM,
  coating: "MAGENTA NIGHT DRIVE",
};

const TWIN_META: ProductMeta = {
  category: "BLUE CUT SV",
  brand: "POLY BLUE CUT TWIN",
  item: POLY_BLUE_CUT_ITEM,
  coating: "BLU/GREEN",
};

const MARI_STEEL_META: ProductMeta = {
  category: "BLUE CUT SV",
  brand: "POLY BLUE CUT MARI STEEL",
  item: POLY_BLUE_CUT_ITEM,
  coating: "INVISIBLE MARI-BLU",
};

const ALL_POLY_BLUE_CUT_BRANDS = [
  GREEN_META.brand,
  BLUE_META.brand,
  NIGHT_META.brand,
  TWIN_META.brand,
  MARI_STEEL_META.brand,
] as const;

function row(
  meta: ProductMeta,
  entry: { sph: string; cyl: string | null; costPrice: string }
): SingleVisionSeedRow {
  const pricing = withSellingPrice(entry.costPrice);
  return {
    ...meta,
    index: POLY_INDEX,
    sph: entry.sph,
    cyl: entry.cyl,
    crossPower: null,
    ...pricing,
    quantity: 0,
  };
}

function crossRow(meta: ProductMeta, crossPower: string, costPrice: string): SingleVisionSeedRow {
  const pricing = withSellingPrice(costPrice);
  return {
    ...meta,
    index: POLY_INDEX,
    sph: null,
    cyl: null,
    crossPower,
    ...pricing,
    quantity: 0,
  };
}

/** Single Vision Poly Blue Cut @ 1.59 — price sheet. */
const polyBlueCutRows: SingleVisionSeedRow[] = [
  // POLY BLUE CUT GREEN
  row(GREEN_META, { sph: "-6.00", cyl: "-2.00", costPrice: "110" }),
  row(GREEN_META, { sph: "-8.00", cyl: "-2.00", costPrice: "210" }),
  row(GREEN_META, { sph: "-6.00", cyl: "-4.00", costPrice: "250" }),
  row(GREEN_META, { sph: "4.00", cyl: "0.00", costPrice: "130" }),
  row(GREEN_META, { sph: "3.00", cyl: "1.00", costPrice: "130" }),
  row(GREEN_META, { sph: "6.00", cyl: "0.00", costPrice: "130" }),
  row(GREEN_META, { sph: "4.00", cyl: "2.00", costPrice: "130" }),
  crossRow(GREEN_META, "-2.00", "140"),
  crossRow(GREEN_META, "-4.00", "300"),

  // POLY BLUE CUT BLUE
  row(BLUE_META, { sph: "-6.00", cyl: "-2.00", costPrice: "140" }),
  row(BLUE_META, { sph: "-8.00", cyl: "-2.00", costPrice: "235" }),
  row(BLUE_META, { sph: "-6.00", cyl: "-4.00", costPrice: "290" }),
  row(BLUE_META, { sph: "4.00", cyl: "0.00", costPrice: "160" }),
  row(BLUE_META, { sph: "3.00", cyl: "1.00", costPrice: "160" }),
  crossRow(BLUE_META, "-2.00", "180"),
  crossRow(BLUE_META, "-4.00", "340"),

  // POLY BLUE CUT NIGHT
  row(NIGHT_META, { sph: "-6.00", cyl: "-2.00", costPrice: "180" }),
  row(NIGHT_META, { sph: "-6.00", cyl: "-4.00", costPrice: "350" }),
  row(NIGHT_META, { sph: "4.00", cyl: "0.00", costPrice: "200" }),
  row(NIGHT_META, { sph: "3.00", cyl: "1.00", costPrice: "200" }),
  crossRow(NIGHT_META, "-2.00", "210"),

  // POLY BLUE CUT TWIN
  row(TWIN_META, { sph: "-6.00", cyl: "-2.00", costPrice: "160" }),
  row(TWIN_META, { sph: "-6.00", cyl: "-4.00", costPrice: "310" }),
  row(TWIN_META, { sph: "4.00", cyl: "0.00", costPrice: "180" }),
  row(TWIN_META, { sph: "3.00", cyl: "1.00", costPrice: "180" }),
  crossRow(TWIN_META, "-2.00", "200"),
  crossRow(TWIN_META, "-4.00", "360"),

  // POLY BLUE CUT MARI STEEL
  row(MARI_STEEL_META, { sph: "-6.00", cyl: "-2.00", costPrice: "160" }),
  row(MARI_STEEL_META, { sph: "-8.00", cyl: "-2.00", costPrice: "260" }),
  row(MARI_STEEL_META, { sph: "-6.00", cyl: "-4.00", costPrice: "310" }),
  row(MARI_STEEL_META, { sph: "4.00", cyl: "0.00", costPrice: "180" }),
  row(MARI_STEEL_META, { sph: "3.00", cyl: "1.00", costPrice: "180" }),
  crossRow(MARI_STEEL_META, "-2.00", "200"),
];

async function main() {
  console.log(`Refreshing ${polyBlueCutRows.length} Poly Blue Cut Single Vision products...`);

  const removed = await prisma.singleVisionLens.deleteMany({
    where: {
      item: POLY_BLUE_CUT_ITEM,
      index: POLY_INDEX,
      brand: { in: [...ALL_POLY_BLUE_CUT_BRANDS] },
    },
  });
  console.log(`Removed ${removed.count} existing Poly Blue Cut rows.`);

  const result = await prisma.singleVisionLens.createMany({
    data: polyBlueCutRows,
  });

  console.log(`Inserted ${result.count} rows.`);

  for (const brand of ALL_POLY_BLUE_CUT_BRANDS) {
    const count = await prisma.singleVisionLens.count({ where: { brand } });
    console.log(`  ${brand}: ${count}`);
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
