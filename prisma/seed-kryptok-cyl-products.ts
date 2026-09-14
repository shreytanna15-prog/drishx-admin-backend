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

const PRODUCT_METAS = [HC_KT_META, BRC_KT_META, PG_HC_KT_META] as const;
const PRODUCT_CATEGORIES = ["HC KT", "BRC KT", "PG HC KT"] as const;

const DEFAULT_SPH = "0.00";
const DEFAULT_ADD = "1.00";

type AxisType = "ST" | "REV" | "SPL";

const AXIS_BY_TYPE: Record<Exclude<AxisType, "SPL">, { positive: number; negative: number }> = {
  ST: { positive: 180, negative: 90 },
  REV: { positive: 90, negative: 180 },
};

/** +CYL → 45 & 135; −CYL → −45 & −135 (two rows per CYL sign). */
function splAxesForCyl(cyl: number): number[] {
  return cyl > 0 ? [45, 135] : [-45, -135];
}

type ProductCosts = {
  hcKt?: string;
  brcKt?: string;
  pgHcKt?: string;
};

type CylCardSpec = {
  label: string;
  axisType: AxisType;
  cylMagnitude: number;
  costs: ProductCosts;
};

/**
 * CYL-only price sheet (printed doc + handwritten explanation).
 * +-N → CYL +N with positive axis, CYL -N with negative axis (per axis type).
 */
const CYL_ONLY_CARDS: CylCardSpec[] = [
  // ST.AXIS — 180 / 90
  {
    label: "+-2/+ ST.AXIS",
    axisType: "ST",
    cylMagnitude: 2,
    costs: { hcKt: "47", brcKt: "85", pgHcKt: "110" },
  },
  {
    label: "+-3/+ ST.AXIS",
    axisType: "ST",
    cylMagnitude: 3,
    costs: { hcKt: "62", brcKt: "115", pgHcKt: "155" },
  },
  {
    label: "+-4/+ ST.AXIS",
    axisType: "ST",
    cylMagnitude: 4,
    costs: { hcKt: "100", brcKt: "145" },
  },
  // REV.AXIS — 90 / 180
  {
    label: "+-2/+ REV.AXIS",
    axisType: "REV",
    cylMagnitude: 2,
    costs: { hcKt: "52", brcKt: "100", pgHcKt: "130" },
  },
  {
    label: "+-3/+ REV.AXIS",
    axisType: "REV",
    cylMagnitude: 3,
    costs: { hcKt: "67", brcKt: "130", pgHcKt: "170" },
  },
  {
    label: "+-4/+ REV.AXIS",
    axisType: "REV",
    cylMagnitude: 4,
    costs: { hcKt: "110" },
  },
  // SPL.AXIS — 45 / 135
  {
    label: "+-2/+ SPL.AXIS",
    axisType: "SPL",
    cylMagnitude: 2,
    costs: { hcKt: "56", brcKt: "115", pgHcKt: "145" },
  },
  {
    label: "+-3/+ SPL.AXIS",
    axisType: "SPL",
    cylMagnitude: 3,
    costs: { hcKt: "71", brcKt: "175", pgHcKt: "200" },
  },
  {
    label: "+-4/+ SPL.AXIS",
    axisType: "SPL",
    cylMagnitude: 4,
    costs: { hcKt: "111" },
  },
];

function formatPower(value: number): string {
  return value.toFixed(2);
}

function expandCylCard(
  meta: ProductMeta,
  card: CylCardSpec,
  costPrice: string
): KryptokSeedRow[] {
  const pricing = withSellingPrice(costPrice);
  const magnitude = card.cylMagnitude;
  const rows: KryptokSeedRow[] = [];

  if (card.axisType === "SPL") {
    for (const cyl of [magnitude, -magnitude]) {
      for (const axis of splAxesForCyl(cyl)) {
        rows.push({
          ...meta,
          sph: DEFAULT_SPH,
          cyl: formatPower(cyl),
          axis,
          add: DEFAULT_ADD,
          ...pricing,
        });
      }
    }
    return rows;
  }

  const axes = AXIS_BY_TYPE[card.axisType];
  return [
    {
      ...meta,
      sph: DEFAULT_SPH,
      cyl: formatPower(magnitude),
      axis: axes.positive,
      add: DEFAULT_ADD,
      ...pricing,
    },
    {
      ...meta,
      sph: DEFAULT_SPH,
      cyl: formatPower(-magnitude),
      axis: axes.negative,
      add: DEFAULT_ADD,
      ...pricing,
    },
  ];
}

function buildProductRows(
  meta: ProductMeta,
  costKey: keyof ProductCosts
): KryptokSeedRow[] {
  const rows: KryptokSeedRow[] = [];

  for (const card of CYL_ONLY_CARDS) {
    const cost = card.costs[costKey];
    if (!cost) {
      continue;
    }
    rows.push(...expandCylCard(meta, card, cost));
  }

  return rows;
}

const HC_KT_ROWS = buildProductRows(HC_KT_META, "hcKt");
const BRC_KT_ROWS = buildProductRows(BRC_KT_META, "brcKt");
const PG_HC_KT_ROWS = buildProductRows(PG_HC_KT_META, "pgHcKt");
const ALL_ROWS = [...HC_KT_ROWS, ...BRC_KT_ROWS, ...PG_HC_KT_ROWS];

async function main() {
  console.log("Seeding Kryptok CYL-only products (HC KT, BRC KT, PG HC KT)...");

  const deleted = await prisma.kryptokLens.deleteMany({
    where: {
      category: { in: [...PRODUCT_CATEGORIES], mode: "insensitive" },
      brand: null,
      coating: { equals: "HC", mode: "insensitive" },
      sph: DEFAULT_SPH,
      cyl: { not: null },
      axis: { not: null },
    },
  });

  console.log(`Removed ${deleted.count} existing CYL-only rows for HC KT / BRC KT / PG HC KT.`);

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

  console.log(`Inserted ${created.count} Kryptok CYL-only rows.`);
  console.log(`  HC KT: ${HC_KT_ROWS.length}`);
  console.log(`  BRC KT: ${BRC_KT_ROWS.length}`);
  console.log(`  PG HC KT: ${PG_HC_KT_ROWS.length}`);

  for (const card of CYL_ONLY_CARDS) {
    const products = (["hcKt", "brcKt", "pgHcKt"] as const).filter((key) => card.costs[key]);
    const rowsPerProduct = card.axisType === "SPL" ? 4 : 2;
    console.log(`  ${card.label}: ${products.length} product(s) × ${rowsPerProduct} rows`);
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
