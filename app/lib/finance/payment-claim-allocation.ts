/**
 * Pure PaymentClaimItem → invoice allocation (no Prisma).
 * Explicit item amounts win when any are set; otherwise equal-split the claim.
 */

import { roundMoney } from "./tax-calc";

const EPS = 0.009;

/**
 * Build claim invoice allocations from claim items.
 * When any item has a positive explicit amount, those amounts are used as-is
 * (items without amounts are omitted). Otherwise equal-split claimAmount.
 */
export function resolvePaymentClaimItemAllocations(input: {
  claimAmount: number;
  items: Array<{ invoiceId: string; amount?: number | null }>;
}): Array<{ invoiceId: string; amount: number }> {
  const items = input.items.filter((i) => Boolean(i.invoiceId));
  if (items.length === 0) return [];

  const explicit = items.filter(
    (i) =>
      i.amount != null &&
      Number.isFinite(Number(i.amount)) &&
      Number(i.amount) > EPS
  );

  if (explicit.length > 0) {
    return explicit.map((i) => ({
      invoiceId: i.invoiceId,
      amount: roundMoney(Number(i.amount)),
    }));
  }

  const claimAmount = roundMoney(Number(input.claimAmount) || 0);
  if (!(claimAmount > EPS)) return [];

  const n = items.length;
  const share = roundMoney(claimAmount / n);
  let allocated = 0;
  return items.map((i, idx) => {
    const amount =
      idx === n - 1 ? roundMoney(claimAmount - allocated) : share;
    allocated = roundMoney(allocated + amount);
    return { invoiceId: i.invoiceId, amount };
  });
}
