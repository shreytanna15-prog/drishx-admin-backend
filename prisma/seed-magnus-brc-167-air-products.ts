import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { withSellingPrice } from "./single-vision-seed-pricing";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const META = {
  category: "BRC",
  brand: "Magnus",
  item: "MAGNUS 1.67 AIR",
  index: "1.67",
} as const;

type SingleVisionSeedRow = {
  category: string;
  brand: string;
  item: string;
  index: string;
  coating: string;
  sph: string;
  cyl: string;
  crossPower: null;
  costPrice: string;
  price: string;
  quantity: number;
};

type CoatingCosts = {
  green?: string;
  clikCoat?: string;
};

type PowerSpec = {
  sph: number;
  cyl: number;
  costs: CoatingCosts;
};

function formatPower(value: number): string {
  return value.toFixed(2);
}

function buildRow(
  sph: number,
  cyl: number,
  coating: string,
  costPrice: string
): SingleVisionSeedRow {
  const pricing = withSellingPrice(costPrice);
  return {
    ...META,
    coating,
    sph: formatPower(sph),
    cyl: formatPower(cyl),
    crossPower: null,
    ...pricing,
    quantity: 0,
  };
}

/** Magnus BRC 1.67 AIR — price sheet (GREEN / CLIK COAT). */
const POWER_SPECS: PowerSpec[] = [
  { sph: -10, cyl: -2, costs: { green: "425", clikCoat: "525" } },
  { sph: -15, cyl: 0, costs: { green: "475", clikCoat: "575" } },
  { sph: -12, cyl: -2, costs: { green: "475", clikCoat: "575" } },
  { sph: -10, cyl: -4, costs: { green: "550", clikCoat: "675" } },
  { sph: -18, cyl: 0, costs: { green: "1200" } },
  { sph: -14, cyl: -2, costs: { green: "1200" } },
  { sph: -12, cyl: -4, costs: { green: "1200" } },
  { sph: -20, cyl: 0, costs: { green: "1400" } },
  { sph: -20, cyl: -2, costs: { green: "1400" } },
  { sph: -20, cyl: -4, costs: { green: "1400" } },
  { sph: -8, cyl: -6, costs: { green: "1300" } },
  { sph: -24, cyl: 0, costs: { green: "1650" } },
  { sph: -20, cyl: -6, costs: { green: "1650" } },
];

const COATING_META = {
  green: "GREEN",
  clikCoat: "CLIK COAT",
} as const;

function buildRows(): SingleVisionSeedRow[] {
  const rows: SingleVisionSeedRow[] = [];

  for (const spec of POWER_SPECS) {
    for (const [key, coating] of Object.entries(COATING_META) as Array<
      [keyof CoatingCosts, (typeof COATING_META)[keyof typeof COATING_META]]
    >) {
      const cost = spec.costs[key];
      if (!cost) {
        continue;
      }
      rows.push(buildRow(spec.sph, spec.cyl, coating, cost));
    }
  }

  return rows;
}

const ALL_ROWS = buildRows();

async function main() {
  console.log(`Seeding Magnus BRC 1.67 AIR Single Vision (${ALL_ROWS.length} rows)...`);

  const deleted = await prisma.singleVisionLens.deleteMany({
    where: {
      category: { equals: META.category, mode: "insensitive" },
      brand: { equals: META.brand, mode: "insensitive" },
      item: { equals: META.item, mode: "insensitive" },
      index: META.index,
    },
  });

  console.log(`Removed ${deleted.count} existing Magnus BRC 1.67 AIR row(s).`);

  const created = await prisma.singleVisionLens.createMany({
    data: ALL_ROWS,
  });

  console.log(`Inserted ${created.count} Magnus BRC 1.67 AIR row(s).`);
  console.log(`  GREEN: ${ALL_ROWS.filter((row) => row.coating === "GREEN").length}`);
  console.log(`  CLIK COAT: ${ALL_ROWS.filter((row) => row.coating === "CLIK COAT").length}`);
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
