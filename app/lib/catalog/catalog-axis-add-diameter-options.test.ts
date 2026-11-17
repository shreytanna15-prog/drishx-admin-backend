import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ADDITION_SELECT_VALUES,
  AXIS_SELECT_VALUES,
  DIAMETER_SELECT_VALUES,
  additionCodeFromValue,
  axisCodeFromValue,
  diameterCodeFromValue,
  formatAdditionLabel,
  formatAxisLabel,
  formatDiameterLabel,
  isAllowedAdditionValue,
  isAllowedAxisValue,
  isAllowedDiameterValue,
} from "./catalog-axis-add-diameter-options";

describe("catalog axis / addition / diameter options", () => {
  it("axis spans 10…180 step 10 plus 45 and 135", () => {
    assert.equal(AXIS_SELECT_VALUES[0], 10);
    assert.equal(AXIS_SELECT_VALUES[AXIS_SELECT_VALUES.length - 1], 180);
    assert.ok(AXIS_SELECT_VALUES.includes(45));
    assert.ok(AXIS_SELECT_VALUES.includes(135));
    assert.ok(AXIS_SELECT_VALUES.includes(90));
    assert.ok(!AXIS_SELECT_VALUES.includes(-45));
    assert.equal(isAllowedAxisValue(45), true);
    assert.equal(isAllowedAxisValue(12), false);
    assert.equal(formatAxisLabel(90), "90");
    assert.equal(axisCodeFromValue(90), "A90");
  });

  it("addition includes 0 and 0.25…6.00", () => {
    assert.equal(ADDITION_SELECT_VALUES[0], 0);
    assert.equal(ADDITION_SELECT_VALUES[ADDITION_SELECT_VALUES.length - 1], 6);
    assert.ok(ADDITION_SELECT_VALUES.includes(0.25));
    assert.ok(ADDITION_SELECT_VALUES.includes(3));
    assert.equal(isAllowedAdditionValue(0), true);
    assert.equal(isAllowedAdditionValue(3), true);
    assert.equal(isAllowedAdditionValue(6.25), false);
    assert.equal(formatAdditionLabel(0), "0.00");
    assert.equal(formatAdditionLabel(3), "+3.00");
    assert.equal(additionCodeFromValue(3), "ADD_3P00");
  });

  it("diameter spans 55…120 step 5", () => {
    assert.equal(DIAMETER_SELECT_VALUES[0], 55);
    assert.equal(DIAMETER_SELECT_VALUES[DIAMETER_SELECT_VALUES.length - 1], 120);
    assert.ok(DIAMETER_SELECT_VALUES.includes(65));
    assert.ok(!DIAMETER_SELECT_VALUES.includes(57));
    assert.equal(isAllowedDiameterValue(70), true);
    assert.equal(isAllowedDiameterValue(71), false);
    assert.equal(formatDiameterLabel(65), "65mm");
    assert.equal(diameterCodeFromValue(65), "D65");
  });
});
