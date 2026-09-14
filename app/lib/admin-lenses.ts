import { adminFetch } from "@/app/lib/admin-api";

export type LensCategoryType = "single-vision" | "kryptok" | "progressive";

export type LensCategory = {
  type: LensCategoryType;
  label: string;
  description: string;
};

export const LENS_CATEGORIES: LensCategory[] = [
  {
    type: "single-vision",
    label: "Single Vision",
    description: "Single vision lens stock by product line",
  },
  {
    type: "kryptok",
    label: "Kryptok",
    description: "Kryptok / bifocal lens stock by product line",
  },
  {
    type: "progressive",
    label: "Progressive",
    description: "Progressive lens stock by product line",
  },
];

export type LensCatalogItem = {
  name: string;
  productCount: number;
  dynamic?: boolean;
};

export type StockLens = {
  id: string;
  lensType: "KRYPTOK" | "PROGRESSIVE" | "SINGLE_VISION";
  costPrice: number | null;
  price: number;
  sph: number | null;
  cyl: number | null;
  axis: number | null;
  add: number | null;
  eye: string | null;
  quantity: number;
  brand: string | null;
  item: string | null;
  coating: string | null;
  category?: string | null;
  index?: number | null;
};

export type LensesPageResponse = {
  items: StockLens[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
};

export function fetchLensCatalogItems(type: LensCategoryType) {
  return adminFetch<{ items: LensCatalogItem[] }>(
    `/api/lenses/items?type=${encodeURIComponent(type)}`
  );
}

export type AdminCatalogProductLine = {
  id: string;
  lensType: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  isSystem: boolean;
  productCount: number;
  createdAt?: string;
  updatedAt?: string;
};

export function fetchAdminCatalogLines(
  type: LensCategoryType,
  options?: { includeInactive?: boolean }
) {
  const params = new URLSearchParams({ type });
  if (options?.includeInactive === false) {
    params.set("includeInactive", "false");
  }
  return adminFetch<{ items: AdminCatalogProductLine[] }>(
    `/api/admin/catalog-lines?${params.toString()}`
  );
}

export function createAdminCatalogLine(body: {
  lensType: LensCategoryType;
  name: string;
  description?: string | null;
  sortOrder?: number;
}) {
  return adminFetch<{ item: AdminCatalogProductLine }>(
    "/api/admin/catalog-lines",
    {
      method: "POST",
      body: JSON.stringify(body),
    }
  );
}

export function createAdminLens(
  lensType: LensCategoryType,
  payload: unknown
) {
  return adminFetch<unknown>(`/api/lenses/${lensType}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateAdminCatalogLine(
  id: string,
  body: {
    name?: string;
    description?: string | null;
    sortOrder?: number;
    isActive?: boolean;
  }
) {
  return adminFetch<{ item: AdminCatalogProductLine }>(
    `/api/admin/catalog-lines/${encodeURIComponent(id)}`,
    {
      method: "PUT",
      body: JSON.stringify(body),
    }
  );
}

export function deleteAdminCatalogLine(id: string, hard = false) {
  const params = hard ? "?hard=true" : "";
  return adminFetch<{
    mode: "deactivated" | "deleted";
    item: AdminCatalogProductLine;
  }>(`/api/admin/catalog-lines/${encodeURIComponent(id)}${params}`, {
    method: "DELETE",
  });
}

export type AdminCoatingFilterLabel = {
  id: string;
  lensType: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  isSystem: boolean;
  productCount: number;
  createdAt?: string;
  updatedAt?: string;
};

export function fetchAdminCoatingFilters(
  type: LensCategoryType,
  options?: { includeInactive?: boolean }
) {
  const params = new URLSearchParams({ type });
  if (options?.includeInactive === false) {
    params.set("includeInactive", "false");
  }
  return adminFetch<{ items: AdminCoatingFilterLabel[] }>(
    `/api/admin/coating-filters?${params.toString()}`
  );
}

export function createAdminCoatingFilter(body: {
  lensType: LensCategoryType;
  name: string;
  description?: string | null;
  sortOrder?: number;
}) {
  return adminFetch<{ item: AdminCoatingFilterLabel }>(
    "/api/admin/coating-filters",
    {
      method: "POST",
      body: JSON.stringify(body),
    }
  );
}

export function updateAdminCoatingFilter(
  id: string,
  body: {
    name?: string;
    description?: string | null;
    sortOrder?: number;
    isActive?: boolean;
  }
) {
  return adminFetch<{ item: AdminCoatingFilterLabel }>(
    `/api/admin/coating-filters/${encodeURIComponent(id)}`,
    {
      method: "PUT",
      body: JSON.stringify(body),
    }
  );
}

export function deleteAdminCoatingFilter(id: string, hard = false) {
  const params = hard ? "?hard=true" : "";
  return adminFetch<{
    mode: "deactivated" | "deleted";
    item: AdminCoatingFilterLabel;
  }>(`/api/admin/coating-filters/${encodeURIComponent(id)}${params}`, {
    method: "DELETE",
  });
}

export function mergeAdminCoatingFilters(sourceId: string, targetId: string) {
  return adminFetch<{
    rewrittenCount: number;
    item: AdminCoatingFilterLabel;
    source: { id: string; name: string; isSystem: boolean };
  }>("/api/admin/coating-filters/merge", {
    method: "POST",
    body: JSON.stringify({ sourceId, targetId }),
  });
}

export function syncAdminCoatingFilters(lensType: LensCategoryType) {
  return adminFetch<{ created: number; skipped: number }>(
    "/api/admin/coating-filters/sync",
    {
      method: "POST",
      body: JSON.stringify({ lensType }),
    }
  );
}

export function fetchStockLensesPage(options: {
  type: LensCategoryType;
  item: string;
  page?: number;
  limit?: number;
  search?: string;
}) {
  const params = new URLSearchParams({
    type: options.type,
    item: options.item,
    page: String(options.page ?? 1),
    limit: String(options.limit ?? 50),
  });
  if (options.search?.trim()) {
    params.set("search", options.search.trim());
  }
  return adminFetch<LensesPageResponse>(`/api/lenses?${params.toString()}`);
}

export function stockTone(quantity: number) {
  if (quantity <= 0) {
    return {
      label: "Out of stock",
      className:
        "border-(--brand-danger-border) bg-(--brand-danger-bg) text-(--brand-danger)",
    };
  }
  if (quantity <= 5) {
    return {
      label: `Low · ${quantity}`,
      className:
        "border-[rgba(240,161,50,0.45)] bg-[rgba(240,161,50,0.12)] text-(--brand-primary)",
    };
  }
  return {
    label: `Qty ${quantity}`,
    className:
      "border-(--brand-success-border) bg-(--brand-success-bg) text-(--brand-success)",
  };
}

export function formatPower(value: number | null | undefined) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  const n = Number(value);
  if (n === 0) return "0.00";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}`;
}
