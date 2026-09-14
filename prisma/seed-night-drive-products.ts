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

const NIGHT_DRIVE_PURPLE_META: ProductMeta = {
  category: "BLUE CUT SV",
  brand: "NIGHT DRIVE",
  item: "NIGHT DRIVE",
  coating: "PURPLE",
};

const NIGHT_DRIVE_MAGENTA_META: ProductMeta = {
  category: "BLUE CUT SV",
  brand: "NIGHT DRIVE",
  item: "NIGHT DRIVE",
  coating: "MAGENTA NIGHT DRIVE",
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

function crossRow(
  meta: ProductMeta,
  index: string,
  crossPower: string,
  costPrice: string
): SingleVisionSeedRow {
  const pricing = withSellingPrice(costPrice);
  return {
    ...meta,
    index,
    sph: null,
    cyl: null,
    crossPower,
    ...pricing,
    quantity: 0,
  };
}

/** Night Drive Single Vision Blue Cut — price sheet (1.56 + 1.67 only). */
const nightDriveRows: SingleVisionSeedRow[] = [
  // NIGHT DRIVE · index 1.56 · PURPLE
  row(NIGHT_DRIVE_PURPLE_META, "1.56", { sph: "-6.00", cyl: "-2.00", costPrice: "300" }),
  row(NIGHT_DRIVE_PURPLE_META, "1.56", { sph: "-8.00", cyl: "-2.00", costPrice: "300" }),
  row(NIGHT_DRIVE_PURPLE_META, "1.56", { sph: "-6.00", cyl: "-4.00", costPrice: "400" }),
  row(NIGHT_DRIVE_PURPLE_META, "1.56", { sph: "4.00", cyl: "0.00", costPrice: "330" }),
  row(NIGHT_DRIVE_PURPLE_META, "1.56", { sph: "3.00", cyl: "1.00", costPrice: "330" }),
  crossRow(NIGHT_DRIVE_PURPLE_META, "1.56", "-2.00", "360"),
  crossRow(NIGHT_DRIVE_PURPLE_META, "1.56", "-4.00", "490"),

  // NIGHT DRIVE · index 1.67 · MAGENTA NIGHT DRIVE
  row(NIGHT_DRIVE_MAGENTA_META, "1.67", { sph: "-6.00", cyl: "-2.00", costPrice: "550" }),
  row(NIGHT_DRIVE_MAGENTA_META, "1.67", { sph: "-8.00", cyl: "-2.00", costPrice: "550" }),
  row(NIGHT_DRIVE_MAGENTA_META, "1.67", { sph: "-10.00", cyl: "-2.00", costPrice: "550" }),
  row(NIGHT_DRIVE_MAGENTA_META, "1.67", { sph: "-15.00", cyl: "0.00", costPrice: "600" }),
  row(NIGHT_DRIVE_MAGENTA_META, "1.67", { sph: "-12.00", cyl: "-2.00", costPrice: "600" }),
  row(NIGHT_DRIVE_MAGENTA_META, "1.67", { sph: "-6.00", cyl: "-4.00", costPrice: "850" }),
  row(NIGHT_DRIVE_MAGENTA_META, "1.67", { sph: "-8.00", cyl: "-4.00", costPrice: "850" }),
  row(NIGHT_DRIVE_MAGENTA_META, "1.67", { sph: "-10.00", cyl: "-4.00", costPrice: "850" }),
];

const LEGACY_NIGHT_DRIVE_BRANDS = [
  "NIGHT DRIVE - GLARE PROTECTION",
  "NIGHT DRIVE SUPER",
] as const;

async function main() {
  console.log(`Refreshing ${nightDriveRows.length} Night Drive Single Vision products...`);

  const removed = await prisma.singleVisionLens.deleteMany({
    where: {
      OR: [
        { brand: { in: [...LEGACY_NIGHT_DRIVE_BRANDS] } },
        {
          brand: NIGHT_DRIVE_PURPLE_META.brand,
          item: NIGHT_DRIVE_PURPLE_META.item,
          coating: { in: [NIGHT_DRIVE_PURPLE_META.coating, NIGHT_DRIVE_MAGENTA_META.coating] },
        },
      ],
    },
  });
  console.log(`Removed ${removed.count} existing Night Drive rows.`);

  const result = await prisma.singleVisionLens.createMany({
    data: nightDriveRows,
  });

  console.log(`Inserted ${result.count} rows.`);

  const purpleCount = await prisma.singleVisionLens.count({
    where: {
      brand: NIGHT_DRIVE_PURPLE_META.brand,
      coating: NIGHT_DRIVE_PURPLE_META.coating,
      index: "1.56",
    },
  });
  const magentaCount = await prisma.singleVisionLens.count({
    where: {
      brand: NIGHT_DRIVE_MAGENTA_META.brand,
      coating: NIGHT_DRIVE_MAGENTA_META.coating,
      index: "1.67",
    },
  });
  console.log(`NIGHT DRIVE (1.56 PURPLE) count: ${purpleCount}`);
  console.log(`NIGHT DRIVE (1.67 MAGENTA NIGHT DRIVE) count: ${magentaCount}`);
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
