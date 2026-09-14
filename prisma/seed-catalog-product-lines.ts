/**
 * Seed system catalog product lines from wholesale item constants.
 * Safe to re-run (upsert by lensType + name).
 *
 * Usage: npx tsx prisma/seed-catalog-product-lines.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { KRYPTOK_WHOLESALE_ITEMS } from "../app/lib/kryptok-wholesale-catalog";
import { PROGRESSIVE_WHOLESALE_ITEMS } from "../app/lib/progressive-wholesale-catalog";
import { SINGLE_VISION_WHOLESALE_ITEMS } from "../app/lib/single-vision-wholesale-catalog";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

type SeedLine = {
  lensType: string;
  name: string;
  sortOrder: number;
};

function buildSeedLines(): SeedLine[] {
  const lines: SeedLine[] = [];

  SINGLE_VISION_WHOLESALE_ITEMS.forEach((name, index) => {
    lines.push({ lensType: "single-vision", name, sortOrder: index });
  });
  KRYPTOK_WHOLESALE_ITEMS.forEach((name, index) => {
    lines.push({ lensType: "kryptok", name, sortOrder: index });
  });
  PROGRESSIVE_WHOLESALE_ITEMS.forEach((name, index) => {
    lines.push({ lensType: "progressive", name, sortOrder: index });
  });

  return lines;
}

async function main() {
  const lines = buildSeedLines();
  let created = 0;
  let updated = 0;

  for (const line of lines) {
    const existing = await prisma.catalogProductLine.findUnique({
      where: {
        lensType_name: { lensType: line.lensType, name: line.name },
      },
    });

    if (existing) {
      await prisma.catalogProductLine.update({
        where: { id: existing.id },
        data: {
          sortOrder: line.sortOrder,
          isSystem: true,
          isActive: true,
        },
      });
      updated += 1;
    } else {
      await prisma.catalogProductLine.create({
        data: {
          lensType: line.lensType,
          name: line.name,
          sortOrder: line.sortOrder,
          isSystem: true,
          isActive: true,
        },
      });
      created += 1;
    }
  }

  console.log(
    `Catalog product lines: ${created} created, ${updated} updated (total seed rows ${lines.length}).`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
