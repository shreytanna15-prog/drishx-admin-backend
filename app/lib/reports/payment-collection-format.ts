export type PaymentCollectionSource = "direct" | "confirmed_claim";

/**
 * Classify a payment row for the collection report.
 * Confirmed claims create a Payment with claimId — amounts must come from Payment only.
 */
export function paymentCollectionSource(
  claimId: string | null | undefined
): PaymentCollectionSource {
  return claimId ? "confirmed_claim" : "direct";
}

export function sumPaymentCollectionAmounts(
  payments: Array<{ amount: unknown; claimId?: string | null }>
): {
  totalCollected: number;
  directAmount: number;
  claimLinkedAmount: number;
  directCount: number;
  claimLinkedCount: number;
} {
  const money = (n: number) => Math.round(n * 100) / 100;
  let totalCollected = 0;
  let directAmount = 0;
  let claimLinkedAmount = 0;
  let directCount = 0;
  let claimLinkedCount = 0;

  for (const p of payments) {
    const amount = Number(p.amount);
    totalCollected += amount;
    if (paymentCollectionSource(p.claimId) === "confirmed_claim") {
      claimLinkedAmount += amount;
      claimLinkedCount += 1;
    } else {
      directAmount += amount;
      directCount += 1;
    }
  }

  return {
    totalCollected: money(totalCollected),
    directAmount: money(directAmount),
    claimLinkedAmount: money(claimLinkedAmount),
    directCount,
    claimLinkedCount,
  };
}
