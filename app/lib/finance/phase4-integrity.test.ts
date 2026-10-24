import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { resolveApprovedCreditDisplay } from "@/app/lib/admin-returns";
import { resolveMarkPaidInvoiceSettlement } from "./mark-paid-settlement";
import {
  computeInvoiceMoneyDelta,
  invoiceMoneyDeltaIsNoop,
  invoiceStatusBlocksOrderPricingEdit,
} from "./sync-order-invoice-pricing-policy";
import { computeInvoicePricingFromOrder } from "./invoice-order-pricing";
import { allocateReturnCreditAcrossInvoices } from "@/app/lib/return-credit";

describe("Phase 4A CreditNoteAllocation schema + persistence contracts", () => {
  it("schema defines CreditNoteAllocation with unique (creditNoteId, invoiceId)", () => {
    const schema = readFileSync(
      join(process.cwd(), "prisma/schema.prisma"),
      "utf8"
    );
    assert.match(schema, /model CreditNoteAllocation/);
    assert.match(schema, /@@unique\(\[creditNoteId, invoiceId\]\)/);
    assert.match(schema, /allocations\s+CreditNoteAllocation\[\]/);
  });

  it("migration file creates CreditNoteAllocation without backfill", () => {
    const sql = readFileSync(
      join(
        process.cwd(),
        "prisma/migrations/20261019120000_credit_note_allocation/migration.sql"
      ),
      "utf8"
    );
    assert.match(sql, /CREATE TABLE IF NOT EXISTS "CreditNoteAllocation"/);
    assert.equal(/UPDATE\s+"CreditNoteAllocation"/i.test(sql), false);
  });

  it("createCreditNoteForReturn persists nested allocations + sequenced CN number", () => {
    const src = readFileSync(
      join(process.cwd(), "app/lib/returns.ts"),
      "utf8"
    );
    assert.match(src, /nextCreditNoteNumber/);
    assert.match(src, /allocations:\s*\{\s*create:/);
    assert.match(src, /include:\s*\{\s*allocations:\s*true/);
  });

  it("pure policy modules do not import app/lib/prisma", () => {
    for (const rel of [
      "app/lib/finance/mark-paid-settlement.ts",
      "app/lib/finance/sync-order-invoice-pricing-policy.ts",
      "app/lib/finance/void-unpaid-invoice-policy.ts",
      "app/lib/return-eligibility-policy.ts",
      "app/lib/return-credit.ts",
      "app/lib/finance/invoice-order-pricing.ts",
      "app/lib/finance/tax-calc.ts",
      "app/lib/finance/payment-claim-allocation.ts",
      "app/lib/loyalty/reverse-policy.ts",
    ]) {
      const src = readFileSync(join(process.cwd(), rel), "utf8");
      assert.equal(
        /from\s+["']@\/app\/lib\/prisma["']/.test(src) ||
          /from\s+["']\.\.\/prisma["']/.test(src) ||
          /from\s+["']\.\/prisma["']/.test(src),
        false,
        `${rel} must not import prisma`
      );
    }
  });

  it("admin approved-credit display exposes allocations (historical empty OK)", () => {
    const withAlloc = resolveApprovedCreditDisplay({
      status: "APPROVED_CREDIT",
      approvedAmount: 292,
      creditNote: {
        creditNoteNumber: "CN/26-27/000001",
        amount: 292,
        allocations: [
          {
            invoiceId: "ia",
            amount: 192,
            taxableAmount: 182.86,
            invoice: { invoiceNumber: "INV-A" },
          },
          {
            invoiceId: "ib",
            amount: 100,
            taxableAmount: 95.24,
            invoice: { invoiceNumber: "INV-B" },
          },
        ],
      },
    });
    assert.equal(withAlloc.show, true);
    if (!withAlloc.show) return;
    assert.equal(withAlloc.allocations.length, 2);
    assert.equal(withAlloc.allocations[0]!.invoiceNumber, "INV-A");

    const historical = resolveApprovedCreditDisplay({
      status: "APPROVED_CREDIT",
      approvedAmount: 100,
      creditNote: {
        creditNoteNumber: "CN-LEGACY",
        amount: 100,
        allocations: [],
      },
    });
    assert.equal(historical.show, true);
    if (!historical.show) return;
    assert.equal(historical.allocations.length, 0);
    assert.equal(historical.needsReconciliation, false);
  });
});

describe("Phase 4 C10 wholesale edit rejection", () => {
  it("PATCH order route rejects wholesale header pricing edits", () => {
    const src = readFileSync(
      join(process.cwd(), "app/api/orders/[id]/route.ts"),
      "utf8"
    );
    assert.match(src, /lineType === "WHOLESALE"/);
    assert.match(src, /Wholesale order quantity or pair price cannot be edited/);
  });

  it("retail unpaid edits still sync invoice + sale transaction amount", () => {
    const src = readFileSync(
      join(process.cwd(), "app/api/orders/[id]/route.ts"),
      "utf8"
    );
    assert.match(src, /syncUnpaidInvoiceAfterOrderPricingEdit/);
    assert.match(src, /transaction\.updateMany/);
  });
});

describe("Phase 4 C11 loyalty taxable reversals", () => {
  it("decision route uses reverseLoyaltyForCreditAllocations without .catch swallow", () => {
    const src = readFileSync(
      join(process.cwd(), "app/api/returns/[id]/decision/route.ts"),
      "utf8"
    );
    assert.match(src, /reverseLoyaltyForCreditAllocations/);
    assert.equal(
      /reverseLoyaltyForCreditAllocations\([\s\S]*?\)\.catch\(/.test(src),
      false
    );
    assert.match(src, /taxableAmount:\s*a\.taxableAmount/);
  });

  it("allocation taxable is tax-exclusive share (not grand inclusive)", () => {
    const result = allocateReturnCreditAcrossInvoices({
      approvedAmount: 210,
      eligibleByOrderId: new Map([["a", 210]]),
      invoices: [
        {
          orderId: "a",
          invoiceId: "ia",
          invoiceAmount: 210,
          amountOutstanding: 210,
          taxableAmount: 200,
          cgstAmount: 5,
          sgstAmount: 5,
          igstAmount: 0,
        },
      ],
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.allocations[0]!.amount, 210);
    assert.equal(result.allocations[0]!.taxableAmount, 200);
    assert.notEqual(result.allocations[0]!.taxableAmount, 210);
  });
});

describe("Phase 4 C12 payment claim + numbering contracts", () => {
  it("confirmPaymentClaim locks claim and posts payment in one transaction", () => {
    const src = readFileSync(
      join(process.cwd(), "app/lib/finance/payments.ts"),
      "utf8"
    );
    assert.match(src, /SELECT 1 FROM "PaymentClaim"[\s\S]*FOR UPDATE/);
    assert.match(src, /recordCustomerPaymentInTx/);
    assert.match(src, /PaymentClaimStatus\.CONFIRMED/);
    assert.match(src, /nextPaymentNumber\(undefined, tx\)/);
    assert.match(src, /lockInvoicesForUpdate/);
    assert.match(src, /resolvePaymentClaimItemAllocations/);
  });

  it("createCreditNoteForReturn locks invoices before outstanding mutate", () => {
    const src = readFileSync(
      join(process.cwd(), "app/lib/returns.ts"),
      "utf8"
    );
    assert.match(src, /lockInvoicesForUpdate/);
  });

  it("customer ledger posts take a per-customer FOR UPDATE lock", () => {
    const src = readFileSync(
      join(process.cwd(), "app/lib/finance/customer-ledger.ts"),
      "utf8"
    );
    assert.match(src, /FOR UPDATE/);
    assert.match(src, /withLedgerLock/);
  });

  it("document numbers accept a transaction client (rollback-safe)", () => {
    const src = readFileSync(
      join(process.cwd(), "app/lib/finance/invoice-number.ts"),
      "utf8"
    );
    assert.match(src, /pg_advisory_xact_lock/);
    assert.match(src, /nextCreditNoteNumber/);
    assert.match(src, /db: Db = prisma/);
  });
});

describe("Phase 4 cancellation atomicity contracts", () => {
  it("cancel PUT restores stock + voids sale + voids invoice inside one \$transaction", () => {
    const src = readFileSync(
      join(process.cwd(), "app/api/orders/[id]/route.ts"),
      "utf8"
    );
    // Stock restore no longer runs before the cancelling transaction.
    assert.equal(
      /if \(nextStatus === "CANCELLED"[\s\S]*?await restorePickedStock\(existingOrder, stockAudit\);[\s\S]*?if \(isCancelling\)/.test(
        src
      ),
      false
    );
    assert.match(src, /restorePickedStock\(existingOrder, stockAudit, tx\)/);
    assert.match(src, /voidTransaction\([\s\S]*?tx\s*\)/);
    assert.match(src, /voidUnpaidInvoiceOnOrderCancel/);
  });

  it("archive DELETE restores loyalty redemption inside the archive transaction", () => {
    const src = readFileSync(
      join(process.cwd(), "app/api/orders/[id]/route.ts"),
      "utf8"
    );
    // reverseRedemption must appear in the DELETE archive $transaction block.
    assert.match(
      src,
      /export async function DELETE[\s\S]*?reverseRedemption\(\{[\s\S]*?db:\s*tx/
    );
  });

  it("cancel and archive interactive transactions raise timeout/maxWait (P2028)", () => {
    const src = readFileSync(
      join(process.cwd(), "app/api/orders/[id]/route.ts"),
      "utf8"
    );
    const cancelTxn = /if \(isCancelling\)[\s\S]*?prisma\.\$transaction\([\s\S]*?\{ maxWait: 10_000, timeout: 60_000 \}/;
    const archiveTxn =
      /export async function DELETE[\s\S]*?prisma\.\$transaction\([\s\S]*?\{ maxWait: 10_000, timeout: 60_000 \}/;
    assert.match(src, cancelTxn);
    assert.match(src, archiveTxn);
    // Still a single atomic cancel path (stock + void + invoice inside txn).
    assert.match(
      src,
      /if \(isCancelling\)[\s\S]*?restorePickedStock\(existingOrder, stockAudit, tx\)[\s\S]*?voidUnpaidInvoiceOnOrderCancel\([\s\S]*?\{ maxWait: 10_000, timeout: 60_000 \}/
    );
  });

  it("incrementLensStock passes transaction client into logStockDelta", () => {
    const src = readFileSync(
      join(process.cwd(), "app/lib/cart-reservations.ts"),
      "utf8"
    );
    assert.match(src, /client:\s*db/);
  });

  it("loyalty reverse uses remaining-taxable policy + return-scoped marker", () => {
    const src = readFileSync(
      join(process.cwd(), "app/lib/loyalty/reverse.ts"),
      "utf8"
    );
    assert.match(src, /computeLoyaltyReversePoints/);
    assert.match(src, /priorReturnedTaxable/);
    assert.match(src, /return marker/);
  });

  it("voidTransaction is idempotent when already VOIDED", () => {
    const src = readFileSync(
      join(process.cwd(), "app/lib/audit-query.ts"),
      "utf8"
    );
    assert.match(src, /already voided inside a cancel retry/);
  });
});

describe("Phase 4 cross-module reconciliation helpers", () => {
  it("invoice money delta reconciles taxable + GST to grand", () => {
    const before = computeInvoicePricingFromOrder({
      pairUnitPrice: 100,
      pieceQuantity: 2,
      gstRatePercent: 5,
      isInterState: false,
    });
    const after = computeInvoicePricingFromOrder({
      pairUnitPrice: 100,
      pieceQuantity: 4,
      gstRatePercent: 5,
      isInterState: false,
    });
    const delta = computeInvoiceMoneyDelta(
      {
        amount: before.totals.grandTotal,
        taxableAmount: before.totals.taxableAmount,
        cgstAmount: before.totals.cgstAmount,
        sgstAmount: before.totals.sgstAmount,
        igstAmount: before.totals.igstAmount,
        discountAmount: before.totals.discountAmount,
      },
      {
        amount: after.totals.grandTotal,
        taxableAmount: after.totals.taxableAmount,
        cgstAmount: after.totals.cgstAmount,
        sgstAmount: after.totals.sgstAmount,
        igstAmount: after.totals.igstAmount,
        discountAmount: after.totals.discountAmount,
      }
    );
    assert.equal(invoiceMoneyDeltaIsNoop(delta), false);
    assert.equal(
      Math.abs(
        delta.taxableAmount +
          delta.cgstAmount +
          delta.sgstAmount +
          delta.igstAmount -
          delta.amount
      ) < 0.02,
      true
    );
  });

  it("settled invoices still block pricing edits", () => {
    assert.equal(
      invoiceStatusBlocksOrderPricingEdit("ISSUED", 0, {
        paymentAllocationCount: 1,
      }),
      true
    );
  });

  it("nonzero markPaid remains rejected (C9 preserved)", () => {
    const r = resolveMarkPaidInvoiceSettlement({
      markPaid: true,
      grandTotal: 100,
    });
    assert.equal(r.ok, false);
  });
});
