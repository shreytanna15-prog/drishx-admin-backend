import { adminFetch } from "@/app/lib/admin-api";
import { adminAuthFetch } from "@/app/lib/admin-auth-fetch";
import type { DeferredReport } from "@/app/lib/reports/deferred-reports";
import { groupReportsForNav } from "@/app/lib/reports/registry";
import type {
  ReportDefinition,
  ReportSuccessResponse,
} from "@/app/lib/reports/types";

export type ReportsCatalogResponse = {
  categories: ReturnType<typeof groupReportsForNav>;
  reports: ReportDefinition[];
  deferred?: DeferredReport[];
};

export type ReportRunResponse = ReportSuccessResponse;

export async function fetchReportsCatalog(): Promise<ReportsCatalogResponse> {
  return adminFetch<ReportsCatalogResponse>("/api/reports");
}

export async function runAdminReport(
  queryString: string
): Promise<ReportRunResponse> {
  return adminFetch<ReportRunResponse>(`/api/reports?${queryString}`);
}

/** CSV/XLSX export — returns blob + suggested filename (binary response). */
export async function exportAdminReport(
  queryString: string
): Promise<{ blob: Blob; filename: string | null }> {
  const res = await adminAuthFetch(`/api/reports?${queryString}`, {
    method: "GET",
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(
      typeof data.error === "string" ? data.error : "Export failed. Please try again."
    );
  }
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") || "";
  const match = /filename="([^"]+)"/i.exec(disposition);
  return { blob, filename: match?.[1] ?? null };
}
