/**
 * Approved-return credit amount helpers.
 * Order.unitPrice is per pair; Order.quantity / return item quantity are pieces.
 *
 * Phase 3B: eligible credit is always tax-inclusive (invoice grand / line totals).
 * Pre-tax order totals are not used for credit eligibility.
 */

import { roundMoney } from "./finance/tax-calc";

export const RETURN_CREDIT_MONEY_EPS = 0.009;

export type ReturnCreditOrderSnapshot = {
  id: string;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
};

export type ReturnCreditInvoiceLineSnapshot = {
  quantity: number;
  unitPrice: number;
  /** Tax-inclusive line total. */
  lineTotal: number;
};

export type ReturnCreditInvoiceSnapshot = {
  /** Invoice id (required for allocation). */
  id?: string;
  orderId: string;
  /** Tax-inclusive grand total. */
  amount: number;
  amountOutstanding?: number;
  taxableAmount?: number;
  cgstAmount?: number;
  sgstAmount?: number;
  igstAmount?: number;
  lines: ReturnCreditInvoiceLineSnapshot[];
};

export type ReturnCreditItemInput = {
  originalOrderId: string;
  quantity: number;
};

/**
 * Tax-inclusive credit for one order's return qty.
 * Requires a linked invoice; returns 0 when invoice is missing (no inventing GST).
 */
export function estimateReturnCreditForOrder(input: {
  orderId: string;
  returnQuantity: number;
  order: ReturnCreditOrderSnapshot;
  invoice?: ReturnCreditInvoiceSnapshot | null;
}): number {
  const qty = Number(input.returnQuantity);
  if (!Number.isFinite(qty) || qty <= 0) return 0;

  const invoice = input.invoice;
  if (!invoice || !(Number(invoice.amount) > RETURN_CREDIT_MONEY_EPS)) {
    return 0;
  }

  if (invoice.lines.length > 0) {
    return creditFromInvoiceLines(qty, invoice);
  }

  const orderedQty = Number(input.order.quantity) || 0;
  if (!(orderedQty > 0)) return 0;
  const capped = Math.min(qty, orderedQty);
  return roundMoney((capped / orderedQty) * Number(invoice.amount));
}

/** Per-order tax-inclusive eligible credits (before prior-credit / outstanding caps). */
export function estimateReturnCreditByOrder(input: {
  items: ReturnCreditItemInput[];
  ordersById: Map<string, ReturnCreditOrderSnapshot>;
  invoicesByOrderId?: Map<string, ReturnCreditInvoiceSnapshot>;
}): Map<string, number> {
  const qtyByOrder = new Map<string, number>();
  for (const item of input.items) {
    const qty = Number(item.quantity);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    qtyByOrder.set(
      item.originalOrderId,
      (qtyByOrder.get(item.originalOrderId) ?? 0) + qty
    );
  }

  const result = new Map<string, number>();
  for (const [orderId, returnQuantity] of qtyByOrder) {
    const order = input.ordersById.get(orderId);
    if (!order) continue;
    const amount = estimateReturnCreditForOrder({
      orderId,
      returnQuantity,
      order,
      invoice: input.invoicesByOrderId?.get(orderId) ?? null,
    });
    if (amount > RETURN_CREDIT_MONEY_EPS) {
      result.set(orderId, amount);
    }
  }
  return result;
}

/**
 * Estimate credit-note amount when admin does not supply approvedAmount.
 * Always tax-inclusive via invoice lines / invoice grand total.
 */
export function estimateReturnCreditFallback(input: {
  items: ReturnCreditItemInput[];
  ordersById: Map<string, ReturnCreditOrderSnapshot>;
  invoicesByOrderId?: Map<string, ReturnCreditInvoiceSnapshot>;
}): number {
  let sum = 0;
  for (const amount of estimateReturnCreditByOrder(input).values()) {
    sum += amount;
  }
  return roundMoney(sum);
}

function creditFromInvoiceLines(
  returnQty: number,
  invoice: ReturnCreditInvoiceSnapshot
): number {
  if (invoice.lines.length === 1) {
    const line = invoice.lines[0]!;
    const lineQty = Number(line.quantity) || 0;
    if (lineQty <= 0) return 0;
    const capped = Math.min(returnQty, lineQty);
    return roundMoney((capped / lineQty) * Number(line.lineTotal));
  }

  let remaining = returnQty;
  let credit = 0;
  for (const line of invoice.lines) {
    if (remaining <= 0) break;
    const lineQty = Number(line.quantity) || 0;
    if (lineQty <= 0) continue;
    const take = Math.min(remaining, lineQty);
    credit += (take / lineQty) * Number(line.lineTotal);
    remaining -= take;
  }
  return roundMoney(credit);
}

