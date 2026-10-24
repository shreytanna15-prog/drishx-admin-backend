/**
 * Pure cancel/void invoice policy (Phase 1).
 * No Prisma client / DATABASE_URL — safe for unit tests.
 */

import { InvoiceStatus } from "@prisma/client";

export const VOID_INVOICE_MONEY_EPS = 0.009;

/** Snapshot used by pure cancellation policy (unit-testable). */
export type InvoiceCancelSettlementSnapshot = {
  status: InvoiceStatus | string;
  amountPaid: number;
  amountOutstanding: number;
  paymentAllocationCount: number;
  creditNoteCount: number;
};

/**
 * Returns an error message when cancel/archive must be rejected.
 * Already VOID/CANCELLED invoices do not block (idempotent).
 *
 * Phase F: paid / allocated invoices may cancel — OrderRefund tracks money to return.
 * Credit notes still block (avoid double-refund vs return credit notes).
 */
export function invoiceBlocksOrderCancellation(
  inv: InvoiceCancelSettlementSnapshot
): string | null {
  if (inv.status === InvoiceStatus.VOID || inv.status === InvoiceStatus.CANCELLED) {
    return null;
  }

  if (inv.creditNoteCount > 0) {
    return "Cannot cancel this order: the invoice has credit notes. Handle refunds or adjustments in Finance.";
  }

  // amountPaid / allocations intentionally allowed — OrderRefund tracks money to return.
  return null;
}

export function shouldApplyInvoiceVoidOnOrderCancel(
  status: InvoiceStatus | string
): boolean {
  return status !== InvoiceStatus.VOID && status !== InvoiceStatus.CANCELLED;
}

export class OrderInvoiceCancellationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderInvoiceCancellationError";
  }
}
