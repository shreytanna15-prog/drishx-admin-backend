import { adminFetch } from "@/app/lib/admin-api";
import type { Paginated } from "@/app/lib/types/api-client";

export type LoyaltySettings = {
  enabled: boolean;
  pointValue: number | string;
  baseRatePct: number | string;
  advanceBonusPct: number | string;
  fullPaymentRatePct: number | string;
  minMarginPct: number | string;
  maxRedemptionPct: number | string;
  expiryDays: number;
  minInvoiceValue: number | string;
  maxPointsPerInvoice: number | string;
  freightEligible: boolean;
};

export type UpdateLoyaltySettingsPayload = {
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
};

/** GET /api/loyalty/settings — pure api (no React). */
export async function getLoyaltySettings(): Promise<LoyaltySettings> {
  return adminFetch<LoyaltySettings>("/api/loyalty/settings");
}

/** PUT /api/loyalty/settings — pure api (no React). */
export async function updateLoyaltySettings(
  payload: UpdateLoyaltySettingsPayload
): Promise<LoyaltySettings> {
  return adminFetch<LoyaltySettings>("/api/loyalty/settings", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export type LoyaltyCustomerRow = {
  id: string;
  name: string | null;
  email: string;
  businessName: string | null;
  wallet: {
    availablePoints: number;
    pendingPoints: number;
    totalEarned: number;
    totalRedeemed: number;
  };
};

export type ListLoyaltyCustomersParams = {
  page?: number;
  limit?: number;
  q?: string;
};

export type PaginatedLoyaltyCustomers = Paginated<LoyaltyCustomerRow>;

export function buildLoyaltyCustomersQueryString(
  params?: ListLoyaltyCustomersParams
): string {
  const qs = new URLSearchParams();
  if (!params) return "";
  if (params.page != null) qs.set("page", String(params.page));
  if (params.limit != null) qs.set("limit", String(params.limit));
  if (params.q?.trim()) qs.set("q", params.q.trim());
  const s = qs.toString();
  return s ? `?${s}` : "";
}

export function normalizeLoyaltyCustomersResponse(
  data: unknown
): PaginatedLoyaltyCustomers {
  if (Array.isArray(data)) {
    return {
      items: data as LoyaltyCustomerRow[],
      page: 1,
      limit: data.length,
      hasMore: false,
      total: data.length,
    };
  }
  const body = data as Partial<PaginatedLoyaltyCustomers> & {
    customers?: LoyaltyCustomerRow[];
  } | null;
  const items = Array.isArray(body?.items)
    ? body.items
    : Array.isArray(body?.customers)
      ? body.customers
      : [];
  return {
    items,
    page: typeof body?.page === "number" ? body.page : 1,
    limit: typeof body?.limit === "number" ? body.limit : items.length,
    hasMore: Boolean(body?.hasMore),
    total: typeof body?.total === "number" ? body.total : undefined,
  };
}

export async function listLoyaltyCustomers(
  params?: ListLoyaltyCustomersParams
): Promise<PaginatedLoyaltyCustomers> {
  const data = await adminFetch<unknown>(
    `/api/loyalty/customers${buildLoyaltyCustomersQueryString(params)}`
  );
  return normalizeLoyaltyCustomersResponse(data);
}
