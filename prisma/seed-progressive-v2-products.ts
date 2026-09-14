import "dotenv/config";
import fs from "fs";
import path from "path";
import { PrismaClient, type Eye } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  PROGRESSIVE_WHOLESALE_ITEMS,
  buildProgressiveWholesaleItemWhere,
} from "../app/lib/progressive-wholesale-catalog";
import { applyProgressiveAxis } from "../app/lib/progressive-axis";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

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
  price: string;
  quantity: number;
};

/** Full progressive catalog from prisma/seed.ts (price-sheet rows). */
function loadProgressiveLensDataFromSeed(): ProgressiveSeedRow[] {
  const seedPath = path.join(__dirname, "seed.ts");
  const source = fs.readFileSync(seedPath, "utf8");
  const match = source.match(
    /const progressiveLensData = \[([\s\S]*?)\];\s*\r?\n\s*const bifocalLensData/
  );

  if (!match) {
    throw new Error("Could not find progressiveLensData array in prisma/seed.ts");
  }

  const rows = new Function(`return [${match[1]}]`)() as ProgressiveSeedRow[];
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("progressiveLensData in prisma/seed.ts is empty or invalid");
  }

  return rows;
}

async function printV2Counts() {
  console.log("Progressive V2 wholesale counts:");
  for (const name of PROGRESSIVE_WHOLESALE_ITEMS) {
    const count = await prisma.progressiveLens.count({
      where: buildProgressiveWholesaleItemWhere(name),
    });
    console.log(`  ${name}: ${count}`);
  }
}

async function main() {
  const rows = loadProgressiveLensDataFromSeed();
  console.log(`Seeding full progressive catalog (${rows.length} rows from prisma/seed.ts)...`);

  const deleted = await prisma.progressiveLens.deleteMany();
  console.log(`Removed ${deleted.count} existing progressive rows.`);

  const created = await prisma.progressiveLens.createMany({
    data: rows.map((row) => {
      const withAxis = applyProgressiveAxis(row);
      return {
        category: withAxis.category,
        item: withAxis.item,
        brand: withAxis.brand,
        index: withAxis.index,
        type: withAxis.type,
        coating: withAxis.coating,
        sph: withAxis.sph,
        cyl: withAxis.cyl,
        axis: withAxis.axis,
        add: withAxis.add,
        eye: withAxis.eye,
        price: withAxis.price,
        quantity: withAxis.quantity ?? 0,
      };
    }),
  });

  console.log(`Inserted ${created.count} progressive rows.`);
  await printV2Counts();
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
