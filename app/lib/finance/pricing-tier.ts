/**
 * Pricing tier A–F helpers — discount before GST (Phase D).
 */

import type { PricingTier } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import {
  applyTierDiscount,
  buildOrderTierSnapshot,
  tierDiscountAmount,
  type ResolvedPricingTier,
} from "./pricing-tier-math";

export const PRICING_TIER_CODES = ["A", "B", "C", "D", "E", "F"] as const;
export type PricingTierCode = (typeof PRICING_TIER_CODES)[number];

export type { ResolvedPricingTier };
export { applyTierDiscount, buildOrderTierSnapshot, tierDiscountAmount };

export function serializePricingTier(tier: PricingTier) {
  return {
    id: tier.id,
    code: tier.code,
    name: tier.name,
    discountPercent: Number(tier.discountPercent),
    isBase: tier.isBase,
    isActive: tier.isActive,
    sortOrder: tier.sortOrder,
    updatedAt: tier.updatedAt.toISOString(),
  };
}

export async function ensurePricingTiersSeeded(): Promise<void> {
  const count = await prisma.pricingTier.count();
  if (count >= 6) return;
  const rows = PRICING_TIER_CODES.map((code, i) => ({
    id: `pricing_tier_${code.toLowerCase()}`,
    code,
    name: code === "D" ? "Tier D (Base)" : `Tier ${code}`,
    discountPercent: 0,
    isBase: code === "D",
    isActive: true,
    sortOrder: i + 1,
  }));
  for (const row of rows) {
    await prisma.pricingTier.upsert({
      where: { code: row.code },
      create: row,
      update: {},
    });
  }
}

export async function getBasePricingTier(): Promise<ResolvedPricingTier> {
  await ensurePricingTiersSeeded();
  const tier =
    (await prisma.pricingTier.findFirst({
      where: { isBase: true, isActive: true },
      orderBy: { sortOrder: "asc" },
    })) ??
    (await prisma.pricingTier.findUnique({ where: { code: "D" } }));
  if (!tier) {
    throw new Error("Base pricing tier D is missing.");
  }
  return {
    id: tier.id,
    code: tier.code,
    discountPercent: Number(tier.discountPercent),
    isBase: tier.isBase,
  };
}

export async function resolveCustomerPricingTier(
  customerId: string
): Promise<ResolvedPricingTier> {
  const user = await prisma.user.findUnique({
    where: { id: customerId },
    select: {
      pricingTierId: true,
      pricingTier: true,
    },
  });
  if (user?.pricingTier && user.pricingTier.isActive) {
    return {
      id: user.pricingTier.id,
      code: user.pricingTier.code,
      discountPercent: Number(user.pricingTier.discountPercent),
      isBase: user.pricingTier.isBase,
    };
  }
  return getBasePricingTier();
}
