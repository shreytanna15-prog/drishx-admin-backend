/**
 * Pure unpaid-invoice pricing-edit policy helpers (C6).
 * No Prisma client / DATABASE_URL — safe for unit tests.
 */

import type { InvoiceStatus } from "@prisma/client";
import { roundMoney } from "./tax-calc";

const MONEY_EPS = 0.009;

const BLOCKED_STATUSES = new Set<InvoiceStatus>([
  "PAID",
  "PARTIALLY_PAID",
  "CANCELLED",
  "VOID",
]);

export { MONEY_EPS as SYNC_INVOICE_MONEY_EPS, BLOCKED_STATUSES as SYNC_INVOICE_BLOCKED_STATUSES };

export type InvoiceMoneySnapshot = {
  amount: number;
  taxableAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  discountAmount: number;
};

export type InvoiceMoneyDelta = {
  amount: number;
  taxableAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  discountAmount: number;
};

/** Pure: financial delta between previous invoice headers and recomputed totals. */
export function computeInvoiceMoneyDelta(
  before: InvoiceMoneySnapshot,
  after: InvoiceMoneySnapshot
): InvoiceMoneyDelta {
  return {
    amount: roundMoney(after.amount - before.amount),
    taxableAmount: roundMoney(after.taxableAmount - before.taxableAmount),
    cgstAmount: roundMoney(after.cgstAmount - before.cgstAmount),
    sgstAmount: roundMoney(after.sgstAmount - before.sgstAmount),
    igstAmount: roundMoney(after.igstAmount - before.igstAmount),
    discountAmount: roundMoney(after.discountAmount - before.discountAmount),
  };
}

export function invoiceMoneyDeltaIsNoop(delta: InvoiceMoneyDelta): boolean {
  return (
    Math.abs(delta.amount) <= MONEY_EPS &&
    Math.abs(delta.taxableAmount) <= MONEY_EPS &&
    Math.abs(delta.cgstAmount) <= MONEY_EPS &&
    Math.abs(delta.sgstAmount) <= MONEY_EPS &&
    Math.abs(delta.igstAmount) <= MONEY_EPS
  );
}

/** Pure policy helper — which invoice statuses / settlement block pricing edits. */
export function invoiceStatusBlocksOrderPricingEdit(
  status: InvoiceStatus,
  amountPaid: number,
  extras?: { paymentAllocationCount?: number; creditNoteCount?: number }
): boolean {
  if (BLOCKED_STATUSES.has(status) || amountPaid > 0) return true;
  if ((extras?.paymentAllocationCount ?? 0) > 0) return true;
  if ((extras?.creditNoteCount ?? 0) > 0) return true;
  return false;
}
