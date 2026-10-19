/**
 * Safe correction of an unpaid invoice after an editable-order qty/price change.
 * Preserves issued paid documents (reject). Recalculates lines + tax headers so
 * they stay consistent with pair-based order pricing.
 *
 * Phase 3C (C6): posts only the financial delta to customer ledger + sales journal
 * in the same transaction as the invoice update.
 *
 * Pure policy helpers live in sync-order-invoice-pricing-policy.ts so unit tests
 * do not load prisma / DATABASE_URL. Ledger/journal are imported lazily here.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import { computeInvoicePricingFromOrder } from "./invoice-order-pricing";
import { roundMoney } from "./tax-calc";
import {
  SYNC_INVOICE_BLOCKED_STATUSES,
  SYNC_INVOICE_MONEY_EPS,
  computeInvoiceMoneyDelta,
  invoiceMoneyDeltaIsNoop,
  type InvoiceMoneySnapshot,
} from "./sync-order-invoice-pricing-policy";

export {
  computeInvoiceMoneyDelta,
  invoiceMoneyDeltaIsNoop,
  invoiceStatusBlocksOrderPricingEdit,
  type InvoiceMoneyDelta,
  type InvoiceMoneySnapshot,
} from "./sync-order-invoice-pricing-policy";

export type SyncOrderInvoicePricingResult =
  | { ok: true; skipped: true }
  | {
      ok: true;
      skipped: false;
      invoiceId: string;
      amount: number;
      /** Grand-total delta posted to ledger/journal (0 when unchanged). */
      amountDelta: number;
    }
  | { ok: false; error: string };

export class OrderPricingInvoiceSyncError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderPricingInvoiceSyncError";
  }
}

/**
 * When order pair price / piece qty changes, keep the linked invoice consistent
 * or reject if the document is no longer safely editable.
 * Ledger + journal receive only the money delta (idempotent when unchanged).
 */
