import { adminFetch } from "@/app/lib/admin-api";
import type { ProductMatrix } from "@/app/lib/stock-matrix";
import type {
  MatrixFilterOptions,
  MatrixProductSummary,
} from "@/app/lib/stock-matrix-data";

export type StockMatrixListResponse = {
  products: MatrixProductSummary[];
  total: number;
  page: number;
  pageSize: number;
  canEdit: boolean;
  options: MatrixFilterOptions;
};

export type StockMatrixProductResponse = {
  key: string;
  title: string;
  subtitle: string;
  matrix: ProductMatrix;
  canEdit: boolean;
};

export async function fetchStockMatrixList(
  params: URLSearchParams
): Promise<StockMatrixListResponse> {
  return adminFetch<StockMatrixListResponse>(
    `/api/inventory/stock-matrix?${params}`
  );
}

export async function fetchStockMatrixProduct(
  lensType: string,
  key: string
): Promise<StockMatrixProductResponse> {
  return adminFetch<StockMatrixProductResponse>(
    `/api/inventory/stock-matrix/product?lensType=${lensType}&key=${encodeURIComponent(key)}`
  );
}

export async function saveStockMatrixRules(input: {
  lensType: string;
  edits: Array<{
    lensId: string;
    minStock: number | null;
    targetStock: number | null;
    expectedUpdatedAt: string | null;
  }>;
}): Promise<{ saved: number }> {
  return adminFetch<{ saved: number }>("/api/inventory/stock-matrix/rules", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}
