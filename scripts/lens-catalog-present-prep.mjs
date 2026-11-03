/**
 * Prep catalog for presentation: delete QA junk, ensure one clean demo product
 * with auto-generated SKU. Prints demo product id + sku for browser SS.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { createRequire } from "node:module";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

// Build SKU the same way as the app (via compiled/tsx path not available in plain mjs —
// mirror sanitize/encode here for the demo create assertion).
function sanitize(code) {
  return code.trim().toUpperCase().replace(/\./g, "P").replace(/[^A-Z0-9]+/g, "");
}
function encodePower(value) {
  const v = Number(Number(value).toFixed(2));
  const sign = v < 0 ? "M" : "";
  const abs = Math.abs(v);
  const body = Number.isInteger(abs) ? String(abs) : String(abs).replace(".", "P");
  return `${sign}${body}`;
}
function buildSku({ family, base, material, index, sphMin, sphMax, cylMin, cylMax }) {
  const tokens = [sanitize(family), sanitize(base), sanitize(material)];
  if (index) tokens.push(sanitize(index));
  tokens.push(`S${encodePower(sphMin)}T${encodePower(sphMax)}`);
  tokens.push(`C${encodePower(cylMin)}T${encodePower(cylMax)}`);
  return tokens.join("-");
}

async function main() {
  // Clean slate for presentation (attributes stay; products rebuild as demo only)
  const existing = await prisma.lensProduct.findMany({
    select: { id: true, skuCode: true, name: true },
  });
  if (existing.length) {
    await prisma.lensProduct.deleteMany({});
    console.log(`Deleted ${existing.length} existing products:`);
    for (const j of existing) console.log(`  - ${j.skuCode} (${j.name})`);
  } else {
    console.log("Catalog already empty.");
  }

  const [family, base, material, index] = await Promise.all([
    prisma.lensFamily.findUnique({ where: { code: "SV" } }),
    prisma.lensBase.findUnique({ where: { code: "HC" } }),
    prisma.lensMaterial.findUnique({ where: { code: "PLAIN" } }),
    prisma.lensIndex.findUnique({ where: { code: "1.56" } }),
  ]);
  if (!family || !base || !material || !index) {
    throw new Error("Missing SV/HC/PLAIN/1.56 seed attributes");
  }

  // Presentation demo: classic plus band so matrix looks good
  const sphMin = 0;
  const sphMax = 2;
  const cylMin = 0;
  const cylMax = 1;
  const expectedSku = buildSku({
    family: "SV",
    base: "HC",
    material: "PLAIN",
    index: "1.56",
    sphMin,
    sphMax,
    cylMin,
    cylMax,
  });

  // Remove any existing product with this exact combo/range or same sku
  await prisma.lensProduct.deleteMany({
    where: {
      OR: [
        { skuCode: expectedSku },
        {
          familyId: family.id,
          baseId: base.id,
          materialId: material.id,
          indexId: index.id,
          coatingId: null,
          colorId: null,
          rangeType: "NORMAL",
          sphMin,
          sphMax,
          cylMin,
          cylMax,
        },
      ],
    },
  });

  const powerRange = await prisma.lensPowerRange.upsert({
    where: {
      sphMin_sphMax_cylMin_cylMax: { sphMin, sphMax, cylMin, cylMax },
    },
    update: { isActive: true },
    create: { sphMin, sphMax, cylMin, cylMax },
  });

  const demo = await prisma.lensProduct.create({
    data: {
      skuCode: expectedSku,
      name: "Hard Coat Single Vision +",
      familyId: family.id,
      baseId: base.id,
      materialId: material.id,
      indexId: index.id,
      powerRangeId: powerRange.id,
      rangeType: "NORMAL",
      sphMin,
      sphMax,
      cylMin,
      cylMax,
      isActive: true,
      defaultPrice: 450,
    },
  });

  const remaining = await prisma.lensProduct.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, skuCode: true, name: true },
    take: 20,
  });

  console.log("\nDemo product ready:");
  console.log(`  id:  ${demo.id}`);
  console.log(`  sku: ${demo.skuCode}`);
  console.log(`  name: ${demo.name}`);
  console.log(`  url: /inventory/products-catalog/${demo.id}`);
  console.log(`\nCatalog now (${remaining.length} shown):`);
  for (const p of remaining) console.log(`  - ${p.skuCode} · ${p.name}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
