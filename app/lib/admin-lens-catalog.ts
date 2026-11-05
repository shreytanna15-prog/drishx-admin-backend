/**
 * Client wrappers for Lens* attribute masters + LensProduct parent/variants (RC-04).
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

export type LensAttrRef = { id: string; code: string; name: string };

export type LensProductVariant = {
  id: string;
  productId: string;
  powerRangeId: string;
  skuCode: string;
  name: string;
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
  powerRange: {
    id: string;
    label: string;
    cylSummary: string;
    sphMin: number;
    sphMax: number;
    cylMin: number;
    cylMax: number;
  };
  rangeLabel: string;
  rangeSummary: string;
  product: {
    id: string;
    baseCode: string;
    familyId: string;
    baseId: string;
    materialId: string | null;
    indexId: string | null;
    colorId: string | null;
    family: LensAttrRef;
    base: LensAttrRef;
    material: LensAttrRef | null;
    index: (LensAttrRef & { value: number | null }) | null;
    color: LensAttrRef | null;
    attributeSummary: string;
  };
};

export type LensProduct = {
  id: string;
  baseCode: string;
  familyId: string;
  baseId: string;
  materialId: string | null;
  indexId: string | null;
  colorId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  family: LensAttrRef;
  base: LensAttrRef;
  material: LensAttrRef | null;
  index: (LensAttrRef & { value: number | null }) | null;
  color: LensAttrRef | null;
  attributeSummary: string;
  variantCount: number;
  variants: LensProductVariant[];
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

export type VariantPreview = {
  powerRangeId: string;
  skuCode: string;
  name: string;
  rangeLabel: string;
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
  view?: "flat" | "grouped";
  q?: string;
  familyId?: string;
  baseId?: string;
  materialId?: string;
  powerRangeId?: string;
  isActive?: boolean | null;
  page?: number;
  limit?: number;
}) {
  const sp = new URLSearchParams();
  sp.set("view", params?.view ?? "flat");
  if (params?.q) sp.set("q", params.q);
  if (params?.familyId) sp.set("familyId", params.familyId);
  if (params?.baseId) sp.set("baseId", params.baseId);
  if (params?.materialId) sp.set("materialId", params.materialId);
  if (params?.powerRangeId) sp.set("powerRangeId", params.powerRangeId);
  if (params?.isActive === true) sp.set("isActive", "true");
  if (params?.isActive === false) sp.set("isActive", "false");
  if (params?.page) sp.set("page", String(params.page));
  if (params?.limit) sp.set("limit", String(params.limit));
  return adminFetch<
    Paginated<LensProductVariant | LensProduct> & {
      items: Array<LensProductVariant | LensProduct>;
      view: "flat" | "grouped";
    }
  >(`/api/admin/catalog/lens-products?${sp.toString()}`);
}

export function fetchLensProduct(id: string) {
  return adminFetch<{ product: LensProduct }>(
    `/api/admin/catalog/lens-products/${id}`
  );
}

export function fetchLensProductVariant(id: string) {
  return adminFetch<{ variant: LensProductVariant }>(
    `/api/admin/catalog/lens-products/variants/${id}`
  );
}

export function createLensProductRequest(body: Record<string, unknown>) {
  return adminFetch<{ product: LensProduct }>(
    `/api/admin/catalog/lens-products`,
    { method: "POST", body: JSON.stringify(body) }
  );
}

export function previewLensProductRequest(body: Record<string, unknown>) {
  return adminFetch<{
    preview: {
      baseCode: string;
      existingParentId: string | null;
      variants: VariantPreview[];
    };
  }>(`/api/admin/catalog/lens-products`, {
    method: "POST",
    body: JSON.stringify({ ...body, preview: true }),
  });
}

export function addLensProductVariantsRequest(
  productId: string,
  body: { powerRangeIds: string[]; defaultPrice?: number | null }
) {
  return adminFetch<{ product: LensProduct }>(
    `/api/admin/catalog/lens-products/${productId}`,
    { method: "POST", body: JSON.stringify(body) }
  );
}

export function updateLensProductVariantRequest(
  id: string,
  body: Record<string, unknown>
) {
  return adminFetch<{ variant: LensProductVariant }>(
    `/api/admin/catalog/lens-products/variants/${id}`,
    { method: "PATCH", body: JSON.stringify(body) }
  );
}

export { steppedRange as steppedPowerRange } from "./catalog/lens-product-range";
export {
  formatCylSummary,
  formatPowerLabel,
  formatPowerRangeCompact,
  formatPowerRangeLabel,
  formatPowerRangeSpan,
  getPowerSelectOptions,
} from "./catalog/catalog-power-select-options";
