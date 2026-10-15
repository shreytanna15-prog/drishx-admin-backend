import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { planLegacyCatalogBackfill } from "./legacy-backfill-plan";
import type { LegacyProductGroup } from "./legacy-leaves-types";
import { normalizeAxisBounds } from "./range-math";

function group(partial: {
  identityKey: string;
  leaves: Array<{
    id: string;
    sph: number;
    cyl: number | null;
    quantity?: number;
    price?: number;
  }>;
}): LegacyProductGroup {
  return {
    identityKey: partial.identityKey,
    lensFamily: "SINGLE_VISION",
    category: null,
    brand: "Brand",
    item: null,
    index: 1.56,
    coating: "Green",
    progressiveType: null,
    leafCount: partial.leaves.length,
    leaves: partial.leaves.map((l) => ({
      id: l.id,
      lensFamily: "SINGLE_VISION" as const,
      category: null,
      brand: "Brand",
      item: null,
      index: 1.56,
      coating: "Green",
      progressiveType: null,
      sph: l.sph,
      sphStartRange: 0,
      cyl: l.cyl,
      cylStartRange: l.cyl != null ? 0 : null,
      crossPower: null,
      add: null,
      axis: null,
      eye: null,
      price: l.price ?? 100,
      costPrice: null,
      quantity: l.quantity ?? 5,
      isDisabled: false,
      identityKey: partial.identityKey,
      bounds: {
        sph: normalizeAxisBounds(0, l.sph),
        cyl:
          l.cyl != null ? normalizeAxisBounds(0, l.cyl) : null,
      },
    })),
  };
}

describe("planLegacyCatalogBackfill (dry-run pure)", () => {
  it("reports products to create and ranges to link", () => {
    const report = planLegacyCatalogBackfill({
      groups: [
        group({
          identityKey: "SV||Brand||1.56|Green",
          leaves: [
            { id: "a", sph: -6, cyl: -2, quantity: 12 },
            { id: "b", sph: -8, cyl: -2, quantity: 3 },
          ],
        }),
      ],
      linkedLensKeys: new Set(),
      existingProductsByIdentity: new Map(),
    });

    assert.equal(report.mode, "dry-run");
    assert.equal(report.inspectedLensRows, 2);
    assert.equal(report.productGroupsIdentified, 1);
    assert.equal(report.productsWouldCreate, 1);
    assert.equal(report.rangesWouldLink, 2);
    assert.equal(report.rangesAlreadyLinked, 0);
    assert.equal(report.products[0]!.ranges.every((r) => r.quantity > 0), true);
    assert.equal(
      report.products[0]!.ranges.every(
        (r) => r.leafStorage === "LEGACY_BAND"
      ),
      true
    );
  });

  it("is idempotent for already-linked leaves", () => {
    const identityKey = "SV||Brand||1.56|Green";
    const report = planLegacyCatalogBackfill({
      groups: [
        group({
          identityKey,
          leaves: [{ id: "a", sph: -6, cyl: -2 }],
        }),
      ],
      linkedLensKeys: new Set(["SINGLE_VISION:a"]),
      existingProductsByIdentity: new Map([[identityKey, "prod1"]]),
    });

    assert.equal(report.productsWouldCreate, 0);
    assert.equal(report.productsAlreadyExist, 1);
    assert.equal(report.rangesWouldLink, 0);
    assert.equal(report.rangesAlreadyLinked, 1);
    assert.equal(report.products[0]!.ranges[0]!.alreadyLinked, true);
  });

  it("does not invent stock splits — preserves leaf quantities", () => {
    const report = planLegacyCatalogBackfill({
      groups: [
        group({
          identityKey: "SV||X||1.56|Y",
          leaves: [{ id: "band", sph: -6, cyl: -2, quantity: 40 }],
        }),
      ],
      linkedLensKeys: new Set(),
      existingProductsByIdentity: new Map(),
    });
    assert.equal(report.products[0]!.ranges[0]!.quantity, 40);
    assert.equal(report.products[0]!.ranges.length, 1);
  });
});
