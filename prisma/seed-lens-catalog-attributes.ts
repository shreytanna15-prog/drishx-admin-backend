/**
 * Seed Lens* attribute masters + base↔material links for product catalog.
 * Safe to re-run (upsert by code).
 *
 * Usage: npx tsx prisma/seed-lens-catalog-attributes.ts
 * Or: npm run db:seed-lens-attributes
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import {
  ADDITION_SELECT_VALUES,
  AXIS_SELECT_VALUES,
  DIAMETER_SELECT_VALUES,
  additionCodeFromValue,
  axisCodeFromValue,
  diameterCodeFromValue,
  formatAdditionLabel,
  formatAxisLabel,
  formatDiameterLabel,
} from "../app/lib/catalog/catalog-axis-add-diameter-options";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

type AttrSeed = {
  code: string;
  name: string;
  sortOrder: number;
  value?: number;
  supportsAxis?: boolean;
  supportsAdd?: boolean;
  supportsEye?: boolean;
};

const FAMILIES: AttrSeed[] = [
  {
    code: "SV",
    name: "Single Vision",
    sortOrder: 10,
    supportsAxis: false,
    supportsAdd: false,
    supportsEye: false,
  },
  {
    code: "KT",
    name: "Kryptok",
    sortOrder: 20,
    supportsAxis: true,
    supportsAdd: true,
    supportsEye: false,
  },
  {
    code: "V2",
    name: "Progressive V2",
    sortOrder: 30,
    supportsAxis: true,
    supportsAdd: true,
    supportsEye: true,
  },
];

const BASES: AttrSeed[] = [
  { code: "HC", name: "Hard Coat", sortOrder: 10 },
  { code: "BRC", name: "Blue Ray Cut", sortOrder: 20 },
  { code: "ARC", name: "Anti-Reflective Coating", sortOrder: 30 },
];

const MATERIALS: AttrSeed[] = [
  { code: "PLAIN", name: "Standard / Plain", sortOrder: 10 },
  { code: "UC", name: "Uncoated", sortOrder: 20 },
  { code: "TINTABLE", name: "Tintable", sortOrder: 30 },
  { code: "POLY", name: "Polycarbonate", sortOrder: 40 },
  { code: "PG", name: "Photochromic", sortOrder: 50 },
  { code: "PG_POLY", name: "Photochromic Polycarbonate", sortOrder: 60 },
];

const INDEXES: AttrSeed[] = [
  { code: "1.49", name: "1.49", sortOrder: 10, value: 1.49 },
  { code: "1.499", name: "1.499", sortOrder: 15, value: 1.499 },
  { code: "1.56", name: "1.56", sortOrder: 20, value: 1.56 },
  { code: "1.59", name: "1.59", sortOrder: 30, value: 1.59 },
  { code: "1.6", name: "1.6", sortOrder: 35, value: 1.6 },
  { code: "1.61", name: "1.61", sortOrder: 40, value: 1.61 },
  { code: "1.67", name: "1.67", sortOrder: 50, value: 1.67 },
  { code: "1.74", name: "1.74", sortOrder: 60, value: 1.74 },
];

const COATINGS: AttrSeed[] = [
  { code: "GREEN", name: "Green", sortOrder: 10 },
  { code: "BLUE", name: "Blue", sortOrder: 20 },
  { code: "BLUE_COAT", name: "Blue Coat", sortOrder: 30 },
  { code: "MARI_BLUE", name: "Mari-Blue", sortOrder: 40 },
  { code: "VIOLET", name: "Violet", sortOrder: 50 },
  { code: "PURPLE", name: "Purple", sortOrder: 60 },
  { code: "HC", name: "HC", sortOrder: 70 },
  { code: "HMC", name: "HMC", sortOrder: 80 },
  { code: "SHMC", name: "SHMC", sortOrder: 90 },
  { code: "CLIK_COAT", name: "CLIK COAT", sortOrder: 100 },
  { code: "LR_GREEN", name: "LR Green", sortOrder: 110 },
];

const COLORS: AttrSeed[] = [
  { code: "GREY", name: "Grey", sortOrder: 10 },
  { code: "BROWN", name: "Brown", sortOrder: 20 },
  { code: "GREEN", name: "Green tint", sortOrder: 30 },
  { code: "BLUE", name: "Blue tint", sortOrder: 40 },
];

/** Base code → allowed material codes (docs/product-catalog-hierarchy). */
const BASE_MATERIAL: Record<string, string[]> = {
  HC: ["PLAIN", "UC", "TINTABLE", "PG"],
  ARC: ["PLAIN", "UC", "TINTABLE"],
  BRC: ["PLAIN", "UC", "TINTABLE", "POLY", "PG", "PG_POLY"],
};

