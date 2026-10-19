/**
 * Pure loyalty reverse math (no Prisma).
 * Successive returns must use remaining taxable / remaining points, not
 * remainingPoints × (returned / originalTaxable).
 */

import { roundMoney } from "@/app/lib/finance/tax-calc";

export const LOYALTY_REVERSE_EPS = 0.009;

/**
 * Points to reverse for this return credit.
 * remainingTaxable = original invoice taxable − prior credited taxable on that invoice.
 * remainingPoints = points still on earn rows (after prior reverses).
 */
export function computeLoyaltyReversePoints(input: {
  originalTaxable: number;
  /** Taxable already reversed via prior approved credits on this invoice. */
  priorReturnedTaxable: number;
  /** This credit's tax-exclusive share. */
  returnedTaxable: number;
  /** Points still sitting on earn / bonus rows. */
  remainingPoints: number;
}): number {
  const originalTaxable = Number(input.originalTaxable) || 0;
  const prior = Math.max(0, Number(input.priorReturnedTaxable) || 0);
  const returned = Math.max(0, Number(input.returnedTaxable) || 0);
  const remainingPoints = Math.max(0, Number(input.remainingPoints) || 0);

  if (
    originalTaxable <= LOYALTY_REVERSE_EPS ||
    returned <= LOYALTY_REVERSE_EPS ||
    remainingPoints <= LOYALTY_REVERSE_EPS
  ) {
    return 0;
  }

  const remainingTaxable = roundMoney(
    Math.max(0, originalTaxable - prior)
  );
  if (remainingTaxable <= LOYALTY_REVERSE_EPS) return 0;

  const cappedReturned = roundMoney(Math.min(returned, remainingTaxable));
  // Share of remaining points proportional to share of remaining taxable.
  return roundMoney((remainingPoints * cappedReturned) / remainingTaxable);
}
