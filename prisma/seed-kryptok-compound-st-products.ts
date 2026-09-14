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

type ProductCosts = { hcKt?: string; brcKt?: string; pgHcKt?: string };

type CompoundCardSpec = {
  sph: number;
  cyl: number;
  axis: number;
  costs: ProductCosts;
};

/** ST.AXIS compound — + → 180, − → 90 */
const ST_AXIS_COMPOUND_CARDS: CompoundCardSpec[] = [
  { sph: 2, cyl: 1, axis: 180, costs: { hcKt: "60", brcKt: "105", pgHcKt: "125" } },
  { sph: 3, cyl: 1, axis: 180, costs: { hcKt: "75", brcKt: "135", pgHcKt: "170" } },
  { sph: 2, cyl: 2, axis: 180, costs: { hcKt: "75", brcKt: "135", pgHcKt: "170" } },
  { sph: 3, cyl: 2, axis: 180, costs: { hcKt: "88" } },
  { sph: 4, cyl: 1, axis: 180, costs: { hcKt: "177" } },
  { sph: -2, cyl: -1, axis: 90, costs: { hcKt: "65", brcKt: "115", pgHcKt: "140" } },
  { sph: -3, cyl: -1, axis: 90, costs: { hcKt: "80", brcKt: "145", pgHcKt: "190" } },
  { sph: -2, cyl: -2, axis: 90, costs: { hcKt: "100", brcKt: "145", pgHcKt: "190" } },
  { sph: -4, cyl: -1, axis: 90, costs: { hcKt: "137" } },
  { sph: -5, cyl: -1, axis: 90, costs: { hcKt: "157" } },
  { sph: -2, cyl: -3, axis: 90, costs: { hcKt: "157" } },
  { sph: -3, cyl: -2, axis: 90, costs: { hcKt: "97" } },
  { sph: -2, cyl: -4, axis: 90, costs: { hcKt: "177" } },
];

function formatPower(value: number): string {
  return value.toFixed(2);
}

function stCardDeleteWhere(card: CompoundCardSpec) {
  return {
    category: { in: [...PRODUCT_CATEGORIES], mode: "insensitive" as const },
    brand: null,
    coating: { equals: "HC", mode: "insensitive" as const },
    sph: formatPower(card.sph),
    cyl: formatPower(card.cyl),
    axis: card.axis,
  };
}

function buildRows(meta: ProductMeta, costKey: keyof ProductCosts): KryptokSeedRow[] {
  const rows: KryptokSeedRow[] = [];
  for (const card of ST_AXIS_COMPOUND_CARDS) {
    const cost = card.costs[costKey];
    if (!cost) continue;
    const pricing = withSellingPrice(cost);
    rows.push({
      ...meta,
      sph: formatPower(card.sph),
      cyl: formatPower(card.cyl),
      axis: card.axis,
      add: DEFAULT_ADD,
      ...pricing,
    });
  }
  return rows;
}

async function main() {
  console.log("Seeding Kryptok ST.AXIS compound products only...");

  const deleted = await prisma.kryptokLens.deleteMany({
    where: { OR: ST_AXIS_COMPOUND_CARDS.map(stCardDeleteWhere) },
  });
  console.log(`Removed ${deleted.count} existing ST.AXIS compound row(s).`);

  const allRows = [
    ...buildRows(HC_KT_META, "hcKt"),
    ...buildRows(BRC_KT_META, "brcKt"),
    ...buildRows(PG_HC_KT_META, "pgHcKt"),
  ];

  const created = await prisma.kryptokLens.createMany({
    data: allRows.map((entry) => ({ ...entry, quantity: 0 })),
  });
  console.log(`Inserted ${created.count} ST.AXIS compound row(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
