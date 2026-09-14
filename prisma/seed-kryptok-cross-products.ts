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
  item?: string | null;
  sph: string;
  cyl: string;
  axis: number;
  add: string;
  crossPower?: string | null;
  costPrice: string;
  price: string;
};

const KRYPTOK_CROSS_ITEM = "CROSS";

const HC_KT_META: ProductMeta = { category: "HC KT", brand: null, coating: "HC" };
const BRC_KT_META: ProductMeta = { category: "BRC KT", brand: null, coating: "HC" };
const PG_HC_KT_META: ProductMeta = { category: "PG HC KT", brand: null, coating: "HC" };

const PRODUCT_CATEGORIES = ["HC KT", "BRC KT", "PG HC KT"] as const;
const DEFAULT_ADD = "1.00";

type ProductCosts = { hcKt?: string; brcKt?: string; pgHcKt?: string };

type CrossCardSpec = {
  label: string;
  sph: number;
  cyl: number;
  axis: number;
  costs: ProductCosts;
};

/**
 * CROSS power sheet — +SPH / −CYL compound lines.
 * Image 1: ST.AXIS (axis 90). Image 2: REV.AXIS (axis 180) + SPL (−45/−135 for +1.75/−2).
 */
const CROSS_CARDS: CrossCardSpec[] = [
  // ST.AXIS — axis 90
  {
    label: "CROSS ST +1.75/-2",
    sph: 1.75,
    cyl: -2,
    axis: 90,
    costs: { hcKt: "74", brcKt: "150", pgHcKt: "190" },
  },
  {
    label: "CROSS ST +2.75/-3",
    sph: 2.75,
    cyl: -3,
    axis: 90,
    costs: { hcKt: "89", brcKt: "200", pgHcKt: "240" },
  },
  {
    label: "CROSS ST +3.75/-4",
    sph: 3.75,
    cyl: -4,
    axis: 90,
    costs: { hcKt: "152", brcKt: "200", pgHcKt: "240" },
  },
  // REV.AXIS — axis 180 (HC KT only on sheet)
  {
    label: "CROSS REV +1.75/-2",
    sph: 1.75,
    cyl: -2,
    axis: 180,
    costs: { hcKt: "102" },
  },
  {
    label: "CROSS REV +2.75/-3",
    sph: 2.75,
    cyl: -3,
    axis: 180,
    costs: { hcKt: "117" },
  },
  // SPL.AXIS — −CYL → −45 & −135 (+1.75/-2 only, HC KT only)
  {
    label: "CROSS SPL +1.75/-2 @ -45",
    sph: 1.75,
    cyl: -2,
    axis: -45,
    costs: { hcKt: "122" },
  },
  {
    label: "CROSS SPL +1.75/-2 @ -135",
    sph: 1.75,
    cyl: -2,
    axis: -135,
    costs: { hcKt: "122" },
  },
];

function formatPower(value: number): string {
  return value.toFixed(2);
}

function crossDeleteWhere(card: CrossCardSpec) {
  return {
    category: { in: [...PRODUCT_CATEGORIES], mode: "insensitive" as const },
    brand: null,
    coating: { equals: "HC", mode: "insensitive" as const },
    sph: formatPower(card.sph),
    cyl: formatPower(card.cyl),
    axis: card.axis,
  };
}

function buildProductRows(
  meta: ProductMeta,
  costKey: keyof ProductCosts
): KryptokSeedRow[] {
  const rows: KryptokSeedRow[] = [];

  for (const card of CROSS_CARDS) {
    const cost = card.costs[costKey];
    if (!cost) {
      continue;
    }
    const pricing = withSellingPrice(cost);
    rows.push({
      ...meta,
      item: KRYPTOK_CROSS_ITEM,
      sph: formatPower(card.sph),
      cyl: formatPower(card.cyl),
      crossPower: formatPower(card.cyl),
      axis: card.axis,
      add: DEFAULT_ADD,
      ...pricing,
    });
  }

  return rows;
}

const HC_KT_ROWS = buildProductRows(HC_KT_META, "hcKt");
const BRC_KT_ROWS = buildProductRows(BRC_KT_META, "brcKt");
const PG_HC_KT_ROWS = buildProductRows(PG_HC_KT_META, "pgHcKt");
const ALL_ROWS = [...HC_KT_ROWS, ...BRC_KT_ROWS, ...PG_HC_KT_ROWS];

async function main() {
  console.log("Seeding Kryptok CROSS products (HC KT, BRC KT, PG HC KT)...");

  const deleted = await prisma.kryptokLens.deleteMany({
    where: { OR: CROSS_CARDS.map(crossDeleteWhere) },
  });

  console.log(`Removed ${deleted.count} existing CROSS row(s).`);

  const created = await prisma.kryptokLens.createMany({
    data: ALL_ROWS.map((entry) => ({
      category: entry.category,
      brand: entry.brand,
      item: entry.item ?? null,
      coating: entry.coating,
      sph: entry.sph,
      cyl: entry.cyl,
      crossPower: entry.crossPower ?? null,
      axis: entry.axis,
      add: entry.add,
      costPrice: entry.costPrice,
      price: entry.price,
      quantity: 0,
    })),
  });

  console.log(`Inserted ${created.count} CROSS row(s).`);
  console.log(`  HC KT: ${HC_KT_ROWS.length}`);
  console.log(`  BRC KT: ${BRC_KT_ROWS.length}`);
  console.log(`  PG HC KT: ${PG_HC_KT_ROWS.length}`);
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
