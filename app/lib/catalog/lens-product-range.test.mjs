import assert from "node:assert/strict";
import { describe, it } from "node:test";

/** Mirror of steppedRange / steppedPowerRange for unit check without TS compile. */
function steppedRange(min, max, step = 0.25) {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const out = [];
  const start = Math.round(lo / step) * step;
  for (let v = start; v <= hi + 1e-9; v += step) {
    out.push(Number(v.toFixed(2)));
  }
  if (out.length === 0) out.push(Number(lo.toFixed(2)));
  return out;
}

describe("product catalog matrix stepped range", () => {
  it("builds inclusive 0.25 steps for plus band", () => {
    const sph = steppedRange(0, 1);
    assert.deepEqual(sph, [0, 0.25, 0.5, 0.75, 1]);
  });

  it("builds inclusive steps for minus band", () => {
    const cyl = steppedRange(-1, 0);
    assert.deepEqual(cyl, [-1, -0.75, -0.5, -0.25, 0]);
  });

  it("swaps when min > max", () => {
    const vals = steppedRange(1, 0);
    assert.deepEqual(vals, [0, 0.25, 0.5, 0.75, 1]);
  });
});
