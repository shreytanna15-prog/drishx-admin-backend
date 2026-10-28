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
const RUN_TAG = Date.now();

describe("lens catalog integration", { skip: !RUN }, () => {
  before(async () => {
    const { prisma } = await import("@/app/lib/prisma");
    await prisma.lensProduct.deleteMany({
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

  it("creates LensProduct with compatible base/material and rejects bad material", async () => {
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

    const [family, baseHc, materialPlain, materialPoly, index] =
      await Promise.all([
        prisma.lensFamily.findUnique({ where: { code: "SV" } }),
        prisma.lensBase.findUnique({ where: { code: "HC" } }),
        prisma.lensMaterial.findUnique({ where: { code: "PLAIN" } }),
        prisma.lensMaterial.findUnique({ where: { code: "POLY" } }),
        prisma.lensIndex.findUnique({ where: { code: "1.56" } }),
      ]);
    assert.ok(family && baseHc && materialPlain && materialPoly && index);

    await assert.rejects(
      () =>
        createLensProduct({
          name: "Should fail POLY under HC",
          familyId: family.id,
          baseId: baseHc.id,
          materialId: materialPoly.id,
          indexId: index.id,
          sphMin: 0,
          sphMax: 1,
          cylMin: 0,
          cylMax: 0.5,
          actorUserId: admin.id,
        }),
      (err: unknown) =>
        err instanceof LensProductServiceError &&
        err.code === "INCOMPATIBLE_BASE_MATERIAL"
    );

    const { buildLensProductSkuCode } = await import(
      "@/app/lib/catalog/lens-product-sku"
    );
    // Unique band per run so duplicate-combo guard does not collide
    const sphMax = 0.25 + (RUN_TAG % 10) * 0.25;
    const product = await createLensProduct({
      name: "E2E HC Plain SV",
      familyId: family.id,
      baseId: baseHc.id,
      materialId: materialPlain.id,
      indexId: index.id,
      sphMin: 0,
      sphMax,
      cylMin: 0,
      cylMax: 0.5,
      actorUserId: admin.id,
    });
    createdProductIds.push(product.id);

    const expectedSku = buildLensProductSkuCode({
      familyCode: "SV",
      baseCode: "HC",
      materialCode: "PLAIN",
      indexCode: index.code,
      sphMin: 0,
      sphMax,
      cylMin: 0,
      cylMax: 0.5,
    });
    assert.equal(product.skuCode, expectedSku);
    assert.match(product.attributeSummary, /SV/);
    assert.match(product.attributeSummary, /HC/);

    const fetched = await getLensProduct(product.id);
    assert.equal(fetched.id, product.id);
    assert.equal(fetched.skuCode, expectedSku);

    const cells =
      steppedRange(fetched.sphMin, fetched.sphMax).length *
      steppedRange(fetched.cylMin, fetched.cylMax).length;
    assert.ok(cells >= 3, `expected matrix cells, got ${cells}`);
  });

  it("rejects duplicate attribute combo + range", async () => {
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
    const [family, base, material] = await Promise.all([
      prisma.lensFamily.findUnique({ where: { code: "SV" } }),
      prisma.lensBase.findUnique({ where: { code: "BRC" } }),
      prisma.lensMaterial.findUnique({ where: { code: "PLAIN" } }),
    ]);
    assert.ok(family && base && material);

    // Unique band per run
    const sphMin = -6 - (RUN_TAG % 5);
    const sphMax = sphMin + 2;
    const first = await createLensProduct({
      name: "Dup A",
      familyId: family.id,
      baseId: base.id,
      materialId: material.id,
      sphMin,
      sphMax,
      cylMin: -2,
      cylMax: 0,
      actorUserId: admin.id,
    });
    createdProductIds.push(first.id);

    await assert.rejects(
      () =>
        createLensProduct({
          name: "Dup B",
          familyId: family.id,
          baseId: base.id,
          materialId: material.id,
          sphMin,
          sphMax,
          cylMin: -2,
          cylMax: 0,
          actorUserId: admin.id,
        }),
      (err: unknown) =>
        err instanceof LensProductServiceError &&
        err.code === "DUPLICATE_COMBO_RANGE"
    );
  });
});
