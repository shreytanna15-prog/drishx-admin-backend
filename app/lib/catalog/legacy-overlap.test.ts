import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { LegacyLensLeaf } from "./legacy-leaves-types";
import { findLegacyOverlaps } from "./legacy-overlap-pure";
import {
  enumeratePowerCells,
  normalizeAxisBounds,
} from "./range-math";

function leaf(
  partial: Partial<LegacyLensLeaf> & { id: string }
): LegacyLensLeaf {
  const bounds =
    partial.bounds ??
    (partial.sph != null
      ? {
          sph: normalizeAxisBounds(
            partial.sphStartRange ?? 0,
            partial.sph
          ),
          cyl:
            partial.cyl != null
              ? normalizeAxisBounds(
                  partial.cylStartRange ?? 0,
                  partial.cyl
                )
              : null,
        }
      : null);
  return {
    id: partial.id,
    lensFamily: partial.lensFamily ?? "SINGLE_VISION",
    category: partial.category ?? null,
    brand: partial.brand ?? "Brand",
    item: partial.item ?? null,
    index: partial.index ?? 1.56,
    coating: partial.coating ?? "Green",
    progressiveType: partial.progressiveType ?? null,
    sph: partial.sph ?? -6,
    sphStartRange: partial.sphStartRange ?? 0,
    cyl: partial.cyl ?? -2,
    cylStartRange: partial.cylStartRange ?? 0,
    crossPower: partial.crossPower ?? null,
    add: partial.add ?? null,
    axis: partial.axis ?? null,
    eye: partial.eye ?? null,
    price: partial.price ?? 100,
    costPrice: partial.costPrice ?? null,
    quantity: partial.quantity ?? 10,
    isDisabled: partial.isDisabled ?? false,
    identityKey: partial.identityKey ?? "SV||Brand||1.56|Green",
    bounds,
  };
}

describe("findLegacyOverlaps", () => {
  it("rejects exact duplicate of legacy band", () => {
    const requested = {
      sph: normalizeAxisBounds(0, -6),
      cyl: normalizeAxisBounds(0, -2),
    };
    const hit = findLegacyOverlaps(
      requested,
      enumeratePowerCells(requested),
      [leaf({ id: "leg1", sph: -6, sphStartRange: 0, cyl: -2, cylStartRange: 0 })]
    );
    assert.ok(hit);
    assert.equal(hit!.leafId, "leg1");
  });

  it("rejects partial overlap including shared boundary", () => {
    const requested = {
      sph: normalizeAxisBounds(-5, -8),
      cyl: normalizeAxisBounds(0, -2),
    };
    const hit = findLegacyOverlaps(
      requested,
      enumeratePowerCells(requested),
      [leaf({ id: "leg2", sph: -6, sphStartRange: 0, cyl: -2, cylStartRange: 0 })]
    );
    assert.ok(hit);
  });

  it("allows non-overlapping chained range", () => {
    const requested = {
      sph: normalizeAxisBounds(-6.25, -8),
      cyl: normalizeAxisBounds(0, -2),
    };
    const hit = findLegacyOverlaps(
      requested,
      enumeratePowerCells(requested),
      [leaf({ id: "leg3", sph: -6, sphStartRange: 0, cyl: -2, cylStartRange: 0 })]
    );
    assert.equal(hit, null);
  });

  it("ignores KT leaves with different ADD", () => {
    const requested = {
      sph: normalizeAxisBounds(0, -2),
      cyl: normalizeAxisBounds(0, -1),
    };
    const hit = findLegacyOverlaps(
      requested,
      enumeratePowerCells(requested),
      [
        leaf({
          id: "kt1",
          lensFamily: "KRYPTOK",
          add: 2,
          sph: -2,
          sphStartRange: 0,
          cyl: -1,
          cylStartRange: 0,
        }),
      ],
      { add: 1.5 }
    );
    assert.equal(hit, null);
  });

  it("flags KT leaves with matching ADD", () => {
    const requested = {
      sph: normalizeAxisBounds(0, -2),
      cyl: normalizeAxisBounds(0, -1),
    };
    const hit = findLegacyOverlaps(
      requested,
      enumeratePowerCells(requested),
      [
        leaf({
          id: "kt2",
          lensFamily: "KRYPTOK",
          add: 2,
          sph: -2,
          sphStartRange: 0,
          cyl: -1,
          cylStartRange: 0,
        }),
      ],
      { add: 2 }
    );
    assert.ok(hit);
  });
});
