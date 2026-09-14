import type { LoyaltySettings } from "@prisma/client";
import { roundMoney } from "@/app/lib/finance/tax-calc";
import { getOrderGrossCost } from "./cost";

export type LoyaltyRateKind = "advance" | "full";

/**
 * Compute the loyalty points (in X Points, 1 point = ₹1) for a fully-paid
 * invoice/order.
 *
 * - Points are based on the invoice's TAXABLE amount (excludes GST).
 * - Advance full payment earns base + advance bonus; on-time full payment earns
 *   only the base/full-payment rate.
 * - Minimum-margin protection (Option B): if the order's gross margin is below
 *   the configured floor, NO points are awarded at all.
 * - When cost data is unavailable (e.g. wholesale powerKey lines), margin
 *   protection is skipped and points are awarded normally.
 *
 * Returns 0 points + a reason when margin protection blocks.
 */
export async function computeOrderLoyalty(input: {
  orderId: string;
  taxableAmount: number;
  rateKind: LoyaltyRateKind;
  settings: LoyaltySettings;
}): Promise<{ points: number; reason: string | null }> {
  const { orderId, taxableAmount, rateKind, settings } = input;

  if (!settings.enabled) return { points: 0, reason: "disabled" };
  if (taxableAmount <= 0) return { points: 0, reason: "zero-value" };

  const minInvoice = Number(settings.minInvoiceValue) || 0;
  if (taxableAmount < minInvoice) {
    return { points: 0, reason: "below-min-invoice" };
  }

  // Margin protection: only when we have cost data.
  const cost = await getOrderGrossCost(orderId);
  if (cost > 0) {
    const grossMargin = (taxableAmount - cost) / taxableAmount;
    const marginPct = grossMargin * 100;
    const minMargin = Number(settings.minMarginPct) || 0;
    if (marginPct < minMargin) {
      return { points: 0, reason: "margin-protection" };
    }
  }

  const baseRate = Number(settings.baseRatePct) / 100;
  const advanceBonus = Number(settings.advanceBonusPct) / 100;
  const fullRate = Number(settings.fullPaymentRatePct) / 100;
  const effectiveRate =
    rateKind === "advance" ? baseRate + advanceBonus : fullRate;

  let points = taxableAmount * effectiveRate;

  const maxPerInvoice = Number(settings.maxPointsPerInvoice) || 0;
  if (maxPerInvoice > 0 && points > maxPerInvoice) {
    points = maxPerInvoice;
  }

  return { points: roundMoney(points), reason: null };
}
