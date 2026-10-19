import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { computeInvoicePricingFromOrder } from "./invoice-order-pricing";
import {
  computeInvoiceMoneyDelta,
  invoiceMoneyDeltaIsNoop,
  invoiceStatusBlocksOrderPricingEdit,
} from "./sync-order-invoice-pricing-policy";
import { orderTotalFromPairPrice } from "@/app/lib/lens-pricing";
import { roundMoney } from "./tax-calc";

describe("invoiceStatusBlocksOrderPricingEdit", () => {
  it("allows unpaid DRAFT and ISSUED corrections", () => {
    assert.equal(invoiceStatusBlocksOrderPricingEdit("DRAFT", 0), false);
    assert.equal(invoiceStatusBlocksOrderPricingEdit("ISSUED", 0), false);
    assert.equal(invoiceStatusBlocksOrderPricingEdit("OVERDUE", 0), false);
  });

  it("blocks paid / partial / cancelled / void and any amountPaid", () => {
    assert.equal(invoiceStatusBlocksOrderPricingEdit("PAID", 0), true);
    assert.equal(invoiceStatusBlocksOrderPricingEdit("PARTIALLY_PAID", 0), true);
    assert.equal(invoiceStatusBlocksOrderPricingEdit("CANCELLED", 0), true);
    assert.equal(invoiceStatusBlocksOrderPricingEdit("VOID", 0), true);
    assert.equal(invoiceStatusBlocksOrderPricingEdit("ISSUED", 10), true);
  });

  it("blocks invoices with payment allocations or credit notes (C6)", () => {
    assert.equal(
      invoiceStatusBlocksOrderPricingEdit("ISSUED", 0, {
        paymentAllocationCount: 1,
      }),
      true
    );
    assert.equal(
      invoiceStatusBlocksOrderPricingEdit("ISSUED", 0, {
        creditNoteCount: 1,
      }),
      true
    );
  });
});

describe("computeInvoiceMoneyDelta (C6 ledger/journal reconciliation)", () => {
  it("posts only the tax-inclusive delta when qty increases", () => {
    const beforePricing = computeInvoicePricingFromOrder({
      pairUnitPrice: 192,
      pieceQuantity: 2,
      gstRatePercent: 5,
      isInterState: false,
    });
    const afterPricing = computeInvoicePricingFromOrder({
      pairUnitPrice: 192,
      pieceQuantity: 4,
      gstRatePercent: 5,
      isInterState: false,
    });
    const delta = computeInvoiceMoneyDelta(
      {
        amount: beforePricing.totals.grandTotal,
        taxableAmount: beforePricing.totals.taxableAmount,
        cgstAmount: beforePricing.totals.cgstAmount,
        sgstAmount: beforePricing.totals.sgstAmount,
        igstAmount: beforePricing.totals.igstAmount,
        discountAmount: beforePricing.totals.discountAmount,
      },
      {
        amount: afterPricing.totals.grandTotal,
        taxableAmount: afterPricing.totals.taxableAmount,
        cgstAmount: afterPricing.totals.cgstAmount,
        sgstAmount: afterPricing.totals.sgstAmount,
        igstAmount: afterPricing.totals.igstAmount,
        discountAmount: afterPricing.totals.discountAmount,
      }
    );
    assert.equal(delta.taxableAmount, 192);
    assert.equal(delta.cgstAmount, 4.8);
    assert.equal(delta.sgstAmount, 4.8);
    assert.equal(delta.amount, 201.6);
    assert.equal(
      roundMoney(delta.taxableAmount + delta.cgstAmount + delta.sgstAmount),
      delta.amount
    );
    assert.equal(invoiceMoneyDeltaIsNoop(delta), false);
  });

  it("is a no-op when pricing is unchanged (idempotent re-sync)", () => {
    const pricing = computeInvoicePricingFromOrder({
      pairUnitPrice: 100,
      pieceQuantity: 2,
      gstRatePercent: 0,
      isInterState: false,
    });
    const snap = {
      amount: pricing.totals.grandTotal,
      taxableAmount: pricing.totals.taxableAmount,
      cgstAmount: pricing.totals.cgstAmount,
      sgstAmount: pricing.totals.sgstAmount,
      igstAmount: pricing.totals.igstAmount,
      discountAmount: pricing.totals.discountAmount,
    };
    const delta = computeInvoiceMoneyDelta(snap, snap);
    assert.equal(invoiceMoneyDeltaIsNoop(delta), true);
    assert.equal(delta.amount, 0);
  });

  it("preserves discount in the after snapshot delta", () => {
    const before = computeInvoicePricingFromOrder({
      pairUnitPrice: 192,
      pieceQuantity: 2,
      discountAmount: 40,
      gstRatePercent: 0,
      isInterState: false,
    });
    const after = computeInvoicePricingFromOrder({
      pairUnitPrice: 192,
      pieceQuantity: 4,
      discountAmount: 40,
      gstRatePercent: 0,
      isInterState: false,
    });
    const delta = computeInvoiceMoneyDelta(
      {
        amount: before.totals.grandTotal,
        taxableAmount: before.totals.taxableAmount,
        cgstAmount: 0,
        sgstAmount: 0,
        igstAmount: 0,
        discountAmount: before.totals.discountAmount,
      },
      {
        amount: after.totals.grandTotal,
        taxableAmount: after.totals.taxableAmount,
        cgstAmount: 0,
        sgstAmount: 0,
        igstAmount: 0,
        discountAmount: after.totals.discountAmount,
      }
    );
    // Discount stays 40; taxable grows 152 → 344 ⇒ +192
    assert.equal(delta.discountAmount, 0);
    assert.equal(delta.taxableAmount, 192);
    assert.equal(delta.amount, 192);
  });
});

