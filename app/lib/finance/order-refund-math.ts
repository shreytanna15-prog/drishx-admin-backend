/**
 * Pure OrderRefund math (Phase F) — no Prisma.
 */

export const REFUND_MONEY_EPS = 0.009;

export type RefundStatus = "DUE" | "PARTIAL" | "PAID" | "CANCELLED";

/** amountDue from invoice settlement: money already collected that must be returned. */
export function computeRefundAmountDue(amountPaid: number): number {
  const n = Number(amountPaid);
  if (!Number.isFinite(n) || n <= REFUND_MONEY_EPS) return 0;
  return Math.round(n * 100) / 100;
}

export function refundStatusAfterPayout(
  amountDue: number,
  amountPaid: number
): Exclude<RefundStatus, "CANCELLED"> {
  const due = Number(amountDue);
  const paid = Number(amountPaid);
  if (paid + REFUND_MONEY_EPS >= due) return "PAID";
  if (paid > REFUND_MONEY_EPS) return "PARTIAL";
  return "DUE";
}

export function remainingRefundDue(amountDue: number, amountPaid: number): number {
  const rem = Math.round((Number(amountDue) - Number(amountPaid)) * 100) / 100;
  return rem > REFUND_MONEY_EPS ? rem : 0;
}
