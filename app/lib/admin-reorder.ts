import { adminFetch } from "@/app/lib/admin-api";
import type {
  ReorderCheckResponse,
  ReorderRulesResponse,
} from "@/app/lib/admin-procurement";

export async function fetchReorderRules(
  params: URLSearchParams
): Promise<ReorderRulesResponse> {
  return adminFetch<ReorderRulesResponse>(
    `/api/inventory/reorder-rules?${params.toString()}`
  );
}

export async function bulkSaveReorderRules(
  items: Array<{
    lensType: string;
    lensId: string;
    minStock: number;
    targetStock: number;
    autoProcure: boolean;
    preferredSupplierId: string | null;
    moq: number | null;
  }>
): Promise<void> {
  await adminFetch("/api/inventory/reorder-rules/bulk", {
    method: "POST",
    body: JSON.stringify({ items }),
  });
}

export async function runReorderCheck(): Promise<ReorderCheckResponse> {
  return adminFetch<ReorderCheckResponse>("/api/inventory/reorder-check", {
    method: "POST",
  });
}
