import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

type KryptokSeedRow = {
  category: string;
  brand: string;
  coating: string;
  sph: string;
  cyl: string | null;
  axis: number | null;
  add: string;
  price: string;
};

const PG_BLUE_CUT_META = {
  category: "PG BLUE CUT KT",
  brand: "ELITE",
  coating: "BLUE",
} as const;

const PG_HC_META = {
  category: "PG KT",
  brand: "SUPER SHIELD",
  coating: "HC",
} as const;

function row(
  meta: { category: string; brand: string; coating: string },
  entry: Omit<KryptokSeedRow, "category" | "brand" | "coating">
): KryptokSeedRow {
  return { ...meta, ...entry };
}

function expandAxes(
  meta: { category: string; brand: string; coating: string },
  entries: Array<{
    sph: string;
    cyl: string | null;
    axes: number[];
    add?: string;
    price: string;
  }>
): KryptokSeedRow[] {
  const rows: KryptokSeedRow[] = [];
  for (const entry of entries) {
    for (const axis of entry.axes) {
      rows.push(
        row(meta, {
          sph: entry.sph,
          cyl: entry.cyl,
          axis,
          add: entry.add ?? "1.00",
          price: entry.price,
        })
      );
    }
  }
  return rows;
}

/** PG BLUE CUT KT — ELITE / BLUE (price sheet image 1). */
const pgBlueCutKtRows: KryptokSeedRow[] = [
  row(PG_BLUE_CUT_META, { sph: "3.00", cyl: null, axis: null, add: "1.00", price: "140" }),
  row(PG_BLUE_CUT_META, { sph: "-2.00", cyl: null, axis: null, add: "1.00", price: "170" }),
  row(PG_BLUE_CUT_META, { sph: "-3.00", cyl: null, axis: null, add: "1.00", price: "220" }),
  ...expandAxes(PG_BLUE_CUT_META, [
    { sph: "2.00", cyl: "-2.00", axes: [180, 90], price: "210" },
  ]),
];

