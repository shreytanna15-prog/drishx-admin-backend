/**
 * Lens catalog (RW-09 product-catalog slice) DB integration tests.
 *
 * Opt-in:
 *   DATABASE_URL=postgresql://...
 *   DRISHX_LENS_CATALOG_INTEGRATION=1
 */

import "dotenv/config";
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";

const RUN =
  Boolean(process.env.DATABASE_URL) &&
  process.env.DRISHX_LENS_CATALOG_INTEGRATION === "1";

const createdProductIds: string[] = [];
const createdAttrIds: { type: string; id: string }[] = [];
const createdRangeIds: string[] = [];
const RUN_TAG = Date.now();

/** Find-or-create a power range master (tracked for cleanup only when created here). */
async function ensureRange(b: {
  sphMin: number;
  sphMax: number;
  cylMin: number;
  cylMax: number;
}) {
  const { prisma } = await import("@/app/lib/prisma");
  const existing = await prisma.lensPowerRange.findFirst({
    where: {
      sphMin: b.sphMin,
      sphMax: b.sphMax,
      cylMin: b.cylMin,
      cylMax: b.cylMax,
    },
  });
  if (existing) return existing;
  const created = await prisma.lensPowerRange.create({ data: b });
  createdRangeIds.push(created.id);
  return created;
}

