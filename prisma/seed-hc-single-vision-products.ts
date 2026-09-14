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

/** Hardcoat SV @ 1.56 — brand/coating absent on price sheet (stored as empty strings). */
const HC_META = {
  category: "Hardcoat",
  brand: "",
  item: "single vision hard coat",
  index: "1.56",
  coating: "",
} as const;

function row(entry: { sph: string; cyl: string; costPrice: string }): SingleVisionSeedRow {
  const pricing = withSellingPrice(entry.costPrice);
  return {
    ...HC_META,
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
    ...HC_META,
    sph: null,
    cyl: null,
    crossPower,
    ...pricing,
    quantity: 0,
  };
}

/** Single Vision Hardcoat @ 1.56 — HC price sheet (ranges + cost column). */
const hcRows: SingleVisionSeedRow[] = [
  // MINUS / CYL -2.00
  row({ sph: "-6.00", cyl: "-2.00", costPrice: "38" }),
  row({ sph: "-8.00", cyl: "-2.00", costPrice: "38" }),
  row({ sph: "-10.00", cyl: "-2.00", costPrice: "100" }),
  // -15 SPH — no cost on sheet, skipped
  row({ sph: "-12.00", cyl: "-2.00", costPrice: "230" }),
  row({ sph: "-14.00", cyl: "-2.00", costPrice: "260" }),
  row({ sph: "-15.00", cyl: "-2.00", costPrice: "290" }),
  row({ sph: "-16.00", cyl: "-2.00", costPrice: "290" }),
  row({ sph: "-18.00", cyl: "-2.00", costPrice: "320" }),
  row({ sph: "-20.00", cyl: "-2.00", costPrice: "360" }),

  // MINUS / CYL -4.00
  row({ sph: "-6.00", cyl: "-4.00", costPrice: "75" }),
  row({ sph: "-8.00", cyl: "-4.00", costPrice: "150" }),
  row({ sph: "-10.00", cyl: "-4.00", costPrice: "215" }),
  row({ sph: "-12.00", cyl: "-4.00", costPrice: "280" }),
  row({ sph: "-14.00", cyl: "-4.00", costPrice: "310" }),
  row({ sph: "-15.00", cyl: "-4.00", costPrice: "340" }),
  row({ sph: "-16.00", cyl: "-4.00", costPrice: "340" }),
  row({ sph: "-18.00", cyl: "-4.00", costPrice: "370" }),
  row({ sph: "-20.00", cyl: "-4.00", costPrice: "410" }),

  // MINUS / CYL -6.00
  row({ sph: "-6.00", cyl: "-6.00", costPrice: "160" }),

  // PLUS (+6sph, +4/+2 → SPH-only: +6 and +4, both CYL 0)
  row({ sph: "6.00", cyl: "0.00", costPrice: "41" }),
  row({ sph: "4.00", cyl: "0.00", costPrice: "41" }),

  // CROSS
  crossRow("-2.00", "65"),
  crossRow("-4.00", "95"),
  crossRow("-6.00", "190"),
];

async function main() {
  console.log(`Refreshing ${hcRows.length} Single Vision Hardcoat products...`);

  const removed = await prisma.singleVisionLens.deleteMany({
    where: {
      category: { equals: HC_META.category, mode: "insensitive" },
      item: { equals: HC_META.item, mode: "insensitive" },
      index: HC_META.index,
      brand: HC_META.brand,
      coating: HC_META.coating,
    },
  });
  console.log(`Removed ${removed.count} existing Hardcoat rows.`);

  const result = await prisma.singleVisionLens.createMany({
    data: hcRows,
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
