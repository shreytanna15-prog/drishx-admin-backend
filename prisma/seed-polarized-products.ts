import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { withSellingPrice } from "./single-vision-seed-pricing";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const META = {
  category: "POLARIZED",
  brand: "",
  item: "Black, Brown, Green",
  index: "1.56",
  sph: "-6.00",
  cyl: "0.00",
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

type CoatingSpec = {
  coating: string;
  costPrice: string;
};

/** POLARIZED Black, Brown, Green — upto SPH -6 (UC / GREEN). */
const COATING_SPECS: CoatingSpec[] = [
  { coating: "UC", costPrice: "400" },
  { coating: "GREEN", costPrice: "500" },
];

function buildRow(spec: CoatingSpec): SingleVisionSeedRow {
  const pricing = withSellingPrice(spec.costPrice);
  return {
    ...META,
    coating: spec.coating,
    crossPower: null,
    ...pricing,
    quantity: 0,
  };
}

const ALL_ROWS = COATING_SPECS.map(buildRow);

async function main() {
  console.log(`Seeding POLARIZED Single Vision (${ALL_ROWS.length} rows)...`);

  const deleted = await prisma.singleVisionLens.deleteMany({
    where: {
      category: { equals: META.category, mode: "insensitive" },
      brand: META.brand,
      item: { equals: META.item, mode: "insensitive" },
      index: META.index,
      sph: META.sph,
      cyl: META.cyl,
    },
  });

  console.log(`Removed ${deleted.count} existing POLARIZED row(s).`);

  const created = await prisma.singleVisionLens.createMany({
    data: ALL_ROWS,
  });

  console.log(`Inserted ${created.count} POLARIZED row(s).`);
  for (const spec of COATING_SPECS) {
    const pricing = withSellingPrice(spec.costPrice);
    console.log(`  ${spec.coating}: cost ${pricing.costPrice}, sell ${pricing.price}`);
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
