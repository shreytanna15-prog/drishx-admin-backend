import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeLoyaltyReversePoints } from "./reverse-policy";

describe("computeLoyaltyReversePoints (cumulative returns)", () => {
  it("first return uses remaining = original (no prior)", () => {
    // 100 pts on ₹1000 taxable; return ₹400 taxable → 40 pts
    assert.equal(
      computeLoyaltyReversePoints({
        originalTaxable: 1000,
        priorReturnedTaxable: 0,
        returnedTaxable: 400,
        remainingPoints: 100,
      }),
      40
    );
  });

  it("second return uses remaining taxable/points, not original base", () => {
    // After first reverse: 60 pts left, ₹600 taxable left; return ₹300 → 30 pts
    // Bug form remainingPoints × returned/original would give 60×300/1000 = 18.
    assert.equal(
      computeLoyaltyReversePoints({
        originalTaxable: 1000,
        priorReturnedTaxable: 400,
        returnedTaxable: 300,
        remainingPoints: 60,
      }),
      30
    );
  });

  it("caps returned taxable to remaining taxable", () => {
    assert.equal(
      computeLoyaltyReversePoints({
        originalTaxable: 1000,
        priorReturnedTaxable: 800,
        returnedTaxable: 500,
        remainingPoints: 20,
      }),
      20
    );
  });

  it("returns 0 when earn already depleted", () => {
    assert.equal(
      computeLoyaltyReversePoints({
        originalTaxable: 1000,
        priorReturnedTaxable: 500,
        returnedTaxable: 200,
        remainingPoints: 0,
      }),
      0
    );
  });

  it("two successive returns reverse 100% of earn (no cumulative under-calc)", () => {
    const first = computeLoyaltyReversePoints({
      originalTaxable: 1000,
      priorReturnedTaxable: 0,
      returnedTaxable: 400,
      remainingPoints: 100,
    });
    const second = computeLoyaltyReversePoints({
      originalTaxable: 1000,
      priorReturnedTaxable: 400,
      returnedTaxable: 600,
      remainingPoints: 100 - first,
    });
    assert.equal(first + second, 100);
  });
});
