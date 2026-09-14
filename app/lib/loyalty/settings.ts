import type { Prisma } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";

/**
 * Company-wide loyalty (X Points) policy, singletons by id="default".
 * Returns the stored settings, creating a default row on first access.
 */
export async function getLoyaltySettings() {
  const existing = await prisma.loyaltySettings.findUnique({
    where: { id: "default" },
  });
  if (existing) return existing;
  return prisma.loyaltySettings.create({ data: { id: "default" } });
}

export type LoyaltySettingsUpdate = Partial<{
  enabled: boolean;
  pointValue: number;
  baseRatePct: number;
  advanceBonusPct: number;
  fullPaymentRatePct: number;
  minMarginPct: number;
  maxRedemptionPct: number;
  expiryDays: number;
  minInvoiceValue: number;
  maxPointsPerInvoice: number;
  freightEligible: boolean;
}>;

export async function updateLoyaltySettings(input: LoyaltySettingsUpdate) {
  return prisma.loyaltySettings.upsert({
    where: { id: "default" },
    create: { id: "default", ...input },
    update: input,
  });
}

export function decimal(n: number): Prisma.Decimal {
  return n as unknown as Prisma.Decimal;
}
