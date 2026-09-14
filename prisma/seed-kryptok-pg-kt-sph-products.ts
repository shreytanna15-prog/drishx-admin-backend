import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { withSellingPrice } from "./single-vision-seed-pricing";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const CATEGORY = "PG KT";
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
  hc?: string;
  hmc?: string;
};

type SphCardSpec = {
  label: string;
  sph: number;
  costs: CoatingCosts;
};

/** PG KT — SPH-only price sheet (HC / HMC coatings). */
const SPH_ONLY_CARDS: SphCardSpec[] = [
  {
    label: "+3/+",
    sph: 3,
    costs: { hc: "56", hmc: "90" },
  },
  {
    label: "-2/+",
    sph: -2,
    costs: { hc: "76", hmc: "110" },
  },
  {
    label: "-3/+",
    sph: -3,
    costs: { hc: "111" },
  },
];

const COATING_META = {
  hc: { coating: "HC" },
  hmc: { coating: "HMC" },
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
  console.log(`Seeding Kryptok SPH-only ${CATEGORY} (HC / HMC)...`);

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
    const coatings = (["hc", "hmc"] as const).filter((key) => card.costs[key]);
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
