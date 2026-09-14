import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { withSellingPrice } from "./single-vision-seed-pricing";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const CATEGORY = "BRC KT Blue";
const DEFAULT_ADD = "1.00";

type KryptokSeedRow = {
  category: string;
  brand: null;
  coating: string;
  sph: string;
  cyl: null;
  axis: null;
  add: string;
  costPrice: string;
  price: string;
};

type CoatingCosts = {
  green?: string;
  violet?: string;
};

type SphCardSpec = {
  label: string;
  sph: number;
  costs: CoatingCosts;
};

/** BRC KT Blue — SPH-only price sheet (GREEN / VIOLET coatings). */
const SPH_ONLY_CARDS: SphCardSpec[] = [
  {
    label: "+3/+",
    sph: 3,
    costs: { green: "65", violet: "80" },
  },
  {
    label: "-2/+",
    sph: -2,
    costs: { green: "85", violet: "100" },
  },
  {
    label: "-3/+",
    sph: -3,
    costs: { violet: "150" },
  },
];

const COATING_META = {
  green: { coating: "GREEN" },
  violet: { coating: "VIOLET" },
} as const;

function formatPower(value: number): string {
  return value.toFixed(2);
}

function buildRows(): KryptokSeedRow[] {
  const rows: KryptokSeedRow[] = [];

  for (const card of SPH_ONLY_CARDS) {
    for (const [key, meta] of Object.entries(COATING_META) as Array<
      [keyof CoatingCosts, (typeof COATING_META)[keyof typeof COATING_META]]
    >) {
      const cost = card.costs[key];
      if (!cost) {
        continue;
      }
      const pricing = withSellingPrice(cost);
      rows.push({
        category: CATEGORY,
        brand: null,
        coating: meta.coating,
        sph: formatPower(card.sph),
        cyl: null,
        axis: null,
        add: DEFAULT_ADD,
        ...pricing,
      });
    }
  }

  return rows;
}

const ALL_ROWS = buildRows();

async function main() {
  console.log(`Seeding Kryptok SPH-only ${CATEGORY} (GREEN / VIOLET)...`);

  const deleted = await prisma.kryptokLens.deleteMany({
    where: {
      category: { equals: CATEGORY, mode: "insensitive" },
      brand: null,
      cyl: null,
      axis: null,
    },
  });

  console.log(`Removed ${deleted.count} existing ${CATEGORY} SPH-only row(s).`);

  const created = await prisma.kryptokLens.createMany({
    data: ALL_ROWS.map((entry) => ({
      ...entry,
      quantity: 0,
    })),
  });

  console.log(`Inserted ${created.count} ${CATEGORY} SPH-only row(s).`);
  for (const card of SPH_ONLY_CARDS) {
    const coatings = (["green", "violet"] as const).filter((key) => card.costs[key]);
    console.log(`  ${card.label}: ${coatings.join(", ")}`);
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
