import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyTierDiscount,
  buildOrderTierSnapshot,
  tierDiscountAmount,
} from "./pricing-tier-math";

describe("applyTierDiscount", () => {
  it("applies percent before rounding", () => {
    assert.equal(applyTierDiscount(1000, 10), 900);
    assert.equal(tierDiscountAmount(1000, 10), 100);
  });

  it("clamps percent to 0..100", () => {
    assert.equal(applyTierDiscount(100, -5), 100);
    assert.equal(applyTierDiscount(100, 150), 0);
  });
});

describe("buildOrderTierSnapshot", () => {
  it("snapshots tier fields", () => {
    const snap = buildOrderTierSnapshot(
      { id: "t", code: "A", discountPercent: 5, isBase: false },
      2000
    );
    assert.equal(snap.tierCode, "A");
    assert.equal(snap.tierDiscountPercent, 5);
    assert.equal(snap.tierDiscountAmount, 100);
    assert.equal(snap.totalAfterTier, 1900);
  });
});
