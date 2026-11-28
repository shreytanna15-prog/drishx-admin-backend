/**
 * Admin client wrappers for Storefront Catalog APIs.
 */

import { adminFetch } from "@/app/lib/admin-api";

export type StorefrontFamily = {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
  cardCount: number;
};

export type StorefrontCardFilters = {
  baseId: string | null;
  materialId: string | null;
  indexId: string | null;
  coatingId: string | null;
  colorId: string | null;
  diameterId: string | null;
  progressiveTypeId: string | null;
};

export type StorefrontCard = {
  id: string;
  familyId: string;
  familyCode: string;
  familyName: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  filters: StorefrontCardFilters;
  filterLabels: Record<string, string>;
  filterSummary: string;
  productCount: number;
  createdAt: string;
  updatedAt: string;
};

export type StorefrontMembershipSource = "matched" | "pinned" | "excluded";

export type StorefrontMembershipItem = {
  productId: string;
  baseCode: string;
  isActive: boolean;
  variantCount: number;
  familyCode: string;
  familyName: string;
  summary: string;
  coatingName: string | null;
  source: StorefrontMembershipSource;
};

export type StorefrontPinCandidate = {
  productId: string;
  baseCode: string;
  isActive: boolean;
  variantCount: number;
  familyCode: string;
  familyName: string;
  summary: string;
  coatingName: string | null;
};

export type StorefrontFilterInput = {
  baseId?: string | null;
  materialId?: string | null;
  indexId?: string | null;
  coatingId?: string | null;
  colorId?: string | null;
  diameterId?: string | null;
  progressiveTypeId?: string | null;
};

export type StorefrontOverrideKind = "PIN" | "EXCLUDE";

export function fetchStorefrontFamilies() {
  return adminFetch<{ items: StorefrontFamily[] }>(
    "/api/admin/storefront/families"
  );
}

export function fetchStorefrontCards(opts: {
  familyId?: string;
  familyCode?: string;
  includeInactive?: boolean;
}) {
  const params = new URLSearchParams();
  if (opts.familyId) params.set("familyId", opts.familyId);
  if (opts.familyCode) params.set("familyCode", opts.familyCode);
  if (opts.includeInactive === false) params.set("includeInactive", "false");
  return adminFetch<{ items: StorefrontCard[] }>(
    `/api/admin/storefront/cards?${params.toString()}`
  );
}

export function createStorefrontCard(body: {
  familyId: string;
  name: string;
  description?: string | null;
  sortOrder?: number;
  filters?: StorefrontFilterInput;
}) {
  return adminFetch<{ item: StorefrontCard }>("/api/admin/storefront/cards", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateStorefrontCard(
  id: string,
  body: {
    name?: string;
    description?: string | null;
    sortOrder?: number;
    isActive?: boolean;
    filters?: StorefrontFilterInput;
  }
) {
  return adminFetch<{ item: StorefrontCard }>(
    `/api/admin/storefront/cards/${id}`,
    { method: "PATCH", body: JSON.stringify(body) }
  );
}

export function deleteStorefrontCard(id: string) {
  return adminFetch<{
    deleted: boolean;
    hidden: boolean;
    item?: StorefrontCard;
  }>(`/api/admin/storefront/cards/${id}`, { method: "DELETE" });
}

export function fetchStorefrontCardProducts(
  cardId: string,
  opts?: { q?: string; includeInactiveProducts?: boolean }
) {
  const params = new URLSearchParams();
  if (opts?.q) params.set("q", opts.q);
  if (opts?.includeInactiveProducts) params.set("includeInactiveProducts", "true");
  const qs = params.toString();
  return adminFetch<{
    card: StorefrontCard;
    items: StorefrontMembershipItem[];
    excluded?: StorefrontMembershipItem[];
  }>(
    `/api/admin/storefront/cards/${cardId}/products${qs ? `?${qs}` : ""}`
  );
}

export function upsertStorefrontOverride(
  cardId: string,
  body: { lensProductId: string; kind: StorefrontOverrideKind }
) {
  return adminFetch<{ ok: true }>(
    `/api/admin/storefront/cards/${cardId}/overrides`,
    {
      method: "POST",
      body: JSON.stringify(body),
    }
  );
}

export function clearStorefrontOverride(cardId: string, productId: string) {
  return adminFetch<{ cleared: boolean }>(
    `/api/admin/storefront/cards/${cardId}/overrides/${productId}`,
    { method: "DELETE" }
  );
}

export function fetchPinCandidates(opts: {
  familyId: string;
  cardId: string;
  q?: string;
  limit?: number;
}) {
  const params = new URLSearchParams({
    familyId: opts.familyId,
    cardId: opts.cardId,
  });
  if (opts.q) params.set("q", opts.q);
  if (opts.limit) params.set("limit", String(opts.limit));
  return adminFetch<{ items: StorefrontPinCandidate[] }>(
    `/api/admin/storefront/products/pin-candidates?${params.toString()}`
  );
}