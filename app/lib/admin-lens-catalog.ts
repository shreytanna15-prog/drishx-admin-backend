/**
 * Client wrappers for Lens* attribute masters + LensProduct SKU catalog.
 */

import { adminFetch } from "./admin-api";
import type { Paginated } from "./types/api-client";

export type LensAttributeType =
  | "family"
  | "base"
  | "material"
  | "index"
  | "coating"
  | "color";

export type LensAttribute = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
  value?: number;
  createdAt: string;
  updatedAt: string;
};

/** RC-03 power-range master (SPH/CYL bounds). `label` is `-6.00/+2.00`. */
export type LensPowerRange = {
  id: string;
  label: string;
  cylSummary: string;
  sphMin: number;
  sphMax: number;
  cylMin: number;
  cylMax: number;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type LensPowerRangeBounds = {
  sphMin: number;
  sphMax: number;
  cylMin: number;
  cylMax: number;
};

export type LensProduct = {
  id: string;
  skuCode: string;
  name: string;
  familyId: string;
  baseId: string;
  materialId: string | null;
  indexId: string | null;
  coatingId: string | null;
  colorId: string | null;
  powerRangeId: string | null;
  rangeType: string;
  sphMin: number;
  sphMax: number;
  cylMin: number;
  cylMax: number;
  addMin: number | null;
  addMax: number | null;
  axis: number | null;
  eye: string | null;
  defaultPrice: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  family: { id: string; code: string; name: string };
  base: { id: string; code: string; name: string };
  material: { id: string; code: string; name: string } | null;
  index: { id: string; code: string; name: string; value: number | null } | null;
  coating: { id: string; code: string; name: string } | null;
  color: { id: string; code: string; name: string } | null;
  powerRange: { id: string; label: string; cylSummary: string } | null;
  attributeSummary: string;
  rangeLabel: string;
  rangeSummary: string;
};

export type CompatibilityResponse = {
  bases: Array<{
    baseId: string;
    baseCode: string;
    baseName: string;
    materials: Array<{
      id: string;
      code: string;
      name: string;
      isActive: boolean;
    }>;
  }>;
};

export function fetchLensAttributes(
  type: LensAttributeType,
  opts?: { activeOnly?: boolean }
) {
  const sp = new URLSearchParams();
  if (opts?.activeOnly) sp.set("activeOnly", "true");
  const qs = sp.toString();
  return adminFetch<{ type: string; items: LensAttribute[] }>(
    `/api/admin/catalog/attributes/${type}${qs ? `?${qs}` : ""}`
  );
}

export function createLensAttributeRequest(
  type: LensAttributeType,
  body: {
    code: string;
    name: string;
    sortOrder?: number;
    isActive?: boolean;
    value?: number | null;
  }
) {
  return adminFetch<{ item: LensAttribute }>(
    `/api/admin/catalog/attributes/${type}`,
    { method: "POST", body: JSON.stringify(body) }
  );
}

export function updateLensAttributeRequest(
  type: LensAttributeType,
  id: string,
  body: {
    code?: string;
    name?: string;
    sortOrder?: number;
    isActive?: boolean;
    value?: number | null;
  }
) {
  return adminFetch<{ item: LensAttribute }>(
    `/api/admin/catalog/attributes/${type}/${id}`,
    { method: "PATCH", body: JSON.stringify(body) }
  );
}

export function fetchLensPowerRanges(opts?: { activeOnly?: boolean }) {
  const sp = new URLSearchParams();
  if (opts?.activeOnly) sp.set("activeOnly", "true");
  const qs = sp.toString();
  return adminFetch<{ items: LensPowerRange[] }>(
    `/api/admin/catalog/power-ranges${qs ? `?${qs}` : ""}`
  );
}

export function createLensPowerRangeRequest(
  body: LensPowerRangeBounds & { sortOrder?: number; isActive?: boolean }
) {
  return adminFetch<{ item: LensPowerRange }>(`/api/admin/catalog/power-ranges`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function updateLensPowerRangeRequest(
  id: string,
  body: Partial<LensPowerRangeBounds> & { sortOrder?: number; isActive?: boolean }
) {
  return adminFetch<{ item: LensPowerRange }>(
    `/api/admin/catalog/power-ranges/${id}`,
    { method: "PATCH", body: JSON.stringify(body) }
  );
}

export function fetchAttributeCompatibility(baseId?: string) {
  const sp = new URLSearchParams();
  if (baseId) sp.set("baseId", baseId);
  const qs = sp.toString();
  return adminFetch<CompatibilityResponse>(
    `/api/admin/catalog/attributes/compatibility${qs ? `?${qs}` : ""}`
  );
}

export function fetchLensProducts(params?: {
  q?: string;
  familyId?: string;
  baseId?: string;
  materialId?: string;
  isActive?: boolean | null;
  page?: number;
  limit?: number;
}) {
  const sp = new URLSearchParams();
  if (params?.q) sp.set("q", params.q);
  if (params?.familyId) sp.set("familyId", params.familyId);
  if (params?.baseId) sp.set("baseId", params.baseId);
  if (params?.materialId) sp.set("materialId", params.materialId);
  if (params?.isActive === true) sp.set("isActive", "true");
  if (params?.isActive === false) sp.set("isActive", "false");
  if (params?.page) sp.set("page", String(params.page));
  if (params?.limit) sp.set("limit", String(params.limit));
  return adminFetch<Paginated<LensProduct> & { items: LensProduct[] }>(
    `/api/admin/catalog/lens-products?${sp.toString()}`
  );
}

export function fetchLensProduct(id: string) {
  return adminFetch<{ product: LensProduct }>(
    `/api/admin/catalog/lens-products/${id}`
  );
}

export function createLensProductRequest(body: Record<string, unknown>) {
  return adminFetch<{ product: LensProduct }>(
    `/api/admin/catalog/lens-products`,
    { method: "POST", body: JSON.stringify(body) }
  );
}

export function updateLensProductRequest(
  id: string,
  body: Record<string, unknown>
) {
  return adminFetch<{ product: LensProduct }>(
    `/api/admin/catalog/lens-products/${id}`,
    { method: "PATCH", body: JSON.stringify(body) }
  );
}

export { steppedRange as steppedPowerRange } from "./catalog/lens-product-range";
export {
  formatCylSummary,
  formatPowerLabel,
  formatPowerRangeLabel,
  getPowerSelectOptions,
} from "./catalog/catalog-power-select-options";