export async function syncUnpaidInvoiceAfterOrderPricingEdit(
  db: Prisma.TransactionClient | PrismaClient,
  input: {
    orderId: string;
    pairUnitPrice: number;
    pieceQuantity: number;
  }
): Promise<SyncOrderInvoicePricingResult> {
  const invoice = await db.invoice.findUnique({
    where: { orderId: input.orderId },
    include: {
      lines: { orderBy: { lineNumber: "asc" } },
      _count: {
        select: { paymentAllocations: true, creditNotes: true },
      },
    },
  });
  if (!invoice) {
    return { ok: true, skipped: true };
  }

  if (SYNC_INVOICE_BLOCKED_STATUSES.has(invoice.status)) {
    return {
      ok: false,
      error:
        "Cannot change quantity or pair price while the invoice is paid, partially paid, cancelled, or void. Use a credit note / return after fulfillment.",
    };
  }

  if (Number(invoice.amountPaid) > SYNC_INVOICE_MONEY_EPS) {
    return {
      ok: false,
      error:
        "Cannot change quantity or pair price after payments have been applied to the invoice.",
    };
  }

  if (invoice._count.paymentAllocations > 0) {
    return {
      ok: false,
      error:
        "Cannot change quantity or pair price while the invoice has payment allocations. Handle settlement in Finance first.",
    };
  }

  if (invoice._count.creditNotes > 0) {
    return {
      ok: false,
      error:
        "Cannot change quantity or pair price while the invoice has credit notes. Correct via Finance / returns.",
    };
  }

  // Preserve loyalty / line discount already stored on the invoice.
  const discountAmount = roundMoney(Number(invoice.discountAmount) || 0);
  const gstRatePercent =
    invoice.lines[0] != null
      ? Number(invoice.lines[0].gstRatePercent) || 0
      : 0;

  const pricing = computeInvoicePricingFromOrder({
    pairUnitPrice: input.pairUnitPrice,
    pieceQuantity: input.pieceQuantity,
    discountAmount,
    gstRatePercent,
    isInterState: invoice.isInterState,
  });
  const { quantity, unitPrice, totals } = pricing;
  const line = totals.lines[0];
  if (!line || quantity <= 0) {
    return {
      ok: false,
      error: "Cannot recalculate invoice for this quantity/price.",
    };
  }

  if (invoice.lines.length > 1) {
    return {
      ok: false,
      error:
        "Cannot safely recalculate a multi-line invoice from a single order edit. Void or correct the invoice in Finance first.",
    };
  }

  const before: InvoiceMoneySnapshot = {
    amount: Number(invoice.amount),
    taxableAmount: Number(invoice.taxableAmount),
    cgstAmount: Number(invoice.cgstAmount),
    sgstAmount: Number(invoice.sgstAmount),
    igstAmount: Number(invoice.igstAmount),
    discountAmount: Number(invoice.discountAmount),
  };
  const after: InvoiceMoneySnapshot = {
    amount: totals.grandTotal,
    taxableAmount: totals.taxableAmount,
    cgstAmount: totals.cgstAmount,
    sgstAmount: totals.sgstAmount,
    igstAmount: totals.igstAmount,
    discountAmount: totals.discountAmount,
  };
  const delta = computeInvoiceMoneyDelta(before, after);

  const amountOutstanding = roundMoney(totals.grandTotal);

  await db.invoice.update({
    where: { id: invoice.id },
    data: {
      amount: totals.grandTotal,
      grossAmount: totals.grossAmount,
      discountAmount: totals.discountAmount,
      taxableAmount: totals.taxableAmount,
      cgstAmount: totals.cgstAmount,
      sgstAmount: totals.sgstAmount,
      igstAmount: totals.igstAmount,
      roundingAdjustment: totals.roundingAdjustment,
      amountOutstanding,
    },
  });

  if (invoice.lines.length === 1) {
    await db.invoiceLine.update({
      where: { id: invoice.lines[0]!.id },
      data: {
        quantity,
        unitPrice,
        discountAmount: line.discountAmount,
        taxableAmount: line.taxableAmount,
        gstRatePercent: line.gstRatePercent,
        cgstAmount: line.cgstAmount,
        sgstAmount: line.sgstAmount,
        igstAmount: line.igstAmount,
        lineTotal: line.lineTotal,
      },
    });
  } else {
    await db.invoiceLine.create({
      data: {
        invoiceId: invoice.id,
        lineNumber: 1,
        description: "Order line",
        quantity,
        unitPrice,
        discountAmount: line.discountAmount,
        taxableAmount: line.taxableAmount,
        gstRatePercent: line.gstRatePercent,
        cgstAmount: line.cgstAmount,
        sgstAmount: line.sgstAmount,
        igstAmount: line.igstAmount,
        lineTotal: line.lineTotal,
      },
    });
  }

  if (!invoiceMoneyDeltaIsNoop(delta)) {
    // Lazy: keep module load free of prisma for pure-policy unit tests.
    const { postCustomerLedgerInvoiceDelta } = await import("./customer-ledger");
    const { postSalesInvoiceAdjustmentJournal } = await import("./journal");
    await postCustomerLedgerInvoiceDelta({
      customerId: invoice.userId,
      invoiceId: invoice.id,
      amountDelta: delta.amount,
      description: `Invoice ${invoice.invoiceNumber} pricing correction`,
      tx: db,
    });
    await postSalesInvoiceAdjustmentJournal({
      invoiceId: invoice.id,
      deltaTaxable: delta.taxableAmount,
      deltaCgst: delta.cgstAmount,
      deltaSgst: delta.sgstAmount,
      deltaIgst: delta.igstAmount,
      deltaTotal: delta.amount,
      tx: db,
    });
  }

  return {
    ok: true,
    skipped: false,
    invoiceId: invoice.id,
    amount: totals.grandTotal,
    amountDelta: delta.amount,
  };
}
