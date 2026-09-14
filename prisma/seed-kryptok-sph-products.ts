import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { withSellingPrice } from "./single-vision-seed-pricing";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

type ProductMeta = {
  category: string;
  brand: null;
  coating: "HC";
};

type KryptokSeedRow = ProductMeta & {
  sph: string;
  cyl: null;
  axis: null;
  add: string;
  costPrice: string;
  price: string;
};

const HC_KT_META: ProductMeta = {
  category: "HC KT",
  brand: null,
  coating: "HC",
};

const BRC_KT_META: ProductMeta = {
  category: "BRC KT",
  brand: null,
  coating: "HC",
};

const PG_HC_KT_META: ProductMeta = {
  category: "PG HC KT",
  brand: null,
  coating: "HC",
};

/** `/+` on the price sheet marks a bifocal line; one catalog row per SPH card. */
const DEFAULT_ADD = "1.00";

function formatPower(value: number): string {
  return value.toFixed(2);
}

function expandSphCards(
  meta: ProductMeta,
  sphValues: number[],
  costPrice: string
): KryptokSeedRow[] {
  const pricing = withSellingPrice(costPrice);

  return sphValues.map((sph) => ({
    ...meta,
    sph: formatPower(sph),
    cyl: null,
    axis: null,
    add: DEFAULT_ADD,
    ...pricing,
  }));
}

type SphCardSpec = {
  label: string;
  sphValues: number[];
  costs: { hcKt: string; brcKt: string; pgHcKt: string };
};

/**
 * Kryptok SPH-only price sheet (printed doc + handwritten explanation).
 * +3/+  → SPH +3.00 (bifocal /+ line, no ADD power range in catalog).
 * +-4/+ → SPH +4.00 and -4.00 as separate cards.
 */
const SPH_ONLY_CARDS: SphCardSpec[] = [
  {
    label: "+3/+",
    sphValues: [3],
    costs: { hcKt: "40", brcKt: "85", pgHcKt: "100" },
  },
  {
    label: "-2/+",
    sphValues: [-2],
    costs: { hcKt: "48", brcKt: "105", pgHcKt: "120" },
  },
  {
    label: "-3/+",
    sphValues: [-3],
    costs: { hcKt: "58", brcKt: "135", pgHcKt: "150" },
  },
  {
    label: "+-4/+",
    sphValues: [4, -4],
    costs: { hcKt: "86", brcKt: "160", pgHcKt: "210" },
  },
  {
    label: "+-5/+",
    sphValues: [5, -5],
    costs: { hcKt: "112", brcKt: "180", pgHcKt: "260" },
  },
  {
    label: "+-6/+",
    sphValues: [6, -6],
    costs: { hcKt: "172", brcKt: "180", pgHcKt: "260" },
  },
];

function buildProductRows(
  meta: ProductMeta,
  costKey: keyof SphCardSpec["costs"]
): KryptokSeedRow[] {
  const rows: KryptokSeedRow[] = [];

  for (const card of SPH_ONLY_CARDS) {
    rows.push(...expandSphCards(meta, card.sphValues, card.costs[costKey]));
  }

  return rows;
}

const HC_KT_ROWS = buildProductRows(HC_KT_META, "hcKt");
const BRC_KT_ROWS = buildProductRows(BRC_KT_META, "brcKt");
const PG_HC_KT_ROWS = buildProductRows(PG_HC_KT_META, "pgHcKt");
const ALL_ROWS = [...HC_KT_ROWS, ...BRC_KT_ROWS, ...PG_HC_KT_ROWS];

const EXPECTED_ROWS_PER_PRODUCT = SPH_ONLY_CARDS.reduce(
  (sum, card) => sum + card.sphValues.length,
  0
);

const PRODUCT_CATEGORIES = ["HC KT", "BRC KT", "PG HC KT"] as const;

const LEGACY_SPH_ONLY_DELETE = [
  { category: "WHITE KT", brand: "OCEAN", coating: "HC" },
  { category: "BLUE CUT KT HMC", brand: "PROTECTOR", coating: "HMC" },
  { category: "PG KT", brand: "SUPER SHIELD", coating: "HC" },
] as const;

async function main() {
  console.log("Seeding Kryptok SPH-only products (HC KT, BRC KT, PG HC KT)...");

  const deleted = await prisma.kryptokLens.deleteMany({
    where: {
      cyl: null,
      axis: null,
      OR: [
        {
          category: { in: [...PRODUCT_CATEGORIES], mode: "insensitive" },
          brand: null,
          coating: { equals: "HC", mode: "insensitive" },
        },
        {
          category: { in: [...PRODUCT_CATEGORIES], mode: "insensitive" },
          brand: null,
          coating: null,
        },
        ...LEGACY_SPH_ONLY_DELETE.map((legacy) => ({
          category: { equals: legacy.category, mode: "insensitive" as const },
          brand: { equals: legacy.brand, mode: "insensitive" as const },
          coating: { equals: legacy.coating, mode: "insensitive" as const },
        })),
      ],
    },
  });

  console.log(`Removed ${deleted.count} existing SPH-only rows for HC KT / BRC KT / PG HC KT.`);

  const created = await prisma.kryptokLens.createMany({
    data: ALL_ROWS.map((entry) => ({
      category: entry.category,
      brand: entry.brand,
      coating: entry.coating,
      sph: entry.sph,
      cyl: entry.cyl,
      axis: entry.axis,
      add: entry.add,
      costPrice: entry.costPrice,
      price: entry.price,
      quantity: 0,
    })),
  });

  console.log(`Inserted ${created.count} Kryptok SPH-only rows.`);
  console.log(`  HC KT: ${HC_KT_ROWS.length} (expected ${EXPECTED_ROWS_PER_PRODUCT})`);
  console.log(`  BRC KT: ${BRC_KT_ROWS.length} (expected ${EXPECTED_ROWS_PER_PRODUCT})`);
  console.log(`  PG HC KT: ${PG_HC_KT_ROWS.length} (expected ${EXPECTED_ROWS_PER_PRODUCT})`);

  for (const card of SPH_ONLY_CARDS) {
    console.log(`  ${card.label}: ${card.sphValues.length} row(s) per product`);
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
