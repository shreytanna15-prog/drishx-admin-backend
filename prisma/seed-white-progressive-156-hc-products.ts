import "dotenv/config";
import { PrismaClient, type Eye } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { withSellingPrice } from "./single-vision-seed-pricing";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const META = {
  category: "WHITE PROGRESSIVE",
  item: "WHITE PROGRESSIVE 1.56",
  brand: "",
  index: "1.56",
  type: "HC",
  coating: "HC",
  add: "0.00",
  eye: "LEFT" as Eye,
} as const;

type ProgressiveSeedRow = {
  category: string;
  item: string;
  brand: string;
  index: string;
  type: string;
  coating: string;
  sph: string;
  cyl: string | null;
  axis: number | null;
  add: string;
  eye: Eye;
  costPrice: string;
  price: string;
  quantity: number;
};

type PowerSpec = {
  sph: string;
  cyl: string | null;
  axis: number | null;
  costPrice: string;
};

function buildRow(spec: PowerSpec): ProgressiveSeedRow {
  const pricing = withSellingPrice(spec.costPrice);
  return {
    ...META,
    sph: spec.sph,
    cyl: spec.cyl,
    axis: spec.axis,
    ...pricing,
    quantity: 0,
  };
}

/** WHITE PROGRESSIVE 1.56 — HC price sheet (PROX/SPRO/Green excluded). */
const POWER_SPECS: PowerSpec[] = [
  // SPH only
  { sph: "3.00", cyl: null, axis: null, costPrice: "85" },
  { sph: "-2.00", cyl: null, axis: null, costPrice: "105" },
  // CYL only — axis +180 / -90
  { sph: "0.00", cyl: "2.00", axis: 180, costPrice: "120" },
  { sph: "0.00", cyl: "2.00", axis: 90, costPrice: "120" },
  // Compound 2/1 — +2/+1 @ 180, -2/-1 @ 90
  { sph: "2.00", cyl: "1.00", axis: 180, costPrice: "160" },
  { sph: "-2.00", cyl: "-1.00", axis: 90, costPrice: "185" },
];

const ALL_ROWS = POWER_SPECS.map(buildRow);

async function main() {
  console.log(`Seeding WHITE PROGRESSIVE 1.56 HC (${ALL_ROWS.length} rows)...`);

  const deleted = await prisma.progressiveLens.deleteMany({
    where: {
      category: { equals: META.category, mode: "insensitive" },
      item: { equals: META.item, mode: "insensitive" },
      brand: META.brand,
      index: META.index,
      type: META.type,
      coating: META.coating,
    },
  });

  console.log(`Removed ${deleted.count} existing WHITE PROGRESSIVE 1.56 HC row(s).`);

  const created = await prisma.progressiveLens.createMany({
    data: ALL_ROWS,
  });

  console.log(`Inserted ${created.count} WHITE PROGRESSIVE 1.56 HC row(s).`);
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
