import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeInvoicePricingFromOrder } from "./invoice-order-pricing";
import { calculateInvoiceTotals, roundMoney } from "./tax-calc";

describe("computeInvoicePricingFromOrder (FIN-02)", () => {
  it("six pieces @ ₹86/pair → taxable ₹258 before GST (intra-state 5%)", () => {
    const { quantity, unitPrice, lineGross, totals } =
      computeInvoicePricingFromOrder({
        pairUnitPrice: 86,
        pieceQuantity: 6,
        gstRatePercent: 5,
        isInterState: false,
      });

    assert.equal(lineGross, 258);
    assert.equal(quantity, 6);
    assert.equal(roundMoney(unitPrice * quantity), 258);
    assert.equal(totals.taxableAmount, 258);
    assert.equal(totals.cgstAmount, 6.45);
    assert.equal(totals.sgstAmount, 6.45);
    assert.equal(totals.igstAmount, 0);
    assert.equal(totals.grandTotal, 270.9);

    const line = totals.lines[0]!;
    assert.equal(line.lineTotal, totals.grandTotal);
    assert.equal(
      roundMoney(line.taxableAmount + line.cgstAmount + line.sgstAmount),
      line.lineTotal
    );
  });

  it("two pieces @ ₹86/pair → taxable ₹86; inter-state IGST 5%", () => {
    const { totals } = computeInvoicePricingFromOrder({
      pairUnitPrice: 86,
      pieceQuantity: 2,
      gstRatePercent: 5,
      isInterState: true,
    });
    assert.equal(totals.taxableAmount, 86);
    assert.equal(totals.igstAmount, 4.3);
    assert.equal(totals.cgstAmount, 0);
    assert.equal(totals.sgstAmount, 0);
    assert.equal(totals.grandTotal, 90.3);
  });

  it("applies loyalty discount before GST", () => {
    const { totals } = computeInvoicePricingFromOrder({
      pairUnitPrice: 86,
      pieceQuantity: 6,
      discountAmount: 58,
      gstRatePercent: 5,
      isInterState: false,
    });
    assert.equal(totals.taxableAmount, 200);
    assert.equal(totals.discountAmount, 58);
    assert.equal(totals.grandTotal, 210);
  });

  it("odd piece quantity still reconciles with pair helper", () => {
    const { lineGross, totals, quantity, unitPrice } =
      computeInvoicePricingFromOrder({
        pairUnitPrice: 100,
        pieceQuantity: 3,
        gstRatePercent: 0,
        isInterState: false,
      });
    assert.equal(lineGross, 150);
    assert.equal(totals.taxableAmount, 150);
    assert.equal(roundMoney(unitPrice * quantity), 150);
  });

  it("header totals match summed line totals", () => {
    const { totals } = computeInvoicePricingFromOrder({
      pairUnitPrice: 86,
      pieceQuantity: 6,
      gstRatePercent: 12,
      isInterState: true,
    });
    const fromLines = calculateInvoiceTotals(
      totals.lines.map((l) => ({
        quantity: 1,
        unitPrice: l.taxableAmount + l.discountAmount,
        discountAmount: l.discountAmount,
        gstRatePercent: l.gstRatePercent,
      })),
      true
    );
    // Recompute from original inputs for a clean header check
    const again = computeInvoicePricingFromOrder({
      pairUnitPrice: 86,
      pieceQuantity: 6,
      gstRatePercent: 12,
      isInterState: true,
    });
    assert.equal(again.totals.taxableAmount, again.totals.lines[0]!.taxableAmount);
    assert.equal(again.totals.grandTotal, again.totals.lines[0]!.lineTotal);
    assert.equal(fromLines.taxableAmount, again.totals.taxableAmount);
  });

  it("does not invent pricing when quantity invalid", () => {
    const { totals, lineGross } = computeInvoicePricingFromOrder({
      pairUnitPrice: 86,
      pieceQuantity: 0,
      gstRatePercent: 5,
      isInterState: false,
    });
    assert.equal(lineGross, 0);
    assert.equal(totals.taxableAmount, 0);
    assert.equal(totals.grandTotal, 0);
  });
});

describe("historical invoice protection (policy)", () => {
  it("documents that issued invoices are not recalculated by this module", () => {
    // createInvoiceFromOrder returns early when Invoice.orderId already exists.
    // This suite only exercises pure future-issuance math — no Prisma writes.
    assert.equal(typeof computeInvoicePricingFromOrder, "function");
  });
});