async function upsertAttr(
  model: "family" | "base" | "material" | "index" | "coating" | "color",
  seed: AttrSeed
) {
  const shared = {
    name: seed.name,
    sortOrder: seed.sortOrder,
    isActive: true,
  };
  switch (model) {
    case "family":
      return prisma.lensFamily.upsert({
        where: { code: seed.code },
        create: {
          code: seed.code,
          ...shared,
          supportsAxis: seed.supportsAxis ?? false,
          supportsAdd: seed.supportsAdd ?? false,
          supportsEye: seed.supportsEye ?? false,
        },
        update: {
          ...shared,
          supportsAxis: seed.supportsAxis ?? false,
          supportsAdd: seed.supportsAdd ?? false,
          supportsEye: seed.supportsEye ?? false,
        },
      });
    case "base":
      return prisma.lensBase.upsert({
        where: { code: seed.code },
        create: { code: seed.code, ...shared },
        update: shared,
      });
    case "material":
      return prisma.lensMaterial.upsert({
        where: { code: seed.code },
        create: { code: seed.code, ...shared },
        update: shared,
      });
    case "index":
      return prisma.lensIndex.upsert({
        where: { code: seed.code },
        create: { code: seed.code, ...shared, value: seed.value ?? null },
        update: { ...shared, value: seed.value ?? null },
      });
    case "coating":
      return prisma.lensCoating.upsert({
        where: { code: seed.code },
        create: { code: seed.code, ...shared },
        update: shared,
      });
    case "color":
      return prisma.lensColor.upsert({
        where: { code: seed.code },
        create: { code: seed.code, ...shared },
        update: shared,
      });
  }
}

async function main() {
  for (const row of FAMILIES) await upsertAttr("family", row);
  for (const row of BASES) await upsertAttr("base", row);
  for (const row of MATERIALS) await upsertAttr("material", row);
  for (const row of INDEXES) await upsertAttr("index", row);
  for (const row of COATINGS) await upsertAttr("coating", row);
  for (const row of COLORS) await upsertAttr("color", row);

  let axisCount = 0;
  for (const value of AXIS_SELECT_VALUES) {
    const code = axisCodeFromValue(value);
    const name = formatAxisLabel(value);
    const sortOrder = value;
    await prisma.lensAxis.upsert({
      where: { code },
      create: { code, name, value, sortOrder, isActive: true },
      update: { name, value, sortOrder, isActive: true },
    });
    axisCount += 1;
  }

  let additionCount = 0;
  for (const value of ADDITION_SELECT_VALUES) {
    const code = additionCodeFromValue(value);
    const name = formatAdditionLabel(value);
    const sortOrder = Math.round(value * 100);
    await prisma.lensAddition.upsert({
      where: { code },
      create: { code, name, value, sortOrder, isActive: true },
      update: { name, value, sortOrder, isActive: true },
    });
    additionCount += 1;
  }

  let diameterCount = 0;
  for (const value of DIAMETER_SELECT_VALUES) {
    const code = diameterCodeFromValue(value);
    const name = formatDiameterLabel(value);
    const sortOrder = value;
    await prisma.lensDiameter.upsert({
      where: { code },
      create: { code, name, value, sortOrder, isActive: true },
      update: { name, value, sortOrder, isActive: true },
    });
    diameterCount += 1;
  }

  const bases = await prisma.lensBase.findMany();
  const materials = await prisma.lensMaterial.findMany();
  const baseByCode = new Map(bases.map((b) => [b.code, b.id]));
  const materialByCode = new Map(materials.map((m) => [m.code, m.id]));

  let links = 0;
  for (const [baseCode, materialCodes] of Object.entries(BASE_MATERIAL)) {
    const baseId = baseByCode.get(baseCode);
    if (!baseId) continue;
    for (const materialCode of materialCodes) {
      const materialId = materialByCode.get(materialCode);
      if (!materialId) continue;
      await prisma.lensBaseMaterialLink.upsert({
        where: {
          baseId_materialId: { baseId, materialId },
        },
        create: { baseId, materialId },
        update: {},
      });
      links += 1;
    }
  }

  console.log(
    `Seeded attributes: ${FAMILIES.length} families, ${BASES.length} bases, ${MATERIALS.length} materials, ${INDEXES.length} indexes, ${COATINGS.length} coatings, ${COLORS.length} colors, ${axisCount} axes, ${additionCount} additions, ${diameterCount} diameters, ${links} base↔material links.`
  );
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
