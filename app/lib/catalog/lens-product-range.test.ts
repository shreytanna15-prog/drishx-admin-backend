import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { steppedRange } from "./lens-product-range";

describe("LensProduct steppedRange (matrix UI)", () => {
  it("builds inclusive 0.25 steps for a plus band", () => {
    assert.deepEqual(steppedRange(0, 1), [0, 0.25, 0.5, 0.75, 1]);
  });

  it("builds inclusive steps for a minus band", () => {
    assert.deepEqual(steppedRange(-1, 0), [-1, -0.75, -0.5, -0.25, 0]);
  });

  it("normalizes when min > max", () => {
    assert.deepEqual(steppedRange(1, 0), [0, 0.25, 0.5, 0.75, 1]);
  });

  it("matches expected SPH×CYL cell count for sample range", () => {
    const sph = steppedRange(0, 2);
    const cyl = steppedRange(0, 1);
    assert.equal(sph.length, 9);
    assert.equal(cyl.length, 5);
    assert.equal(sph.length * cyl.length, 45);
  });
});
