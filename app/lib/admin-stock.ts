import { adminFetch } from "@/app/lib/admin-api";
import type { Paginated } from "@/app/lib/types/api-client";
import {
  CATALOG_STOCK_ADJUSTMENT_REASON_LABELS,
  CATALOG_STOCK_ADJUSTMENT_REASONS,
  type CatalogStockAdjustmentReasonCode,
} from "@/app/lib/catalog/catalog-stock-adjustment-core";

export {
  CATALOG_STOCK_ADJUSTMENT_REASON_LABELS,
  CATALOG_STOCK_ADJUSTMENT_REASONS,
  type CatalogStockAdjustmentReasonCode,
};

export type CatalogStockOpenPo = {
  id: string;
  publicId: string;
  status: string;
};

export type CatalogStockPower = {
  id: string;
  leafKey: string;
  variantId: string;
  productId: string;
  skuCode: string;
  name: string;
  sph: number;
  cyl: number;
  axis: number | null;
  eye: string | null;
  addition: number | null;
  family: string;
  onHand: number;
  blockedQty: number;
  reservedQty: number;
  available: number;
  incoming: number;
  minStock: number;
  targetStock: number;
  openPo: CatalogStockOpenPo | null;
  legacyLensType?: string | null;
  legacyLensId?: string | null;
  updatedAt: string;
};

export type CatalogStockProductCard = {
  productId: string;
  name: string;
  familyCode: string;
  familyName: string;
  baseName: string;
  materialName: string | null;
  indexValue: number | null;
  coatingName: string | null;
  colorName: string | null;
  variantCount: number;
  leafCount: number;
  totalOnHand: number;
  totalReserved: number;
  totalAvailable: number;
  totalBlocked: number;
  activeShortagesCount: number;
  openPoCount: number;
};

export type CatalogStockOverview = {
  leafCount: number;
  onHandSum: number;
  blockedSum: number;
  availableSum: number;
  reservedSum: number;
  shortageCount: number;
  openPoLeafCount: number;
  topShortages: Array<{
    id: string;
    productId: string;
    skuCode: string;
    name: string;
    family: string;
    available: number;
    minStock: number;
    targetStock: number;
    incoming: number;
    openPoPublicId: string | null;
  }>;
  productCards: CatalogStockProductCard[];
};

export type CatalogStockTransaction = {
  id: string;
  lensProductPowerId: string | null;
  movementType: string;
  quantityDelta: number;
  quantityBefore: number;
  quantityAfter: number;
  sourceType: string | null;
  referenceId: string | null;
  reasonCode: string | null;
  reasonText: string | null;
  notes: string | null;
  createdAt: string;
  skuCode: string | null;
  productId: string | null;
  family: string | null;
  sph: number | null;
  cyl: number | null;
};

export type CatalogStockAdjustment = {
  id: string;
  publicId: string;
  lensProductPowerId: string;
  qtyBefore: number;
  countedQty: number;
  qtyDelta: number;
  qtyAfter: number;
  reasonCode: string;
  reasonLabel: string;
  reasonText: string | null;
  status: string;
  submittedById: string;
  approvedById: string | null;
  createdAt: string;
  leaf: CatalogStockPower | null;
};

export function fetchCatalogStockPowers(params?: {
  q?: string;
  productId?: string;
  familyCode?: string;
  shortageOnly?: boolean;
  page?: number;
  limit?: number;
}) {
  const sp = new URLSearchParams();
  if (params?.q) sp.set("q", params.q);
  if (params?.productId) sp.set("productId", params.productId);
  if (params?.familyCode) sp.set("familyCode", params.familyCode);
  if (params?.shortageOnly) sp.set("shortageOnly", "1");
  if (params?.page) sp.set("page", String(params.page));
  if (params?.limit) sp.set("limit", String(params.limit));
  const qs = sp.toString();
  return adminFetch<Paginated<CatalogStockPower> & { total: number }>(
    `/api/admin/stock/powers${qs ? `?${qs}` : ""}`
  );
}

export function fetchCatalogStockPower(id: string) {
  return adminFetch<{ power: CatalogStockPower }>(
    `/api/admin/stock/powers/${id}`
  );
}

export function fetchCatalogStockOverview() {
  return adminFetch<{ overview: CatalogStockOverview }>(
    `/api/admin/stock/overview`
  );
}

export function runCatalogReorderCheckRequest(body?: { powerId?: string }) {
  return adminFetch<{
    scanned?: number;
    created?: number;
    suppressed?: number;
    notNeeded?: number;
    results?: Array<{
      powerId: string;
      skuCode: string;
      outcome: string;
      publicId?: string;
      reason?: string;
    }>;
    result?: {
      outcome: string;
      reason?: string;
      request?: { publicId: string };
    };
  }>(`/api/admin/stock/reorder-check`, {
    method: "POST",
    body: JSON.stringify(body ?? {}),
  });
}

export function patchCatalogStockPowerRules(
  id: string,
  body: { minStock?: number; targetStock?: number }
) {
  return adminFetch<{ power: CatalogStockPower }>(
    `/api/admin/stock/powers/${id}/rules`,
    { method: "PATCH", body: JSON.stringify(body) }
  );
}

export function setCatalogStockPowerBlocked(
  id: string,
  body: { blockedQty: number; reasonText?: string | null }
) {
  return adminFetch<{ power: CatalogStockPower }>(
    `/api/admin/stock/powers/${id}/block`,
    { method: "POST", body: JSON.stringify(body) }
  );
}

