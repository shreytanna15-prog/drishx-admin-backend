import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { withSellingPrice } from "./single-vision-seed-pricing";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

type ProductMeta = {
  category: string;
  brand: null;
  coating: "HC";
};

type KryptokSeedRow = ProductMeta & {
  sph: string;
  cyl: string;
  axis: number;
  add: string;
  costPrice: string;
  price: string;
};

const HC_KT_META: ProductMeta = { category: "HC KT", brand: null, coating: "HC" };
const BRC_KT_META: ProductMeta = { category: "BRC KT", brand: null, coating: "HC" };
const PG_HC_KT_META: ProductMeta = { category: "PG HC KT", brand: null, coating: "HC" };

const PRODUCT_CATEGORIES = ["HC KT", "BRC KT", "PG HC KT"] as const;
const DEFAULT_ADD = "1.00";
const SPL_AXIS_VALUES = [45, 135, -45, -135] as const;

type ProductCosts = { hcKt?: string; brcKt?: string; pgHcKt?: string };

type CompoundCardSpec = {
  label: string;
  sph: number;
  cyl: number;
  costs: ProductCosts;
};

/**
 * SPL.AXIS compound — price sheet SPECIAL Axis table.
 * +CYL → axis 45 and 135; −CYL → axis −45 and −135 (two DB rows per combo).
 */
const SPL_AXIS_COMPOUND_CARDS: CompoundCardSpec[] = [
  {
    label: "SPL +2/+1",
    sph: 2,
    cyl: 1,
    costs: { hcKt: "72", brcKt: "155", pgHcKt: "155" },
  },
  {
    label: "SPL +3/+1",
    sph: 3,
    cyl: 1,
    costs: { hcKt: "87", brcKt: "185", pgHcKt: "205" },
  },
  {
    label: "SPL +2/+2",
    sph: 2,
    cyl: 2,
    costs: { hcKt: "87", brcKt: "185", pgHcKt: "205" },
  },
  {
    label: "SPL -2/-1",
    sph: -2,
    cyl: -1,
    costs: { hcKt: "82", brcKt: "165", pgHcKt: "175" },
  },
  {
    label: "SPL -3/-1",
    sph: -3,
    cyl: -1,
    costs: { hcKt: "97", pgHcKt: "225" },
  },
  {
    label: "SPL -2/-2",
    sph: -2,
    cyl: -2,
    costs: { hcKt: "97", pgHcKt: "225" },
  },
  {
    label: "SPL -3/-2",
    sph: -3,
    cyl: -2,
    costs: { hcKt: "107" },
  },
];

function formatPower(value: number): string {
  return value.toFixed(2);
}

/** +CYL → 45 & 135; −CYL → −45 & −135 */
function splAxesForCyl(cyl: number): number[] {
  return cyl > 0 ? [45, 135] : [-45, -135];
}

function splCardDeleteClauses(card: CompoundCardSpec) {
  return splAxesForCyl(card.cyl).map((axis) => ({
    category: { in: [...PRODUCT_CATEGORIES], mode: "insensitive" as const },
    brand: null,
    coating: { equals: "HC", mode: "insensitive" as const },
    sph: formatPower(card.sph),
    cyl: formatPower(card.cyl),
    axis,
  }));
}

function expandSplCompound(
  meta: ProductMeta,
  card: CompoundCardSpec,
  costPrice: string
): KryptokSeedRow[] {
  const pricing = withSellingPrice(costPrice);

  return splAxesForCyl(card.cyl).map((axis) => ({
    ...meta,
    sph: formatPower(card.sph),
    cyl: formatPower(card.cyl),
    axis,
    add: DEFAULT_ADD,
    ...pricing,
  }));
}

function buildProductRows(
  meta: ProductMeta,
  costKey: keyof ProductCosts
): KryptokSeedRow[] {
  const rows: KryptokSeedRow[] = [];

  for (const card of SPL_AXIS_COMPOUND_CARDS) {
    const cost = card.costs[costKey];
    if (!cost) {
      continue;
    }
    rows.push(...expandSplCompound(meta, card, cost));
  }

  return rows;
}

const HC_KT_ROWS = buildProductRows(HC_KT_META, "hcKt");
const BRC_KT_ROWS = buildProductRows(BRC_KT_META, "brcKt");
const PG_HC_KT_ROWS = buildProductRows(PG_HC_KT_META, "pgHcKt");
const ALL_ROWS = [...HC_KT_ROWS, ...BRC_KT_ROWS, ...PG_HC_KT_ROWS];

async function main() {
  console.log("Seeding Kryptok SPL.AXIS compound products only (HC KT, BRC KT, PG HC KT)...");

  const deleteClauses = SPL_AXIS_COMPOUND_CARDS.flatMap(splCardDeleteClauses);

  const deleted = await prisma.kryptokLens.deleteMany({
    where: { OR: deleteClauses },
  });

  console.log(`Removed ${deleted.count} existing SPL.AXIS compound row(s).`);

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

  console.log(`Inserted ${created.count} SPL.AXIS compound row(s).`);
  console.log(`  HC KT: ${HC_KT_ROWS.length}`);
  console.log(`  BRC KT: ${BRC_KT_ROWS.length}`);
  console.log(`  PG HC KT: ${PG_HC_KT_ROWS.length}`);
  console.log(`  Axis values used: ${SPL_AXIS_VALUES.join(", ")}`);
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
