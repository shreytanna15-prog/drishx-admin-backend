import "dotenv/config";
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { Pool } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  SINGLE_VISION_WHOLESALE_ITEMS,
  buildSingleVisionWholesaleItemWhere,
} from "../app/lib/single-vision-wholesale-catalog";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

type SingleVisionSeedRow = {
  category: string;
  brand: string;
  item: string | null;
  index: string;
  coating: string;
  sph: string;
  cyl: string | null;
  price: string;
  quantity: number;
};

function loadSingleVisionLensDataFromSeed(): SingleVisionSeedRow[] {
  const seedPath = path.join(__dirname, "seed.ts");
  const source = fs.readFileSync(seedPath, "utf8");
  const match = source.match(
    /const singleVisionLensData = \[([\s\S]*?)\];\s*\r?\n\s*const progressiveLensData/
  );

  if (!match) {
    throw new Error("Could not find singleVisionLensData array in prisma/seed.ts");
  }

  const rows = new Function(`return [${match[1]}]`)() as SingleVisionSeedRow[];
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("singleVisionLensData in prisma/seed.ts is empty or invalid");
  }

  return rows;
}

const extraSingleVisionRows: SingleVisionSeedRow[] = [
  { category: "SUPER POLY BLUE CUT", brand: "POLY-STEEL", item: "POLY SV - STEEL", index: "1.59", coating: "BLUE", sph: "-6.00", cyl: "-2.00", price: "95", quantity: 0 },
  { category: "SUPER POLY BLUE CUT", brand: "POLY-STEEL", item: "POLY SV - STEEL", index: "1.59", coating: "BLUE", sph: "-8.00", cyl: "-2.00", price: "105", quantity: 0 },
  { category: "SUPER POLY BLUE CUT", brand: "POLY-STEEL", item: "POLY SV - STEEL", index: "1.59", coating: "BLUE", sph: "-6.00", cyl: "-4.00", price: "145", quantity: 0 },

  { category: "SUPER PG POLY BLUE CUT", brand: "WIZARD", item: "POLY PG BLUE CUT", index: "1.59", coating: "BLUE", sph: "-6.00", cyl: "-2.00", price: "210", quantity: 0 },
  { category: "SUPER PG POLY BLUE CUT", brand: "WIZARD", item: "POLY PG BLUE CUT", index: "1.59", coating: "BLUE", sph: "-8.00", cyl: "-2.00", price: "220", quantity: 0 },
  { category: "SUPER PG POLY BLUE CUT", brand: "WIZARD", item: "POLY PG BLUE CUT", index: "1.59", coating: "BLUE", sph: "-6.00", cyl: "-4.00", price: "260", quantity: 0 },

  { category: "HC SV", brand: "TRUTUFF HC", item: "HC SV", index: "1.56", coating: "HC", sph: "-6.00", cyl: "-2.00", price: "42", quantity: 0 },
  { category: "HC SV", brand: "TRUTUFF HC", item: "HC SV", index: "1.56", coating: "HC", sph: "-8.00", cyl: "-2.00", price: "48", quantity: 0 },
  { category: "HC SV", brand: "TRUTUFF HC", item: "HC SV", index: "1.56", coating: "HC", sph: "-6.00", cyl: "-4.00", price: "68", quantity: 0 },

  { category: "PHOTOGREY WITHOUT BLUE", brand: "KRASOL PG HC", item: "PG HC SV", index: "1.56", coating: "HC", sph: "-6.00", cyl: "-2.00", price: "125", quantity: 0 },
  { category: "PHOTOGREY WITHOUT BLUE", brand: "KRASOL PG HC", item: "PG HC SV", index: "1.56", coating: "HC", sph: "-8.00", cyl: "-2.00", price: "135", quantity: 0 },
  { category: "PHOTOGREY WITHOUT BLUE", brand: "STARK PG HC", item: "PG HC SV", index: "1.56", coating: "HC", sph: "-6.00", cyl: "-2.00", price: "140", quantity: 0 },
  { category: "PHOTOGREY WITHOUT BLUE", brand: "STARK PG HC", item: "PG HC SV", index: "1.56", coating: "HC", sph: "-8.00", cyl: "-2.00", price: "150", quantity: 0 },

  { category: "BLUE CUT SV", brand: "MARI BLU", item: "MARI-BLUE", index: "1.56", coating: "INVISIBLE BLUE", sph: "-6.00", cyl: "-2.00", price: "120", quantity: 0 },
  { category: "BLUE CUT SV", brand: "MARI BLU", item: "MARI-BLUE", index: "1.56", coating: "INVISIBLE BLUE", sph: "-8.00", cyl: "-2.00", price: "130", quantity: 0 },
  { category: "BLUE CUT SV", brand: "MARI BLU", item: "MARI-BLUE", index: "1.56", coating: "INVISIBLE BLUE", sph: "-6.00", cyl: "-4.00", price: "175", quantity: 0 },

  { category: "BLUE CUT SV", brand: "B-TRON 1.67 Green", item: "BLUE CUT", index: "1.67", coating: "GREEN", sph: "-6.00", cyl: "-2.00", price: "180", quantity: 0 },
  { category: "BLUE CUT SV", brand: "B-TRON 1.67 Green", item: "BLUE CUT", index: "1.67", coating: "GREEN", sph: "-8.00", cyl: "-2.00", price: "195", quantity: 0 },
  { category: "BLUE CUT SV", brand: "B-TRON 1.67 Green", item: "BLUE CUT", index: "1.67", coating: "GREEN", sph: "-6.00", cyl: "-4.00", price: "240", quantity: 0 },
];

async function printWholesaleCounts() {
  console.log("Single Vision wholesale counts:");
  for (const name of SINGLE_VISION_WHOLESALE_ITEMS) {
    const count = await prisma.singleVisionLens.count({
      where: buildSingleVisionWholesaleItemWhere(name),
    });
    console.log(`  ${name}: ${count}`);
  }
}

async function main() {
  const baseRows = loadSingleVisionLensDataFromSeed();
  const allRows = [...baseRows, ...extraSingleVisionRows];

  console.log(`Seeding Single Vision catalog (${allRows.length} rows)...`);

  const deleted = await prisma.singleVisionLens.deleteMany();
  console.log(`Removed ${deleted.count} existing single vision rows.`);

  const created = await prisma.singleVisionLens.createMany({
    data: allRows.map((row) => ({
      category: row.category,
      brand: row.brand,
      item: row.item,
      index: row.index,
      coating: row.coating,
      sph: row.sph,
      cyl: row.cyl,
      price: row.price,
      quantity: row.quantity ?? 0,
    })),
  });

  console.log(`Inserted ${created.count} single vision rows.`);
  await printWholesaleCounts();
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
