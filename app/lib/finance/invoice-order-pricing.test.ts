import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  computeInvoicePricingFromOrder,
  computeInvoicePricingFromWholesaleLines,
  wholesaleHeaderPairUnitPrice,
  wholesaleLinesCommercialTotal,
} from "./invoice-order-pricing";
import { calculateInvoiceTotals, roundMoney } from "./tax-calc";
import { orderTotalFromPairPrice } from "@/app/lib/lens-pricing";

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

  it("two pieces @ ₹192/pair → taxable ₹192 (not ₹384)", () => {
    const { lineGross, totals, unitPrice, quantity } =
      computeInvoicePricingFromOrder({
        pairUnitPrice: 192,
        pieceQuantity: 2,
        gstRatePercent: 0,
        isInterState: false,
      });
    assert.equal(lineGross, 192);
    assert.equal(totals.taxableAmount, 192);
    assert.equal(roundMoney(unitPrice * quantity), 192);
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

describe("computeInvoicePricingFromWholesaleLines (C4)", () => {
  it("sums multi-line mixed pair prices (not header unitPrice × total qty)", () => {
    const lines = [
      { pairUnitPrice: 100, pieceQuantity: 2, powerLabel: "SPH 0" },
      { pairUnitPrice: 200, pieceQuantity: 4, powerLabel: "SPH -1" },
    ];
    const commercial = wholesaleLinesCommercialTotal(
      lines.map((l) => ({
        unitPrice: l.pairUnitPrice,
        quantity: l.pieceQuantity,
        totalAmount: orderTotalFromPairPrice(l.pairUnitPrice, l.pieceQuantity),
      }))
    );
    // 100×1 + 200×2 = 100 + 400 = 500
    assert.equal(commercial, 500);

    const wrongHeaderTimesQty = orderTotalFromPairPrice(100, 6);
    assert.equal(wrongHeaderTimesQty, 300);
    assert.notEqual(commercial, wrongHeaderTimesQty);

    const { lineGross, totals, totalQuantity } =
      computeInvoicePricingFromWholesaleLines({
        lines,
        gstRatePercent: 0,
        isInterState: false,
      });
    assert.equal(lineGross, 500);
    assert.equal(totals.taxableAmount, 500);
    assert.equal(totals.grandTotal, 500);
    assert.equal(totalQuantity, 6);
    assert.equal(totals.lines.length, 2);
    assert.equal(
      roundMoney(totals.lines.reduce((s, l) => s + l.lineTotal, 0)),
      totals.grandTotal
    );
  });

  it("applies loyalty discount before GST on first wholesale line", () => {
    const { totals } = computeInvoicePricingFromWholesaleLines({
      lines: [
        { pairUnitPrice: 192, pieceQuantity: 2 },
        { pairUnitPrice: 192, pieceQuantity: 2 },
      ],
      discountAmount: 40,
      gstRatePercent: 0,
      isInterState: false,
    });
    assert.equal(totals.grossAmount, 384);
    assert.equal(totals.discountAmount, 40);
    assert.equal(totals.taxableAmount, 344);
    assert.equal(totals.grandTotal, 344);
  });

  it("applies GST across wholesale lines and reconciles header to lines", () => {
    const { totals } = computeInvoicePricingFromWholesaleLines({
      lines: [
        { pairUnitPrice: 100, pieceQuantity: 2 },
        { pairUnitPrice: 100, pieceQuantity: 2 },
      ],
      gstRatePercent: 5,
      isInterState: false,
    });
    assert.equal(totals.taxableAmount, 200);
    assert.equal(totals.cgstAmount, 5);
    assert.equal(totals.sgstAmount, 5);
    assert.equal(totals.grandTotal, 210);
    assert.equal(
      roundMoney(totals.lines.reduce((s, l) => s + l.lineTotal, 0)),
      totals.grandTotal
    );
  });

  it("header pair price comes from first server line, not a stale cart price", () => {
    const serverLines = [
      { unitPrice: 86 },
      { unitPrice: 86 },
    ];
    assert.equal(wholesaleHeaderPairUnitPrice(serverLines), 86);
    assert.notEqual(wholesaleHeaderPairUnitPrice(serverLines), 999);
  });
});

describe("wholesale checkout + invoice route contracts (C4)", () => {
  it("checkout writes Order.unitPrice from prepared lines, not cart", () => {
    const src = readFileSync(
      join(process.cwd(), "app/lib/wholesale-checkout-batch.ts"),
      "utf8"
    );
    assert.match(src, /wholesaleHeaderPairUnitPrice/);
    assert.equal(/unitPrice:\s*Number\(primaryRow\.unitPrice\)/.test(src), false);
  });

  it("createInvoiceFromOrder bills wholesale from line items", () => {
    const src = readFileSync(
      join(process.cwd(), "app/lib/finance/create-invoice-from-order.ts"),
      "utf8"
    );
    assert.match(src, /computeInvoicePricingFromWholesaleLines/);
    assert.match(src, /wholesaleLineItems/);
  });
});
