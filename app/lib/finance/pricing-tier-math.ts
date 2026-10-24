import { roundMoney } from "./tax-calc";

export type ResolvedPricingTier = {
  id: string;
  code: string;
  discountPercent: number;
  isBase: boolean;
};

export function applyTierDiscount(
  subtotal: number,
  discountPercent: number
): number {
  const pct = Math.min(100, Math.max(0, Number(discountPercent) || 0));
  return roundMoney(subtotal * (1 - pct / 100));
}

export function tierDiscountAmount(
  subtotal: number,
  discountPercent: number
): number {
  return roundMoney(Number(subtotal) - applyTierDiscount(subtotal, discountPercent));
}

export function buildOrderTierSnapshot(
  tier: ResolvedPricingTier,
  grossSubtotal: number
): {
  tierCode: string;
  tierDiscountPercent: number;
  tierDiscountAmount: number;
  totalAfterTier: number;
} {
  const tierDiscountPercent = tier.discountPercent;
  const totalAfterTier = applyTierDiscount(grossSubtotal, tierDiscountPercent);
  return {
    tierCode: tier.code,
    tierDiscountPercent,
    tierDiscountAmount: tierDiscountAmount(grossSubtotal, tierDiscountPercent),
    totalAfterTier,
  };
}
