import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MAX_MATRIX_POWERS,
  assertRangeSizeAllowed,
  normalizeAxisBounds,
} from "./range-math";

describe("assertRangeSizeAllowed", () => {
  it("rejects oversized matrices", () => {
    // Wide compound band will exceed MAX_MATRIX_POWERS
    assert.throws(
      () =>
        assertRangeSizeAllowed({
          sph: normalizeAxisBounds(20, -20),
          cyl: normalizeAxisBounds(10, -10),
        }),
      (err: unknown) =>
        err instanceof Error && err.message.includes(String(MAX_MATRIX_POWERS))
    );
  });

  it("allows a normal -6×2 band", () => {
    assert.doesNotThrow(() =>
      assertRangeSizeAllowed({
        sph: normalizeAxisBounds(0, -6),
        cyl: normalizeAxisBounds(0, -2),
      })
    );
  });
});
