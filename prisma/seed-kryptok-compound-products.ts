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
  cyl: string;
  axis: number;
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

const PRODUCT_CATEGORIES = ["HC KT", "BRC KT", "PG HC KT"] as const;
const DEFAULT_ADD = "1.00";

type ProductCosts = {
  hcKt?: string;
  brcKt?: string;
  pgHcKt?: string;
};

type CompoundCardSpec = {
  label: string;
  sph: number;
  cyl: number;
  axis: number;
  costs: ProductCosts;
};

/** REV.AXIS compound only — + → 90, − → 180 */
const REV_AXIS_COMPOUND_CARDS: CompoundCardSpec[] = [
  {
    label: "REV +2/+1",
    sph: 2,
    cyl: 1,
    axis: 90,
    costs: { hcKt: "67", brcKt: "150", pgHcKt: "155" },
  },
  {
    label: "REV +3/+1",
    sph: 3,
    cyl: 1,
    axis: 90,
    costs: { hcKt: "82", brcKt: "180", pgHcKt: "205" },
  },
  {
    label: "REV +2/+2",
    sph: 2,
    cyl: 2,
    axis: 90,
    costs: { hcKt: "82", brcKt: "180", pgHcKt: "205" },
  },
  {
    label: "REV -2/-1",
    sph: -2,
    cyl: -1,
    axis: 180,
    costs: { hcKt: "77", brcKt: "160", pgHcKt: "175" },
  },
  {
    label: "REV -3/-1",
    sph: -3,
    cyl: -1,
    axis: 180,
    costs: { hcKt: "92" },
  },
  {
    label: "REV -2/-2",
    sph: -2,
    cyl: -2,
    axis: 180,
    costs: { hcKt: "92" },
  },
  {
    label: "REV -3/-2",
    sph: -3,
    cyl: -2,
    axis: 180,
    costs: { hcKt: "107" },
  },
];

function formatPower(value: number): string {
  return value.toFixed(2);
}

function revCardDeleteWhere(card: CompoundCardSpec) {
  return {
    category: { in: [...PRODUCT_CATEGORIES], mode: "insensitive" as const },
    brand: null,
    coating: { equals: "HC", mode: "insensitive" as const },
    sph: formatPower(card.sph),
    cyl: formatPower(card.cyl),
    axis: card.axis,
  };
}

function compoundRow(
  meta: ProductMeta,
  card: CompoundCardSpec,
  costPrice: string
): KryptokSeedRow {
  const pricing = withSellingPrice(costPrice);

  return {
    ...meta,
    sph: formatPower(card.sph),
    cyl: formatPower(card.cyl),
    axis: card.axis,
    add: DEFAULT_ADD,
    ...pricing,
  };
}

function buildProductRows(
  meta: ProductMeta,
  costKey: keyof ProductCosts
): KryptokSeedRow[] {
  const rows: KryptokSeedRow[] = [];

  for (const card of REV_AXIS_COMPOUND_CARDS) {
    const cost = card.costs[costKey];
    if (!cost) {
      continue;
    }
    rows.push(compoundRow(meta, card, cost));
  }

  return rows;
}

const HC_KT_ROWS = buildProductRows(HC_KT_META, "hcKt");
const BRC_KT_ROWS = buildProductRows(BRC_KT_META, "brcKt");
const PG_HC_KT_ROWS = buildProductRows(PG_HC_KT_META, "pgHcKt");
const ALL_ROWS = [...HC_KT_ROWS, ...BRC_KT_ROWS, ...PG_HC_KT_ROWS];

async function main() {
  console.log("Seeding Kryptok REV.AXIS compound products only (HC KT, BRC KT, PG HC KT)...");

  const deleted = await prisma.kryptokLens.deleteMany({
    where: { OR: REV_AXIS_COMPOUND_CARDS.map(revCardDeleteWhere) },
  });

  console.log(`Removed ${deleted.count} existing REV.AXIS compound row(s).`);

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

  console.log(`Inserted ${created.count} REV.AXIS compound row(s).`);
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
