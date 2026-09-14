import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { withSellingPrice } from "./single-vision-seed-pricing";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const CATEGORY = "BRC KT Invisio";
const BRAND = "Invisio";
const COATING = "Light Blue";
const DEFAULT_ADD = "1.00";

type SphCardSpec = {
  label: string;
  sph: number;
  costPrice: string;
};

const SPH_ONLY_CARDS: SphCardSpec[] = [
  { label: "+3/+", sph: 3, costPrice: "130" },
  { label: "-2/+", sph: -2, costPrice: "150" },
  { label: "-3/+", sph: -3, costPrice: "200" },
];

function formatPower(value: number): string {
  return value.toFixed(2);
}

async function main() {
  console.log(`Seeding Kryptok SPH-only ${CATEGORY} (${BRAND} / ${COATING})...`);

  const deleted = await prisma.kryptokLens.deleteMany({
    where: {
      category: { equals: CATEGORY, mode: "insensitive" },
      brand: { equals: BRAND, mode: "insensitive" },
      coating: { equals: COATING, mode: "insensitive" },
      cyl: null,
      axis: null,
    },
  });

  console.log(`Removed ${deleted.count} existing ${CATEGORY} SPH-only row(s).`);

  const created = await prisma.kryptokLens.createMany({
    data: SPH_ONLY_CARDS.map((card) => {
      const pricing = withSellingPrice(card.costPrice);
      return {
        category: CATEGORY,
        brand: BRAND,
        coating: COATING,
        sph: formatPower(card.sph),
        cyl: null,
        axis: null,
        add: DEFAULT_ADD,
        costPrice: pricing.costPrice,
        price: pricing.price,
        quantity: 0,
      };
    }),
  });

  console.log(`Inserted ${created.count} ${CATEGORY} SPH-only row(s).`);
  for (const card of SPH_ONLY_CARDS) {
    console.log(`  ${card.label}: SPH ${formatPower(card.sph)} cost ${card.costPrice}`);
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
