import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { calcDeliveryPricing, sumPackageWeights, toChargeableWeight } from "./delivery-calc";

describe("delivery-calc", () => {
  it("rounds up to next kg (2.4 -> 3)", () => {
    assert.equal(toChargeableWeight(2.4, "NEXT_1KG", 1), 3);
    assert.equal(toChargeableWeight(2.0, "NEXT_1KG", 1), 2);
    assert.equal(toChargeableWeight(2.01, "NEXT_1KG", 1), 3);
  });

  it("half-kg rounding (2.4 -> 2.5)", () => {
    assert.equal(toChargeableWeight(2.4, "NEXT_0_5KG", 1), 2.5);
  });

  it("enforces minimum weight", () => {
    assert.equal(toChargeableWeight(0.3, "NEXT_1KG", 1), 1);
  });

  it("Sri Raj Land: 2.4kg -> 150/105/45", () => {
    const r = calcDeliveryPricing({ actualWeight: 2.4, customerRate: 50, internalCostRate: 35, weightRounding: "NEXT_1KG", minWeight: 1 });
    assert.deepEqual(r, { actualWeight: 2.4, chargeableWeight: 3, customerCharge: 150, internalCost: 105, margin: 45 });
  });

  it("Sri Raj Air: 2.4kg -> 360/300/60", () => {
    const r = calcDeliveryPricing({ actualWeight: 2.4, customerRate: 120, internalCostRate: 100, weightRounding: "NEXT_1KG", minWeight: 1 });
    assert.deepEqual(r, { actualWeight: 2.4, chargeableWeight: 3, customerCharge: 360, internalCost: 300, margin: 60 });
  });

  it("sums multi-package weights", () => {
    assert.equal(sumPackageWeights([{ weight: 1.8 }, { weight: 1.2 }]), 3);
  });
});
