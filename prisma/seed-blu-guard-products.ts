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

const BLU_GUARD_META = {
  category: "BLUE CUT SV",
  brand: "BLU-GUARD",
  item: "BLU-GUARD",
  coating: "GREEN ASPHERIC DESIGN",
} as const;

function row(
  index: string,
  entry: { sph: string; cyl: string | null; costPrice: string }
): SingleVisionSeedRow {
  const pricing = withSellingPrice(entry.costPrice);
  return {
    ...BLU_GUARD_META,
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
    ...BLU_GUARD_META,
    index,
    sph: null,
    cyl: null,
    crossPower,
    ...pricing,
    quantity: 0,
  };
}

/** BLU-GUARD Single Vision Blue Cut — GREEN ASPHERIC DESIGN price sheet. */
const bluGuardRows: SingleVisionSeedRow[] = [
  // Index 1.56
  row("1.56", { sph: "-6.00", cyl: "-2.00", costPrice: "115" }),
  row("1.56", { sph: "-8.00", cyl: "-2.00", costPrice: "115" }),
  row("1.56", { sph: "-10.00", cyl: "-2.00", costPrice: "215" }),
  row("1.56", { sph: "-6.00", cyl: "-4.00", costPrice: "215" }),
  row("1.56", { sph: "4.00", cyl: "0.00", costPrice: "135" }),
  row("1.56", { sph: "3.00", cyl: "1.00", costPrice: "135" }),
  row("1.56", { sph: "6.00", cyl: "0.00", costPrice: "135" }),
  row("1.56", { sph: "4.00", cyl: "2.00", costPrice: "135" }),
  crossRow("1.56", "-2.00", "145"),
  crossRow("1.56", "-4.00", "265"),

  // Index 1.61
  row("1.61", { sph: "-6.00", cyl: "-2.00", costPrice: "150" }),
  row("1.61", { sph: "-8.00", cyl: "-2.00", costPrice: "150" }),
  row("1.61", { sph: "-10.00", cyl: "-2.00", costPrice: "225" }),
  row("1.61", { sph: "-6.00", cyl: "-4.00", costPrice: "250" }),
  row("1.61", { sph: "-8.00", cyl: "-4.00", costPrice: "300" }),

  // Index 1.67
  row("1.67", { sph: "-6.00", cyl: "-2.00", costPrice: "325" }),
  row("1.67", { sph: "-8.00", cyl: "-2.00", costPrice: "325" }),
  row("1.67", { sph: "-10.00", cyl: "-2.00", costPrice: "325" }),
  row("1.67", { sph: "-15.00", cyl: "0.00", costPrice: "375" }),
  row("1.67", { sph: "-12.00", cyl: "-2.00", costPrice: "375" }),
  row("1.67", { sph: "-6.00", cyl: "-4.00", costPrice: "550" }),
  row("1.67", { sph: "-8.00", cyl: "-4.00", costPrice: "550" }),
  row("1.67", { sph: "-10.00", cyl: "-4.00", costPrice: "550" }),
  row("1.67", { sph: "-16.00", cyl: "0.00", costPrice: "1500" }),
  row("1.67", { sph: "-14.00", cyl: "-2.00", costPrice: "1500" }),
  row("1.67", { sph: "-20.00", cyl: "-2.00", costPrice: "1500" }),
  row("1.67", { sph: "-12.00", cyl: "-4.00", costPrice: "1500" }),
  row("1.67", { sph: "-20.00", cyl: "-4.00", costPrice: "1500" }),

  // Index 1.74
  row("1.74", { sph: "-6.00", cyl: "-2.00", costPrice: "1700" }),
  row("1.74", { sph: "-8.00", cyl: "-2.00", costPrice: "1700" }),
  row("1.74", { sph: "-10.00", cyl: "-2.00", costPrice: "1700" }),
  row("1.74", { sph: "-15.00", cyl: "0.00", costPrice: "1900" }),
  row("1.74", { sph: "-12.00", cyl: "-2.00", costPrice: "1900" }),
  row("1.74", { sph: "-6.00", cyl: "-4.00", costPrice: "2200" }),
  row("1.74", { sph: "-8.00", cyl: "-4.00", costPrice: "2200" }),
  row("1.74", { sph: "-10.00", cyl: "-4.00", costPrice: "2200" }),
  row("1.74", { sph: "-16.00", cyl: "0.00", costPrice: "3400" }),
  row("1.74", { sph: "-14.00", cyl: "-2.00", costPrice: "3400" }),
  row("1.74", { sph: "-20.00", cyl: "-2.00", costPrice: "3400" }),
  row("1.74", { sph: "-12.00", cyl: "-4.00", costPrice: "3400" }),
  row("1.74", { sph: "-20.00", cyl: "-4.00", costPrice: "3400" }),
];

async function main() {
  console.log(`Refreshing ${bluGuardRows.length} BLU-GUARD Single Vision products...`);

  const removed = await prisma.singleVisionLens.deleteMany({
    where: {
      brand: BLU_GUARD_META.brand,
      coating: BLU_GUARD_META.coating,
    },
  });
  console.log(`Removed ${removed.count} existing BLU-GUARD rows.`);

  const result = await prisma.singleVisionLens.createMany({
    data: bluGuardRows,
  });

  console.log(`Inserted ${result.count} rows.`);

  const total = await prisma.singleVisionLens.count({
    where: { brand: BLU_GUARD_META.brand },
  });
  console.log(`BLU-GUARD catalog count: ${total}`);
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