/** PG KT / HC — SUPER SHIELD (price sheet image 2, HC column). */
const pgHcKtRows: KryptokSeedRow[] = [
  row(PG_HC_META, { sph: "0.00", cyl: null, axis: null, add: "4.00", price: "100" }),
  row(PG_HC_META, { sph: "3.00", cyl: null, axis: null, add: "1.00", price: "120" }),
  row(PG_HC_META, { sph: "-2.00", cyl: null, axis: null, add: "1.00", price: "150" }),
  row(PG_HC_META, { sph: "-3.00", cyl: null, axis: null, add: "1.00", price: "210" }),
  row(PG_HC_META, { sph: "-4.00", cyl: null, axis: null, add: "1.00", price: "260" }),
  ...expandAxes(PG_HC_META, [
    { sph: "2.00", cyl: "-2.00", axes: [180, 90], price: "110" },
    { sph: "3.00", cyl: "-3.00", axes: [180, 90], price: "155" },
    { sph: "4.00", cyl: "-4.00", axes: [180, 90], price: "155" },
    { sph: "2.00", cyl: "-2.00", axes: [90, 180], price: "130" },
    { sph: "3.00", cyl: "-3.00", axes: [90, 180], price: "170" },
    { sph: "4.00", cyl: "-4.00", axes: [90, 180], price: "170" },
    { sph: "2.00", cyl: "-2.00", axes: [45, 135], price: "145" },
    { sph: "3.00", cyl: "-3.00", axes: [45, 135], price: "200" },
    { sph: "4.00", cyl: "-4.00", axes: [45, 135], price: "200" },
  ]),
  row(PG_HC_META, { sph: "2.00", cyl: "1.00", axis: 180, add: "1.00", price: "125" }),
  row(PG_HC_META, { sph: "3.00", cyl: "1.00", axis: 180, add: "1.00", price: "170" }),
  row(PG_HC_META, { sph: "2.00", cyl: "2.00", axis: 180, add: "1.00", price: "170" }),
  row(PG_HC_META, { sph: "-2.00", cyl: "-1.00", axis: 90, add: "1.00", price: "140" }),
  row(PG_HC_META, { sph: "-3.00", cyl: "-1.00", axis: 90, add: "1.00", price: "190" }),
  row(PG_HC_META, { sph: "-2.00", cyl: "-2.00", axis: 90, add: "1.00", price: "190" }),
  row(PG_HC_META, { sph: "2.00", cyl: "1.00", axis: 90, add: "1.00", price: "155" }),
  row(PG_HC_META, { sph: "3.00", cyl: "1.00", axis: 90, add: "1.00", price: "205" }),
  row(PG_HC_META, { sph: "2.00", cyl: "2.00", axis: 90, add: "1.00", price: "205" }),
  row(PG_HC_META, { sph: "-2.00", cyl: "-1.00", axis: 180, add: "1.00", price: "175" }),
  row(PG_HC_META, { sph: "2.00", cyl: "1.00", axis: 45, add: "1.00", price: "155" }),
  row(PG_HC_META, { sph: "2.00", cyl: "1.00", axis: 135, add: "1.00", price: "155" }),
  row(PG_HC_META, { sph: "3.00", cyl: "1.00", axis: 45, add: "1.00", price: "205" }),
  row(PG_HC_META, { sph: "3.00", cyl: "1.00", axis: 135, add: "1.00", price: "205" }),
  row(PG_HC_META, { sph: "2.00", cyl: "2.00", axis: 45, add: "1.00", price: "205" }),
  row(PG_HC_META, { sph: "2.00", cyl: "2.00", axis: 135, add: "1.00", price: "205" }),
  row(PG_HC_META, { sph: "-2.00", cyl: "-1.00", axis: 45, add: "1.00", price: "175" }),
  row(PG_HC_META, { sph: "-2.00", cyl: "-1.00", axis: 135, add: "1.00", price: "175" }),
  row(PG_HC_META, { sph: "-3.00", cyl: "-1.00", axis: 45, add: "1.00", price: "225" }),
  row(PG_HC_META, { sph: "-3.00", cyl: "-1.00", axis: 135, add: "1.00", price: "225" }),
  row(PG_HC_META, { sph: "-2.00", cyl: "-2.00", axis: 45, add: "1.00", price: "225" }),
  row(PG_HC_META, { sph: "-2.00", cyl: "-2.00", axis: 135, add: "1.00", price: "225" }),
  row(PG_HC_META, { sph: "-2.00", cyl: "-2.00", axis: 90, add: "1.00", price: "190" }),
  row(PG_HC_META, { sph: "-3.00", cyl: "-3.00", axis: 90, add: "1.00", price: "240" }),
  row(PG_HC_META, { sph: "-4.00", cyl: "-4.00", axis: 90, add: "1.00", price: "240" }),
];

const ALL_ROWS = [...pgBlueCutKtRows, ...pgHcKtRows];

async function main() {
  console.log("Seeding Kryptok PG BLUE CUT KT + PG HC KT products...");

  const deleted = await prisma.kryptokLens.deleteMany({
    where: {
      OR: [
        {
          category: { equals: PG_BLUE_CUT_META.category, mode: "insensitive" },
          brand: { equals: PG_BLUE_CUT_META.brand, mode: "insensitive" },
          coating: { equals: PG_BLUE_CUT_META.coating, mode: "insensitive" },
        },
        {
          category: { equals: PG_HC_META.category, mode: "insensitive" },
          brand: { equals: PG_HC_META.brand, mode: "insensitive" },
          coating: { equals: PG_HC_META.coating, mode: "insensitive" },
        },
      ],
    },
  });

  console.log(`Removed ${deleted.count} existing PG BLUE CUT / PG HC rows.`);

  const created = await prisma.kryptokLens.createMany({
    data: ALL_ROWS.map((entry) => ({
      category: entry.category,
      brand: entry.brand,
      coating: entry.coating,
      sph: entry.sph,
      cyl: entry.cyl,
      axis: entry.axis,
      add: entry.add,
      price: entry.price,
      quantity: 0,
    })),
  });

  console.log(`Inserted ${created.count} Kryptok rows.`);
  console.log(`  PG BLUE CUT KT (${PG_BLUE_CUT_META.brand} / ${PG_BLUE_CUT_META.coating}): ${pgBlueCutKtRows.length}`);
  console.log(`  PG HC KT (${PG_HC_META.brand} / ${PG_HC_META.coating}): ${pgHcKtRows.length}`);
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