export function fetchCatalogStockTransactions(params?: {
  q?: string;
  powerId?: string;
  productId?: string;
  movementType?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}) {
  const sp = new URLSearchParams();
  if (params?.q) sp.set("q", params.q);
  if (params?.powerId) sp.set("powerId", params.powerId);
  if (params?.productId) sp.set("productId", params.productId);
  if (params?.movementType) sp.set("movementType", params.movementType);
  if (params?.from) sp.set("from", params.from);
  if (params?.to) sp.set("to", params.to);
  if (params?.page) sp.set("page", String(params.page));
  if (params?.limit) sp.set("limit", String(params.limit));
  const qs = sp.toString();
  return adminFetch<Paginated<CatalogStockTransaction> & { total: number }>(
    `/api/admin/stock/transactions${qs ? `?${qs}` : ""}`
  );
}

export function fetchCatalogStockAdjustments(params?: {
  q?: string;
  powerId?: string;
  page?: number;
  limit?: number;
}) {
  const sp = new URLSearchParams();
  if (params?.q) sp.set("q", params.q);
  if (params?.powerId) sp.set("powerId", params.powerId);
  if (params?.page) sp.set("page", String(params.page));
  if (params?.limit) sp.set("limit", String(params.limit));
  const qs = sp.toString();
  return adminFetch<Paginated<CatalogStockAdjustment> & { total: number }>(
    `/api/admin/stock/adjustments${qs ? `?${qs}` : ""}`
  );
}

export function createCatalogStockAdjustmentRequest(body: {
  powerId?: string;
  variantId?: string;
  sph?: number;
  cyl?: number;
  countedQty: number;
  reasonCode: string;
  reasonText?: string | null;
}) {
  return adminFetch<{ adjustment: CatalogStockAdjustment }>(
    `/api/admin/stock/adjustments`,
    { method: "POST", body: JSON.stringify(body) }
  );
}

export function createBulkCatalogStockAdjustmentsRequest(body: {
  items: Array<{
    powerId?: string;
    variantId?: string;
    sph?: number;
    cyl?: number;
    countedQty: number;
    reasonCode: string;
    reasonText?: string | null;
  }>;
}) {
  return adminFetch<{ adjustments: CatalogStockAdjustment[]; count: number }>(
    `/api/admin/stock/adjustments`,
    { method: "POST", body: JSON.stringify(body) }
  );
}

export type CatalogStockCheckLine = {
  id: string;
  powerId: string;
  variantId: string;
  productId: string;
  skuCode: string;
  name: string;
  family: string;
  sph: number;
  cyl: number;
  axis: number | null;
  eye: string | null;
  addition: number | null;
  leafKey: string;
  countedQty: number | null;
  verifiedCountedQty: number | null;
  effectiveCountedQty: number | null;
  adjustmentId: string | null;
  notes: string | null;
  /** Admin only — stripped for employees. */
  systemQtyAtStart?: number;
  onHand?: number;
  blockedQty?: number;
  available?: number;
  delta?: number | null;
};

export type CatalogStockCheckSession = {
  id: string;
  publicId: string;
  productId: string | null;
  status: string;
  notes: string | null;
  startedById: string;
  submittedById: string | null;
  verifiedById: string | null;
  cancelledById: string | null;
  startedAt: string;
  submittedAt: string | null;
  verifiedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  lineCount: number;
  countedLineCount: number;
  lines: CatalogStockCheckLine[];
};

export function fetchCatalogStockCheckSessions(params?: {
  status?: string;
  page?: number;
  limit?: number;
}) {
  const sp = new URLSearchParams();
  if (params?.status) sp.set("status", params.status);
  if (params?.page) sp.set("page", String(params.page));
  if (params?.limit) sp.set("limit", String(params.limit));
  const qs = sp.toString();
  return adminFetch<Paginated<CatalogStockCheckSession> & { total: number }>(
    `/api/admin/stock/check-sessions${qs ? `?${qs}` : ""}`
  );
}

export function fetchCatalogStockCheckSession(id: string) {
  return adminFetch<{ session: CatalogStockCheckSession }>(
    `/api/admin/stock/check-sessions/${id}`
  );
}

export function startCatalogStockCheckRequest(body: {
  productId?: string;
  powerIds?: string[];
  notes?: string | null;
}) {
  return adminFetch<{ session: CatalogStockCheckSession }>(
    `/api/admin/stock/check-sessions`,
    { method: "POST", body: JSON.stringify(body) }
  );
}

export function saveCatalogStockCheckCountsRequest(
  id: string,
  lines: Array<{ powerId: string; countedQty: number; notes?: string }>
) {
  return adminFetch<{ session: CatalogStockCheckSession }>(
    `/api/admin/stock/check-sessions/${id}/counts`,
    { method: "PATCH", body: JSON.stringify({ lines }) }
  );
}

export function verifyCatalogStockCheckRequest(
  id: string,
  body?: { lineOverrides?: Array<{ powerId: string; countedQty: number }> }
) {
  return adminFetch<{ session: CatalogStockCheckSession }>(
    `/api/admin/stock/check-sessions/${id}/verify`,
    { method: "POST", body: JSON.stringify(body ?? {}) }
  );
}

export function cancelCatalogStockCheckRequest(id: string) {
  return adminFetch<{ session: CatalogStockCheckSession }>(
    `/api/admin/stock/check-sessions/${id}/cancel`,
    { method: "POST", body: JSON.stringify({}) }
  );
}
