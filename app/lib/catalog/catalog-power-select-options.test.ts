import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  POWER_SELECT_VALUES,
  formatCylSummary,
  formatPowerLabel,
  formatPowerRangeLabel,
  getPowerSelectOptions,
  isAllowedPowerValue,
  validatePowerRangeBounds,
} from "./catalog-power-select-options";

describe("catalog power select options", () => {
  it("spans −40 … +8 ascending without duplicates", () => {
    assert.equal(POWER_SELECT_VALUES[0], -40);
    assert.equal(POWER_SELECT_VALUES[POWER_SELECT_VALUES.length - 1], 8);
    for (let i = 1; i < POWER_SELECT_VALUES.length; i++) {
      assert.ok(POWER_SELECT_VALUES[i] > POWER_SELECT_VALUES[i - 1]);
    }
    // 49 values (−40…−16 @0.5) + 80+... computed explicitly
    // −40…−16 step .5 => 49; −15.75…4 step .25 => 80; 4.5…8 step .5 => 8
    assert.equal(POWER_SELECT_VALUES.length, 49 + 80 + 8);
  });

  it("uses the stepped bands", () => {
    const set = new Set(POWER_SELECT_VALUES);
    // 0.5 band below −16
    assert.ok(set.has(-40));
    assert.ok(set.has(-39.5));
    assert.ok(!set.has(-39.75));
    assert.ok(set.has(-16));
    // 0.25 band
    assert.ok(set.has(-15.75));
    assert.ok(set.has(-6));
    assert.ok(set.has(-0.25));
    assert.ok(set.has(0));
    assert.ok(set.has(1.25));
    assert.ok(set.has(4));
    // 0.5 band above +4
    assert.ok(!set.has(4.25));
    assert.ok(set.has(4.5));
    assert.ok(set.has(8));
    assert.ok(!set.has(8.5));
  });

  it("validates allowed values", () => {
    assert.equal(isAllowedPowerValue(-4.25), true);
    assert.equal(isAllowedPowerValue(-16.25), false);
    assert.equal(isAllowedPowerValue(4.25), false);
    assert.equal(isAllowedPowerValue(41), false);
    assert.equal(isAllowedPowerValue(Number.NaN), false);
  });

  it("formats labels like -6.00/+2.00", () => {
    assert.equal(formatPowerLabel(-6), "-6.00");
    assert.equal(formatPowerLabel(2), "+2.00");
    assert.equal(formatPowerLabel(0), "0.00");
    assert.equal(formatPowerLabel(-0.25), "-0.25");
    assert.equal(formatPowerRangeLabel(-6, 2), "-6.00/+2.00");
    assert.equal(formatPowerRangeLabel(2, -6), "-6.00/+2.00");
  });

  it("formats CYL summary beside the SPH label", () => {
    assert.equal(formatCylSummary(-2, 0), "Cyl 0.00/-2.00");
    assert.equal(formatCylSummary(0, -2), "Cyl 0.00/-2.00");
    assert.equal(formatCylSummary(0, 4), "Cyl 0.00/+4.00");
  });

  it("builds select options with string values and labels", () => {
    const opts = getPowerSelectOptions();
    assert.equal(opts.length, POWER_SELECT_VALUES.length);
    assert.deepEqual(opts[0], { value: "-40", label: "-40.00" });
    assert.ok(opts.some((o) => o.value === "0" && o.label === "0.00"));
  });

  it("validates range bounds", () => {
    assert.equal(
      validatePowerRangeBounds({ sphMin: -6, sphMax: 2, cylMin: -2, cylMax: 0 }),
      null
    );
    assert.match(
      validatePowerRangeBounds({ sphMin: 2, sphMax: -6, cylMin: -2, cylMax: 0 })!,
      /sphMin/
    );
    assert.match(
      validatePowerRangeBounds({ sphMin: -6, sphMax: 2, cylMin: 0, cylMax: -2 })!,
      /cylMin/
    );
    assert.match(
      validatePowerRangeBounds({ sphMin: -6.1, sphMax: 2, cylMin: -2, cylMax: 0 })!,
      /sphMin/
    );
  });
});