describe("order edit ↔ invoice consistency (pair pricing)", () => {
  it("qty 2 @ ₹192/pair keeps order gross and invoice taxable aligned", () => {
    const pair = 192;
    const pieces = 2;
    const orderGross = orderTotalFromPairPrice(pair, pieces);
    assert.equal(orderGross, 192);

    const { lineGross, totals, quantity, unitPrice } =
      computeInvoicePricingFromOrder({
        pairUnitPrice: pair,
        pieceQuantity: pieces,
        gstRatePercent: 5,
        isInterState: false,
        discountAmount: 0,
      });

    assert.equal(lineGross, orderGross);
    assert.equal(totals.taxableAmount, 192);
    assert.equal(quantity, 2);
    assert.equal(roundMoney(unitPrice * quantity), 192);
    assert.equal(roundMoney(unitPrice), 96);
  });

  it("multiple pairs (qty 4 @ ₹192) recalculates taxable to ₹384", () => {
    const { totals, lineGross } = computeInvoicePricingFromOrder({
      pairUnitPrice: 192,
      pieceQuantity: 4,
      gstRatePercent: 0,
      isInterState: false,
    });
    assert.equal(lineGross, 384);
    assert.equal(totals.taxableAmount, 384);
    assert.equal(totals.grandTotal, 384);
  });

  it("preserves discount when recomputing after qty change", () => {
    const { totals } = computeInvoicePricingFromOrder({
      pairUnitPrice: 192,
      pieceQuantity: 4,
      discountAmount: 40,
      gstRatePercent: 0,
      isInterState: false,
    });
    assert.equal(totals.discountAmount, 40);
    assert.equal(totals.taxableAmount, 344);
    assert.equal(totals.grandTotal, 344);
  });
});

describe("PATCH order pricing route contract", () => {
  it("uses orderTotalFromPairPrice and syncUnpaidInvoiceAfterOrderPricingEdit", () => {
    const src = readFileSync(
      join(process.cwd(), "app/api/orders/[id]/route.ts"),
      "utf8"
    );
    assert.match(src, /orderTotalFromPairPrice/);
    assert.match(src, /syncUnpaidInvoiceAfterOrderPricingEdit/);
    assert.match(src, /OrderPricingInvoiceSyncError/);
    assert.equal(
      /invoice\.updateMany\(\s*\{\s*where:\s*\{\s*orderId:\s*id\s*\},\s*data:\s*\{\s*amount:\s*data\.totalAmount/.test(
        src
      ),
      false
    );
  });

  it("sync posts ledger + journal deltas (C6)", () => {
    const src = readFileSync(
      join(process.cwd(), "app/lib/finance/sync-order-invoice-pricing.ts"),
      "utf8"
    );
    assert.match(src, /postCustomerLedgerInvoiceDelta/);
    assert.match(src, /postSalesInvoiceAdjustmentJournal/);
    assert.match(src, /paymentAllocations/);
    assert.match(src, /invoiceMoneyDeltaIsNoop/);
    // Ledger/journal must stay lazy so pure-policy unit tests skip prisma init.
    assert.match(src, /await import\("\.\/customer-ledger"\)/);
    assert.match(src, /await import\("\.\/journal"\)/);
  });

  it("return decision uses credit eligibility helpers (no silent over-credit)", () => {
    const src = readFileSync(
      join(process.cwd(), "app/api/returns/[id]/decision/route.ts"),
      "utf8"
    );
    assert.match(src, /computeMaxEligibleCredit/);
    assert.match(src, /resolveApprovedCreditAmount/);
    assert.match(src, /allocateReturnCreditAcrossInvoices/);
    assert.equal(src.includes("unit * Number(item.quantity)"), false);
  });

  it("admin create-order preview uses orderTotalFromPairPrice", () => {
    const src = readFileSync(
      join(process.cwd(), "components/admin-create-order-panel.tsx"),
      "utf8"
    );
    assert.match(src, /orderTotalFromPairPrice/);
    assert.equal(
      /Number\(catalog\.lens\.price\)\s*\*\s*Number\(catalog\.quantity\)/.test(
        src
      ),
      false
    );
  });
});

describe("Phase 4A multi-invoice credit attribution (CreditNoteAllocation)", () => {
  it("persists per-invoice allocations with the credit note in the same tx path", () => {
    const src = readFileSync(
      join(process.cwd(), "app/lib/returns.ts"),
      "utf8"
    );
    // Durable allocations — Phase 3B single-invoice SCHEMA BLOCKER is resolved.
    assert.equal(src.includes("SCHEMA BLOCKER"), false);
    assert.match(src, /CreditNoteAllocation rows are persisted atomically/);
    assert.match(src, /allocations:\s*\{\s*create:/);
    assert.match(src, /include:\s*\{\s*allocations:\s*true/);

    // Invoice outstanding updates run on the same tx client before CN create.
    assert.match(src, /amountOutstanding:\s*newOutstanding/);
    assert.match(src, /await tx\.invoice\.update/);
    assert.match(src, /creditNote\.create/);

    // Reconciliation: allocations must sum to approved amount; duplicate CN blocked.
    assert.match(src, /Credit allocations must sum to the approved credit amount/);
    assert.match(
      src,
      /A credit note already exists for this return request/
    );
  });
});
