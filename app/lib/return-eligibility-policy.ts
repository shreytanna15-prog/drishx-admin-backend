/**
 * Pure return quantity + credit approval eligibility (Phase 2: C2/C3).
 * No Prisma client / DATABASE_URL — safe for unit tests.
 */

import {
  estimateReturnCreditFallback,
  type ReturnCreditInvoiceSnapshot,
  type ReturnCreditItemInput,
  type ReturnCreditOrderSnapshot,
} from "./return-credit";
import { ReturnRequestStatus } from "./return-request-status";
import { roundMoney } from "./finance/tax-calc";

export const RETURN_CREDIT_MONEY_EPS = 0.009;
export const RETURN_QTY_EPS = 1e-9;

/** Statuses that always reserve order quantity (pending + approved in-flight). */
export const RETURN_ALWAYS_RESERVE_STATUSES: string[] = [
  ReturnRequestStatus.SUBMITTED,
  ReturnRequestStatus.MORE_INFO_REQUIRED,
  ReturnRequestStatus.ESCALATED_TO_ADMIN,
  ReturnRequestStatus.AWAITING_MATERIAL,
  ReturnRequestStatus.APPROVED_CREDIT,
  ReturnRequestStatus.APPROVED_REPLACEMENT,
];

/**
 * Pending/approved returns reserve qty. REJECTED never does.
 * CLOSED reserves only when a CREDIT/REPLACEMENT decision was recorded
 * (abandoned closes without decision do not lock qty).
 */
export function statusReservesReturnQuantity(
  status: string,
  decisionType: string | null | undefined
): boolean {
  if (status === ReturnRequestStatus.REJECTED) return false;
  if (status === ReturnRequestStatus.CLOSED) {
    return decisionType === "CREDIT" || decisionType === "REPLACEMENT";
  }
  return RETURN_ALWAYS_RESERVE_STATUSES.includes(status);
}

export function aggregateQuantitiesByOrderId(
  items: Array<{ originalOrderId: string; quantity: number }>
): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of items) {
    const qty = Number(item.quantity);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    const id = item.originalOrderId;
    map.set(id, (map.get(id) ?? 0) + qty);
  }
  return map;
}

export function validateRequestedReturnQuantities(input: {
  requestedByOrderId: Map<string, number>;
  orderedQtyByOrderId: Map<string, number>;
  /** Qty already reserved by other return requests (excludes current). */
  reservedQtyByOrderId: Map<string, number>;
}): { ok: true } | { ok: false; error: string } {
  for (const [orderId, requested] of input.requestedByOrderId) {
    const ordered = Number(input.orderedQtyByOrderId.get(orderId) ?? 0);
    const reserved = Number(input.reservedQtyByOrderId.get(orderId) ?? 0);
    if (!(ordered > 0)) {
      return {
        ok: false,
        error: `Order ${orderId} has no returnable quantity.`,
      };
    }
    if (requested <= RETURN_QTY_EPS) {
      return { ok: false, error: "Return quantity must be greater than zero." };
    }
    const remaining = ordered - reserved;
    if (requested > remaining + RETURN_QTY_EPS) {
      return {
        ok: false,
        error: `Return quantity exceeds eligible pieces for this order (requested ${formatQty(requested)}, remaining ${formatQty(Math.max(0, remaining))} of ${formatQty(ordered)}).`,
      };
    }
  }
  return { ok: true };
}

function formatQty(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return String(roundMoney(n));
}

/**
 * Max credit for this request's items, reduced by prior APPROVED_CREDIT on the
 * same original orders. Never invents amounts — uses estimateReturnCreditFallback.
 */
export function computeMaxEligibleCredit(input: {
  items: ReturnCreditItemInput[];
  ordersById: Map<string, ReturnCreditOrderSnapshot>;
  invoicesByOrderId?: Map<string, ReturnCreditInvoiceSnapshot>;
  /** Prior approved credit ₹ already issued per original order id. */
  priorCreditedByOrderId: Map<string, number>;
}): number {
  const byOrder = aggregateQuantitiesByOrderId(input.items);
  let total = 0;

  for (const [orderId, qty] of byOrder) {
    const order = input.ordersById.get(orderId);
    if (!order) continue;

    const itemCredit = estimateReturnCreditFallback({
      items: [{ originalOrderId: orderId, quantity: qty }],
      ordersById: input.ordersById,
      invoicesByOrderId: input.invoicesByOrderId,
    });

    const fullCredit = estimateReturnCreditFallback({
      items: [{ originalOrderId: orderId, quantity: Number(order.quantity) }],
      ordersById: input.ordersById,
      invoicesByOrderId: input.invoicesByOrderId,
    });

    const prior = Math.max(0, Number(input.priorCreditedByOrderId.get(orderId) ?? 0));
    const remaining = roundMoney(Math.max(0, fullCredit - prior));
    total += roundMoney(Math.min(itemCredit, remaining));
  }

  return roundMoney(total);
}

/**
 * Resolve the credit amount to post. Never silently caps over-limit input —
 * rejects instead. Missing/non-positive admin amount → use maxEligible (auto).
 */
export function resolveApprovedCreditAmount(input: {
  requestedAmount: unknown;
  maxEligible: number;
}): { ok: true; amount: number } | { ok: false; error: string } {
  const maxEligible = roundMoney(Number(input.maxEligible) || 0);
  if (!(maxEligible > RETURN_CREDIT_MONEY_EPS)) {
    return {
      ok: false,
      error:
        "No eligible credit remains for this return (quantity or prior credits exhausted).",
    };
  }

  const raw = input.requestedAmount;
  const hasExplicit =
    raw !== undefined &&
    raw !== null &&
    raw !== "" &&
    !(typeof raw === "number" && Number.isNaN(raw));

  if (!hasExplicit) {
    return { ok: true, amount: maxEligible };
  }

  const requested = Number(raw);
  if (!Number.isFinite(requested) || requested <= RETURN_CREDIT_MONEY_EPS) {
    return {
      ok: false,
      error: "Approved amount must be a positive number, or leave blank for auto-calc.",
    };
  }

  const amount = roundMoney(requested);
  if (amount > maxEligible + RETURN_CREDIT_MONEY_EPS) {
    return {
      ok: false,
      error: `Approved amount ₹${amount.toFixed(2)} exceeds eligible credit ₹${maxEligible.toFixed(2)} for this return.`,
    };
  }

  return { ok: true, amount };
}

export class ReturnEligibilityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReturnEligibilityError";
  }
}
