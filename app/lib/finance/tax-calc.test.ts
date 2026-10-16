import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calculateInvoiceTotals, calculateTaxLine, roundMoney } from "./tax-calc";

describe("tax-calc", () => {
  it("rounds money to paise", () => {
    assert.equal(roundMoney(1.005), 1.01);
    assert.equal(roundMoney(1.004), 1);
  });

  it("splits CGST/SGST for intra-state", () => {
    const line = calculateTaxLine(
      { quantity: 6, unitPrice: 43, gstRatePercent: 5 },
      false
    );
    assert.equal(line.taxableAmount, 258);
    assert.equal(line.cgstAmount + line.sgstAmount, 12.9);
    assert.equal(line.igstAmount, 0);
    assert.equal(line.lineTotal, 270.9);
  });

  it("uses IGST for inter-state", () => {
    const line = calculateTaxLine(
      { quantity: 2, unitPrice: 43, gstRatePercent: 5 },
      true
    );
    assert.equal(line.taxableAmount, 86);
    assert.equal(line.igstAmount, 4.3);
    assert.equal(line.lineTotal, 90.3);
  });

  it("invoice header reconciles with lines", () => {
    const totals = calculateInvoiceTotals(
      [{ quantity: 6, unitPrice: 43, gstRatePercent: 5 }],
      false
    );
    assert.equal(totals.taxableAmount, totals.lines[0]!.taxableAmount);
    assert.equal(totals.grandTotal, totals.lines[0]!.lineTotal);
  });
});
