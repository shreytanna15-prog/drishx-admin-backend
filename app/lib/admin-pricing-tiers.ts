import { adminFetch } from "@/app/lib/admin-api";

export type AdminPricingTier = {
  id: string;
  code: string;
  name: string | null;
  discountPercent: number;
  isBase: boolean;
  isActive: boolean;
  sortOrder: number;
  updatedAt: string;
};

export async function listPricingTiers(): Promise<AdminPricingTier[]> {
  const data = await adminFetch<{ tiers: AdminPricingTier[] }>(
    "/api/admin/pricing-tiers"
  );
  return Array.isArray(data.tiers) ? data.tiers : [];
}

export async function savePricingTiers(
  tiers: Array<{ code: string; discountPercent: number }>
): Promise<AdminPricingTier[]> {
  const data = await adminFetch<{ tiers: AdminPricingTier[] }>(
    "/api/admin/pricing-tiers",
    { method: "PUT", body: JSON.stringify({ tiers }) }
  );
  return Array.isArray(data.tiers) ? data.tiers : [];
}