describe("lens catalog integration", { skip: !RUN }, () => {
  before(async () => {
    const { prisma } = await import("@/app/lib/prisma");
    await prisma.lensProductVariant.deleteMany({
      where: { skuCode: { startsWith: "E2E-" } },
    });
    await prisma.lensCoating.deleteMany({
      where: { code: { startsWith: "E2E_COAT_" } },
    });
  });

  after(async () => {
    const { prisma } = await import("@/app/lib/prisma");
    for (const id of createdProductIds) {
      await prisma.lensProduct.deleteMany({ where: { id } });
    }
    for (const row of createdAttrIds) {
      if (row.type === "coating") {
        await prisma.lensCoating.deleteMany({ where: { id: row.id } });
      }
    }
    for (const id of createdRangeIds) {
      await prisma.lensPowerRange.deleteMany({ where: { id } });
    }
  });

  it("lists seeded attribute masters", async () => {
    const { listLensAttributes } = await import(
      "@/app/lib/catalog/lens-attribute-service"
    );
    const families = await listLensAttributes("family", true);
    const bases = await listLensAttributes("base", true);
    const materials = await listLensAttributes("material", true);
    assert.ok(families.some((f) => f.code === "SV"));
    assert.ok(bases.some((b) => b.code === "HC"));
    assert.ok(materials.some((m) => m.code === "PLAIN"));
  });

  it("create / deactivate coating and hide from activeOnly", async () => {
    const {
      createLensAttribute,
      listLensAttributes,
      updateLensAttribute,
    } = await import("@/app/lib/catalog/lens-attribute-service");
    const { prisma } = await import("@/app/lib/prisma");

    const admin = await prisma.user.findFirst({
      where: { role: "ADMIN", isActive: true },
      select: { id: true },
    });
    assert.ok(admin, "Need an ADMIN user in DB for actorUserId");

    const code = `E2E_COAT_${RUN_TAG}`;
    const created = await createLensAttribute("coating", {
      code,
      name: "E2E Tintable Coat",
      actorUserId: admin.id,
    });
    createdAttrIds.push({ type: "coating", id: created.id });

    const active = await listLensAttributes("coating", true);
    assert.ok(active.some((c) => c.id === created.id));

    await updateLensAttribute("coating", created.id, {
      isActive: false,
      actorUserId: admin.id,
    });
    const activeAfter = await listLensAttributes("coating", true);
    assert.ok(!activeAfter.some((c) => c.id === created.id));
  });

  it("creates parent+variant with compatible base/material and rejects bad material", async () => {
    const { prisma } = await import("@/app/lib/prisma");
    const {
      createLensProduct,
      getLensProduct,
      LensProductServiceError,
      steppedRange,
    } = await import("@/app/lib/catalog/lens-product-service");

    const admin = await prisma.user.findFirst({
      where: { role: "ADMIN", isActive: true },
      select: { id: true },
    });
    assert.ok(admin);

    const [family, baseHc, materialPlain, materialPoly, index, color] =
      await Promise.all([
        prisma.lensFamily.findUnique({ where: { code: "SV" } }),
        prisma.lensBase.findUnique({ where: { code: "HC" } }),
        prisma.lensMaterial.findUnique({ where: { code: "PLAIN" } }),
        prisma.lensMaterial.findUnique({ where: { code: "POLY" } }),
        prisma.lensIndex.findUnique({ where: { code: "1.56" } }),
        prisma.lensColor.findFirst({ where: { isActive: true } }),
      ]);
    assert.ok(family && baseHc && materialPlain && materialPoly && index && color);

    const smallRange = await ensureRange({
      sphMin: 0,
      sphMax: 1,
      cylMin: 0,
      cylMax: 0.5,
    });

    await assert.rejects(
      () =>
        createLensProduct({
          familyId: family.id,
          baseId: baseHc.id,
          materialId: materialPoly.id,
          indexId: index.id,
          colorId: color.id,
          powerRangeIds: [smallRange.id],
          actorUserId: admin.id,
        }),
      (err: unknown) =>
        err instanceof LensProductServiceError &&
        err.code === "INCOMPATIBLE_BASE_MATERIAL"
    );

    const { buildLensProductSkuCode } = await import(
      "@/app/lib/catalog/lens-product-sku"
    );
    // Isolate from leftover browser/e2e parents with the same attrs.
    await prisma.lensProduct.deleteMany({
      where: {
        familyId: family.id,
        baseId: baseHc.id,
        materialId: materialPlain.id,
        indexId: index.id,
        colorId: color.id,
      },
    });

    const sphMax = 0.25 + (RUN_TAG % 10) * 0.25;
    const range = await ensureRange({
      sphMin: 0,
      sphMax,
      cylMin: 0,
      cylMax: 0.5,
    });
    const product = await createLensProduct({
      familyId: family.id,
      baseId: baseHc.id,
      materialId: materialPlain.id,
      indexId: index.id,
      colorId: color.id,
      powerRangeIds: [range.id],
      actorUserId: admin.id,
    });
    createdProductIds.push(product.id);
    assert.equal(product.variants.length, 1);
    assert.equal(product.variants[0].powerRangeId, range.id);

    const expectedSku = buildLensProductSkuCode({
      familyCode: "SV",
      baseCode: "HC",
      materialCode: "PLAIN",
      indexCode: index.code,
      colorCode: color.code,
      sphMin: 0,
      sphMax,
      cylMin: 0,
      cylMax: 0.5,
    });
    assert.equal(product.variants[0].skuCode, expectedSku);
    assert.match(product.attributeSummary, /SV/);
    assert.match(product.attributeSummary, /HC/);
    // CLIENT-PLAN name uses color display name, not SKU token alone.
    assert.match(product.variants[0].name, new RegExp(color.name, "i"));

    const fetched = await getLensProduct(product.id);
    assert.equal(fetched.id, product.id);
    assert.equal(fetched.variants[0].skuCode, expectedSku);

    const v = fetched.variants[0];
    const cells =
      steppedRange(v.sphMin, v.sphMax).length *
      steppedRange(v.cylMin, v.cylMax).length;
    assert.ok(cells >= 3, `expected matrix cells, got ${cells}`);
  });

  it("rejects duplicate parent+range; second range adds another variant", async () => {
    const { prisma } = await import("@/app/lib/prisma");
    const {
      createLensProduct,
      LensProductServiceError,
    } = await import("@/app/lib/catalog/lens-product-service");

    const admin = await prisma.user.findFirst({
      where: { role: "ADMIN", isActive: true },
      select: { id: true },
    });
    assert.ok(admin);
    const [family, base, material, index, color] = await Promise.all([
      prisma.lensFamily.findUnique({ where: { code: "SV" } }),
      prisma.lensBase.findUnique({ where: { code: "BRC" } }),
      prisma.lensMaterial.findUnique({ where: { code: "PLAIN" } }),
      prisma.lensIndex.findUnique({ where: { code: "1.56" } }),
      prisma.lensColor.findFirst({ where: { isActive: true } }),
    ]);
    assert.ok(family && base && material && index && color);

    const sphMin = -6 - (RUN_TAG % 5);
    const sphMax = sphMin + 2;
    const range = await ensureRange({ sphMin, sphMax, cylMin: -2, cylMax: 0 });
    const first = await createLensProduct({
      familyId: family.id,
      baseId: base.id,
      materialId: material.id,
      indexId: index.id,
      colorId: color.id,
      powerRangeIds: [range.id],
      actorUserId: admin.id,
    });
    createdProductIds.push(first.id);

    await assert.rejects(
      () =>
        createLensProduct({
          familyId: family.id,
          baseId: base.id,
          materialId: material.id,
          indexId: index.id,
          colorId: color.id,
          powerRangeIds: [range.id],
          actorUserId: admin.id,
        }),
      (err: unknown) =>
        err instanceof LensProductServiceError &&
        err.code === "DUPLICATE_VARIANT"
    );

    const widerRange = await ensureRange({
      sphMin,
      sphMax: sphMax + 2,
      cylMin: -2,
      cylMax: 0,
    });
    const second = await createLensProduct({
      familyId: family.id,
      baseId: base.id,
      materialId: material.id,
      indexId: index.id,
      colorId: color.id,
      powerRangeIds: [widerRange.id],
      actorUserId: admin.id,
    });
    assert.equal(second.id, first.id);
    assert.equal(second.variants.length, 2);
    const skus = second.variants.map((v) => v.skuCode);
    assert.equal(new Set(skus).size, 2);
  });

  it("allows parent without material and omits it from variant SKU", async () => {
    const { prisma } = await import("@/app/lib/prisma");
    const { createLensProduct } = await import(
      "@/app/lib/catalog/lens-product-service"
    );
    const admin = await prisma.user.findFirst({
      where: { role: "ADMIN", isActive: true },
      select: { id: true },
    });
    assert.ok(admin);
    const [family, base, index, color] = await Promise.all([
      prisma.lensFamily.findUnique({ where: { code: "SV" } }),
      prisma.lensBase.findUnique({ where: { code: "BRC" } }),
      prisma.lensIndex.findUnique({ where: { code: "1.56" } }),
      prisma.lensColor.findFirst({ where: { isActive: true } }),
    ]);
    assert.ok(family && base && index && color);

    const sphMin = -8 - (RUN_TAG % 5);
    const range = await ensureRange({
      sphMin,
      sphMax: sphMin + 1,
      cylMin: -1,
      cylMax: 0,
    });
    const product = await createLensProduct({
      familyId: family.id,
      baseId: base.id,
      materialId: null,
      indexId: index.id,
      colorId: color.id,
      powerRangeIds: [range.id],
      actorUserId: admin.id,
    });
    createdProductIds.push(product.id);
    assert.equal(product.materialId, null);
    assert.equal(product.material, null);
    assert.ok(product.variants[0].skuCode.startsWith("BRC-1P56-SV-"));
  });

  it("creates / lists a power range via the service", async () => {
    const { prisma } = await import("@/app/lib/prisma");
    const { createLensPowerRange, listLensPowerRanges, updateLensPowerRange } =
      await import("@/app/lib/catalog/lens-power-range-service");
    const admin = await prisma.user.findFirst({
      where: { role: "ADMIN", isActive: true },
      select: { id: true },
    });
    assert.ok(admin);

    const sphMin = -20 - (RUN_TAG % 5) * 0.5;
    const created = await createLensPowerRange({
      sphMin,
      sphMax: sphMin + 1,
      cylMin: -2,
      cylMax: 0,
      actorUserId: admin.id,
    });
    createdRangeIds.push(created.id);
    assert.match(created.label, /^-\d+\.\d{2}\/-\d+\.\d{2}$/);

    await updateLensPowerRange(created.id, {
      isActive: false,
      actorUserId: admin.id,
    });
    const active = await listLensPowerRanges(true);
    assert.ok(!active.some((r) => r.id === created.id));
  });
});
