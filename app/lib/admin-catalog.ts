import { adminFetch } from "@/app/lib/admin-api";

export type CatalogLensFamily = "SINGLE_VISION" | "KRYPTOK" | "PROGRESSIVE";
export type CatalogProductStatus = "ACTIVE" | "HELD" | "ARCHIVED";

export type CatalogLeafStorage = "LEGACY_BAND" | "POWER_WISE";

export type CatalogRangeLeaf = {
  id: string;
  lensId: string;
  lensType: string;
  disabledByProductHold?: boolean;
};

export type CatalogRange = {
  id: string;
  productId: string;
  label: string;
  sphStart: number;
  sphEnd: number;
  cylStart: number | null;
  cylEnd: number | null;
  add: number | null;
  axis: number | null;
  eye: string | null;
  price: number;
  costPrice: number | null;
  powerCount: number;
  leafStorage?: CatalogLeafStorage;
  leafCount?: number;
  lensType: string;
  lensId: string | null;
  leaves?: CatalogRangeLeaf[];
  createdAt: string;
  updatedAt: string;
};

export type CatalogProduct = {
  id: string;
  lensFamily: CatalogLensFamily;
  category: string | null;
  brand: string;
  item: string | null;
  index: number | null;
  coating: string;
  progressiveType: string | null;
  defaultPrice: number;
  defaultCostPrice: number | null;
  status: CatalogProductStatus;
  identityKey: string;
  notes: string | null;
  heldAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  rangeCount: number;
  powerCount: number;
  ranges?: CatalogRange[];
};

export type CatalogMatrixPreview = {
  label: string;
  powerCount: number;
  sphOptions: number[];
  cylOptions: number[];
  sampleCells: Array<{ sph: number; cyl: number | null }>;
};

export type CatalogProductListResponse = {
  products: CatalogProduct[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
};

export type CreateCatalogProductInput = {
  lensFamily: CatalogLensFamily;
  category?: string | null;
  brand: string;
  item?: string | null;
  index?: number | null;
  coating: string;
  progressiveType?: string | null;
  defaultPrice: number;
  defaultCostPrice?: number | null;
  notes?: string | null;
  /** Attach existing legacy lens rows as LEGACY_BAND ranges instead of erroring. */
  linkLegacy?: boolean;
};

export type AddCatalogRangeInput = {
  sphStart: number;
  sphEnd: number;
  cylStart?: number | null;
  cylEnd?: number | null;
  add?: number | null;
  axis?: number | null;
  eye?: string | null;
  price?: number | null;
  costPrice?: number | null;
  label?: string | null;
  previewOnly?: boolean;
};

export function fetchCatalogProducts(params: {
  q?: string;
  lensFamily?: string;
  status?: string;
  page?: number;
  limit?: number;
}): Promise<CatalogProductListResponse> {
  const sp = new URLSearchParams();
  if (params.q) sp.set("q", params.q);
  if (params.lensFamily) sp.set("lensFamily", params.lensFamily);
  if (params.status) sp.set("status", params.status);
  sp.set("page", String(params.page ?? 1));
  sp.set("limit", String(params.limit ?? 20));
  return adminFetch(`/api/admin/catalog/products?${sp.toString()}`);
}

export function fetchCatalogProduct(
  id: string
): Promise<{ product: CatalogProduct }> {
  return adminFetch(`/api/admin/catalog/products/${id}`);
}

export function createCatalogProductRequest(
  input: CreateCatalogProductInput
): Promise<{ product: CatalogProduct }> {
  return adminFetch("/api/admin/catalog/products", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function patchCatalogProductRequest(
  id: string,
  body: Record<string, unknown>
): Promise<{ product: CatalogProduct }> {
  return adminFetch(`/api/admin/catalog/products/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export function setCatalogProductStatusRequest(
  id: string,
  status: CatalogProductStatus
): Promise<{ product: CatalogProduct }> {
  return patchCatalogProductRequest(id, { status });
}

export function previewOrAddCatalogRangeRequest(
  productId: string,
  input: AddCatalogRangeInput
): Promise<{
  preview?: CatalogMatrixPreview;
  label?: string;
  range?: CatalogRange;
  lensId?: string | null;
  lensIds?: string[];
  lensType?: string;
  powerCount?: number;
  leafStorage?: CatalogLeafStorage;
  error?: string;
  code?: string;
  details?: Record<string, unknown>;
}> {
  return adminFetch(`/api/admin/catalog/products/${productId}/ranges`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export type LegacyUnlinkedGroup = {
  identityKey: string;
  lensFamily: CatalogLensFamily;
  category: string | null;
  brand: string;
  item: string | null;
  index: number | null;
  coating: string;
  progressiveType: string | null;
  leafCount: number;
  unlinkedLeafCount: number;
  existingCatalogProductId: string | null;
  needsProductFacade: boolean;
  needsRangeLinks: boolean;
};

export function fetchLegacyUnlinkedCatalog(params?: {
  limit?: number;
}): Promise<{
  totalGroups: number;
  unlinkedCount: number;
  groups: LegacyUnlinkedGroup[];
}> {
  const sp = new URLSearchParams();
  sp.set("limit", String(params?.limit ?? 40));
  return adminFetch(`/api/admin/catalog/legacy-unlinked?${sp.toString()}`);
}

export function familyLabel(family: CatalogLensFamily | string): string {
  switch (family) {
    case "SINGLE_VISION":
      return "Single Vision";
    case "KRYPTOK":
      return "Kryptok";
    case "PROGRESSIVE":
      return "Progressive";
    default:
      return String(family);
  }
}

export function statusTone(
  status: CatalogProductStatus
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "ACTIVE") return "default";
  if (status === "HELD") return "secondary";
  return "outline";
}
