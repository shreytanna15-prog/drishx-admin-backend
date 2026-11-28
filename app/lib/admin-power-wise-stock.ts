/**
 * Client wrappers for Power-wise Inventory (admin read-only browse).
 */

import { adminFetch } from "@/app/lib/admin-api";
import { downloadAuthenticatedFile } from "@/app/lib/admin-purchase-orders";
import type {
  CatalogMatrixFamilyCaps,
  CatalogMatrixModel,
} from "@/app/lib/catalog/catalog-matrix";

export type PowerWiseProductCard = {
  productId: string;
  name: string;
  familyCode: string;
  familyName: string;
  baseName: string;
  materialName: string | null;
  indexValue: number | null;
  coatingName: string | null;
  colorName: string | null;
  diameterName: string | null;
  progressiveTypeName: string | null;
  familyId: string;
  baseId: string;
  materialId: string | null;
  indexId: string | null;
  coatingId: string | null;
  colorId: string | null;
  diameterId: string | null;
  progressiveTypeId: string | null;
  variantCount: number;
  leafCount: number;
  totalOnHand: number;
  totalReserved: number;
  totalAvailable: number;
  totalBlocked: number;
  activeShortagesCount: number;
};

/** Level 2 — one catalog matrix sheet (power range + axis). */
export type PowerWiseVariantRow = {
  id: string;
  groupKey: string;
  skuCode: string;
  name: string;
  isActive: boolean;
  sphMin: number;
  sphMax: number;
  cylMin: number;
  cylMax: number;
  axis: number | null;
  rangeLabel: string;
  additions: number[];
  eyes: string[];
  variantCount: number;
  variantIds: string[];
  totalOnHand: number;
  totalReserved: number;
  totalAvailable: number;
  totalBlocked: number;
};

export type PowerWiseMatrixCell = {
  onHand: number;
  reserved: number;
  available: number;
  blocked: number;
};

export type PowerWiseVariantMatrix = {
  productId: string;
  variantId: string;
  groupKey: string;
  skuCode: string;
  name: string;
  rangeLabel: string;
  axis: number | null;
  additions: number[];
  eyes: string[];
  variantCount: number;
  family: CatalogMatrixFamilyCaps & { code: string; name: string };
  variants: Array<{
    id: string;
    sphMin: number;
    sphMax: number;
    cylMin: number;
    cylMax: number;
    axis: number | null;
    eye: string | null;
    addition: { value: number | null } | null;
    addMin: number | null;
  }>;
  leaves: Record<string, PowerWiseMatrixCell>;
  matrix: CatalogMatrixModel;
};

export function fetchPowerWiseProducts(params?: {
  q?: string;
  familyCode?: string;
  familyId?: string;
  baseId?: string;
  materialId?: string;
  indexId?: string;
  coatingId?: string;
  colorId?: string;
  diameterId?: string;
  progressiveTypeId?: string;
  shortageOnly?: boolean;
}) {
  const sp = new URLSearchParams();
  if (params?.q) sp.set("q", params.q);
  if (params?.familyCode) sp.set("familyCode", params.familyCode);
  if (params?.familyId) sp.set("familyId", params.familyId);
  if (params?.baseId) sp.set("baseId", params.baseId);
  if (params?.materialId) sp.set("materialId", params.materialId);
  if (params?.indexId) sp.set("indexId", params.indexId);
  if (params?.coatingId) sp.set("coatingId", params.coatingId);
  if (params?.colorId) sp.set("colorId", params.colorId);
  if (params?.diameterId) sp.set("diameterId", params.diameterId);
  if (params?.progressiveTypeId) {
    sp.set("progressiveTypeId", params.progressiveTypeId);
  }
  if (params?.shortageOnly) sp.set("shortageOnly", "true");
  const qs = sp.toString();
  return adminFetch<{ products: PowerWiseProductCard[] }>(
    `/api/admin/stock/power-wise/products${qs ? `?${qs}` : ""}`
  );
}

export function fetchPowerWiseVariants(
  productId: string,
  params?: {
    q?: string;
    includeInactive?: boolean;
    axis?: number;
  }
) {
  const sp = new URLSearchParams();
  if (params?.q) sp.set("q", params.q);
  if (params?.includeInactive) sp.set("includeInactive", "true");
  if (params?.axis != null) sp.set("axis", String(params.axis));
  const qs = sp.toString();
  return adminFetch<{
    product: {
      productId: string;
      name: string;
      familyCode: string;
      familyName: string;
    };
    variants: PowerWiseVariantRow[];
  }>(
    `/api/admin/stock/power-wise/products/${productId}/variants${
      qs ? `?${qs}` : ""
    }`
  );
}

export function fetchPowerWiseVariantMatrix(
  productId: string,
  variantId: string
) {
  return adminFetch<PowerWiseVariantMatrix>(
    `/api/admin/stock/power-wise/products/${productId}/variants/${variantId}/matrix`
  );
}

export async function downloadPowerWiseVariantExport(
  productId: string,
  variantId: string,
  format: "xlsx" | "pdf"
) {
  await downloadAuthenticatedFile(
    `/api/admin/stock/power-wise/products/${productId}/variants/${variantId}/export?format=${format}`,
    `power-wise-matrix.${format === "xlsx" ? "xlsx" : "pdf"}`
  );
}
