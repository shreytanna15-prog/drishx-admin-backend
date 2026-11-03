/**
 * Prep catalog for presentation: wipe products, create one parent + variant demo.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

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
function buildBase({ material, base, index, family, color }) {
  const tokens = [];
  if (material) tokens.push(sanitize(material));
  tokens.push(sanitize(base), sanitize(index), sanitize(family));
  if (color) tokens.push(sanitize(color));
  return tokens.join("-");
}
function buildSku(parts, bounds) {
  return [
    buildBase(parts),
    `S${encodePower(bounds.sphMin)}T${encodePower(bounds.sphMax)}`,
    `C${encodePower(bounds.cylMin)}T${encodePower(bounds.cylMax)}`,
  ].join("-");
}

async function main() {
  const existing = await prisma.lensProduct.count();
  if (existing) {
    await prisma.lensProduct.deleteMany({});
    console.log(`Deleted ${existing} parent product(s) (variants cascade).`);
  } else {
    console.log("Catalog already empty.");
  }

  const [family, base, material, index, color] = await Promise.all([
    prisma.lensFamily.findUnique({ where: { code: "SV" } }),
    prisma.lensBase.findUnique({ where: { code: "HC" } }),
    prisma.lensMaterial.findUnique({ where: { code: "PLAIN" } }),
    prisma.lensIndex.findUnique({ where: { code: "1.56" } }),
    prisma.lensColor.findFirst({ where: { isActive: true } }),
  ]);
  if (!family || !base || !material || !index || !color) {
    throw new Error("Missing SV/HC/PLAIN/1.56/color seed attributes");
  }

  const sphMin = 0;
  const sphMax = 2;
  const cylMin = 0;
  const cylMax = 1;
  const codeParts = {
    material: "PLAIN",
    base: "HC",
    index: "1.56",
    family: "SV",
    color: color.code,
  };
  const baseCode = buildBase(codeParts);
  const expectedSku = buildSku(codeParts, { sphMin, sphMax, cylMin, cylMax });
  const name = `PLAIN 1.56 SV HC ${color.code} +0.00/+2.00`;

  const powerRange = await prisma.lensPowerRange.upsert({
    where: {
      sphMin_sphMax_cylMin_cylMax: { sphMin, sphMax, cylMin, cylMax },
    },
    update: { isActive: true },
    create: { sphMin, sphMax, cylMin, cylMax },
  });

  const parent = await prisma.lensProduct.create({
    data: {
      baseCode,
      familyId: family.id,
      baseId: base.id,
      materialId: material.id,
      indexId: index.id,
      colorId: color.id,
      isActive: true,
      variants: {
        create: {
          powerRangeId: powerRange.id,
          skuCode: expectedSku,
          name,
          sphMin,
          sphMax,
          cylMin,
          cylMax,
          defaultPrice: 450,
          isActive: true,
        },
      },
    },
    include: { variants: true },
  });

  console.log("\nDemo parent ready:");
  console.log(`  parent id: ${parent.id}`);
  console.log(`  variant:   ${parent.variants[0].skuCode}`);
  console.log(`  name:      ${parent.variants[0].name}`);
  console.log(`  url:       /inventory/products-catalog/${parent.id}`);
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