export type CreditInvoiceAllocationTarget = {
  orderId: string;
  invoiceId: string;
  invoiceAmount: number;
  amountOutstanding: number;
  taxableAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
};

export type CreditInvoiceAllocation = {
  orderId: string;
  invoiceId: string;
  amount: number;
  taxableAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
};

/**
 * Scale an approved total across orders by eligible weight, then bind each share
 * to that order's invoice without exceeding amountOutstanding.
 * Rejects when any share cannot be applied (paid/exhausted) — no advance inventing.
 */
export function allocateReturnCreditAcrossInvoices(input: {
  approvedAmount: number;
  /** Tax-inclusive eligible weight per order (from estimateReturnCreditByOrder). */
  eligibleByOrderId: Map<string, number>;
  invoices: CreditInvoiceAllocationTarget[];
}):
  | { ok: true; allocations: CreditInvoiceAllocation[]; totalApplied: number }
  | { ok: false; error: string } {
  const approved = roundMoney(Number(input.approvedAmount) || 0);
  if (!(approved > RETURN_CREDIT_MONEY_EPS)) {
    return { ok: false, error: "Approved credit amount must be positive." };
  }

  const weightSum = roundMoney(
    [...input.eligibleByOrderId.values()].reduce((s, v) => s + v, 0)
  );
  if (!(weightSum > RETURN_CREDIT_MONEY_EPS)) {
    return {
      ok: false,
      error:
        "No tax-inclusive invoice credit can be calculated for this return. Ensure linked orders have invoices.",
    };
  }

  const invoiceByOrder = new Map(
    input.invoices.map((inv) => [inv.orderId, inv])
  );

  const shares: Array<{ orderId: string; share: number }> = [];
  let allocatedShares = 0;
  const entries = [...input.eligibleByOrderId.entries()].filter(
    ([, w]) => w > RETURN_CREDIT_MONEY_EPS
  );
  for (let i = 0; i < entries.length; i += 1) {
    const [orderId, weight] = entries[i]!;
    const share =
      i === entries.length - 1
        ? roundMoney(approved - allocatedShares)
        : roundMoney((approved * weight) / weightSum);
    allocatedShares = roundMoney(allocatedShares + share);
    shares.push({ orderId, share });
  }

  const allocations: CreditInvoiceAllocation[] = [];
  for (const { orderId, share } of shares) {
    if (!(share > RETURN_CREDIT_MONEY_EPS)) continue;
    const inv = invoiceByOrder.get(orderId);
    if (!inv) {
      return {
        ok: false,
        error: `Cannot approve credit: order ${orderId} has no invoice to apply the credit against.`,
      };
    }
    const outstanding = roundMoney(Number(inv.amountOutstanding) || 0);
    if (share > outstanding + RETURN_CREDIT_MONEY_EPS) {
      return {
        ok: false,
        error: `Cannot approve credit of ₹${share.toFixed(2)} against invoice for this order: outstanding is only ₹${outstanding.toFixed(2)}. Refunds or advance credits for paid invoices are not supported.`,
      };
    }

    const apply = roundMoney(Math.min(share, outstanding));
    const invAmount = Number(inv.invoiceAmount) || 0;
    const ratio = invAmount > RETURN_CREDIT_MONEY_EPS ? apply / invAmount : 0;
    allocations.push({
      orderId,
      invoiceId: inv.invoiceId,
      amount: apply,
      taxableAmount: roundMoney(Number(inv.taxableAmount) * ratio),
      cgstAmount: roundMoney(Number(inv.cgstAmount) * ratio),
      sgstAmount: roundMoney(Number(inv.sgstAmount) * ratio),
      igstAmount: roundMoney(Number(inv.igstAmount) * ratio),
    });
  }

  const totalApplied = roundMoney(
    allocations.reduce((s, a) => s + a.amount, 0)
  );
  if (Math.abs(totalApplied - approved) > RETURN_CREDIT_MONEY_EPS) {
    return {
      ok: false,
      error: `Cannot apply full approved credit ₹${approved.toFixed(2)} across linked invoices (only ₹${totalApplied.toFixed(2)} available on outstanding balances).`,
    };
  }

  return { ok: true, allocations, totalApplied };
}

/** Invoice status after applying a credit that reduces outstanding (no payment row). */
export function invoiceStatusAfterCreditApplication(input: {
  invoiceAmount: number;
  amountOutstandingAfter: number;
  previousStatus: string;
}): "PAID" | "PARTIALLY_PAID" | string {
  const outstanding = roundMoney(Number(input.amountOutstandingAfter) || 0);
  const total = Number(input.invoiceAmount) || 0;
  if (outstanding <= RETURN_CREDIT_MONEY_EPS) return "PAID";
  if (outstanding < total - RETURN_CREDIT_MONEY_EPS) return "PARTIALLY_PAID";
  return input.previousStatus;
}
