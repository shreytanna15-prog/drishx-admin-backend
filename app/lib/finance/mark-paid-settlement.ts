/**
 * Pure markPaid settlement policy (C9).
 * No Prisma client / DATABASE_URL — safe for unit tests.
 */

import { InvoiceStatus } from "@prisma/client";
import { roundMoney } from "./tax-calc";

const MARK_PAID_MONEY_EPS = 0.009;

export class MarkPaidWithoutSettlementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MarkPaidWithoutSettlementError";
  }
}

/**
 * Pure policy for createInvoiceFromOrder(markPaid).
 * Zero-value invoices may be PAID without inventing a payment row.
 * Nonzero markPaid is unsupported.
 */
export function resolveMarkPaidInvoiceSettlement(input: {
  markPaid: boolean;
  grandTotal: number;
}):
  | {
      ok: true;
      status: InvoiceStatus;
      amountPaid: number;
      amountOutstanding: number;
    }
  | { ok: false; error: string } {
  const total = roundMoney(Number(input.grandTotal) || 0);
  const isZero = Math.abs(total) <= MARK_PAID_MONEY_EPS;

  if (input.markPaid && !isZero) {
    return {
      ok: false,
      error:
        "Cannot mark a nonzero invoice as paid without recording a payment. Record settlement in Finance, or omit markPaid.",
    };
  }

  if (input.markPaid && isZero) {
    return {
      ok: true,
      status: InvoiceStatus.PAID,
      amountPaid: 0,
      amountOutstanding: 0,
    };
  }

  return {
    ok: true,
    status: InvoiceStatus.ISSUED,
    amountPaid: 0,
    amountOutstanding: isZero ? 0 : total,
  };
}
