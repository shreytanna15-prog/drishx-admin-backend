import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cellOverlapsRange,
  enumeratePowerCells,
  normalizeAxisBounds,
  toExactPowerLeafFields,
} from "./range-math";

describe("enumeratePowerCells (Option 1B)", () => {
  it("enumerates 0.25-step SV compound cells excluding plano", () => {
    const cells = enumeratePowerCells({
      sph: normalizeAxisBounds(0, -1),
      cyl: normalizeAxisBounds(0, -0.5),
    });
    // SPH: -0.25,-0.5,-0.75,-1 (4); CYL: -0.25,-0.5 (2) → 8
    assert.equal(cells.length, 8);
    assert.ok(cells.every((c) => c.cyl != null && Math.abs(c.sph) > 0));
    assert.ok(cells.some((c) => c.sph === -0.25 && c.cyl === -0.25));
    assert.ok(cells.some((c) => c.sph === -1 && c.cyl === -0.5));
  });

  it("includes positive and negative powers on inclusive bounds", () => {
    const cells = enumeratePowerCells({
      sph: normalizeAxisBounds(-0.5, 0.5),
      cyl: null,
    });
    // Mixed ranges enumerate high→low (shop generatePowerOptions convention).
    assert.deepEqual(
      cells.map((c) => c.sph),
      [0.5, 0.25, 0, -0.25, -0.5]
    );
    assert.equal(new Set(cells.map((c) => c.sph)).size, 5);
  });

  it("has no duplicate cells", () => {
    const cells = enumeratePowerCells({
      sph: normalizeAxisBounds(0, -2),
      cyl: normalizeAxisBounds(0, -1),
    });
    const keys = cells.map((c) => `${c.sph}|${c.cyl}`);
    assert.equal(keys.length, new Set(keys).size);
  });

  it("maps exact-power leaf fields with start=end", () => {
    const fields = toExactPowerLeafFields({ sph: -1.25, cyl: -0.75 });
    assert.equal(fields.sph, -1.25);
    assert.equal(fields.sphStartRange, -1.25);
    assert.equal(fields.cyl, -0.75);
    assert.equal(fields.cylStartRange, -0.75);
  });

  it("detects exact cell inside legacy band", () => {
    const band = {
      sph: normalizeAxisBounds(0, -6),
      cyl: normalizeAxisBounds(0, -2),
    };
    assert.equal(cellOverlapsRange({ sph: -3, cyl: -1 }, band), true);
    assert.equal(cellOverlapsRange({ sph: -6.25, cyl: -1 }, band), false);
  });
});
