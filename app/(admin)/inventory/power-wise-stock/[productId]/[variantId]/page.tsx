"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Download,
  ExternalLink,
  FileSpreadsheet,
  RefreshCw,
} from "lucide-react";
import { AdminPage } from "@/components/admin-shell";
import { DetailSkeleton } from "@/components/admin-skeletons";
import { PowerWiseMatrixPanel } from "@/components/catalog/power-wise-matrix-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AdminApiError } from "@/app/lib/admin-api";
import {
  downloadPowerWiseVariantExport,
  fetchPowerWiseVariantMatrix,
  type PowerWiseVariantMatrix,
} from "@/app/lib/admin-power-wise-stock";

export default function PowerWiseMatrixPage() {
  const params = useParams();
  const productId =
    typeof params.productId === "string" ? params.productId : "";
  const variantId =
    typeof params.variantId === "string" ? params.variantId : "";

  const [data, setData] = useState<PowerWiseVariantMatrix | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState<"xlsx" | "pdf" | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!productId || !variantId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchPowerWiseVariantMatrix(productId, variantId);
      setData(res);
    } catch (err) {
      setError(
        err instanceof AdminApiError
          ? err.message
          : "Failed to load power matrix."
      );
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [productId, variantId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onExport(format: "xlsx" | "pdf") {
    if (!productId || !variantId) return;
    setExporting(format);
    setExportError(null);
    try {
      await downloadPowerWiseVariantExport(productId, variantId, format);
    } catch (err) {
      setExportError(
        err instanceof AdminApiError
          ? err.message
          : `Failed to download ${format.toUpperCase()}.`
      );
    } finally {
      setExporting(null);
    }
  }

  const meta = data
    ? [
        data.rangeLabel,
        data.axis != null ? `Axis ${data.axis}` : null,
        data.eye ? `Eye ${data.eye}` : null,
        data.addition != null ? `ADD ${data.addition.toFixed(2)}` : null,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  return (
    <AdminPage
      title={data?.skuCode || "Power matrix"}
      subtitle="Read-only On-hand / Reserved / Available / Blocked for this variant."
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button asChild variant="outline" size="sm" className="h-9">
          <Link href={`/inventory/power-wise-stock/${productId}`}>
            <ArrowLeft className="size-4" />
            Variants
          </Link>
        </Button>
        {data ? (
          <Badge variant="outline" className="text-[11px]">
            {data.family.code}
          </Badge>
        ) : null}
        {meta ? (
          <span className="text-xs text-(--brand-text-muted)">{meta}</span>
        ) : null}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            disabled={!data || exporting != null}
            onClick={() => void onExport("xlsx")}
          >
            <FileSpreadsheet className="size-4" />
            {exporting === "xlsx" ? "Downloading…" : "Excel"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            disabled={!data || exporting != null}
            onClick={() => void onExport("pdf")}
          >
            <Download className="size-4" />
            {exporting === "pdf" ? "Downloading…" : "PDF"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw className="size-4" />
            Refresh
          </Button>
          <Button asChild variant="outline" size="sm" className="h-9">
            <Link href={`/inventory/stock-overview/${productId}`}>
              Edit thresholds
              <ExternalLink className="size-3.5" />
            </Link>
          </Button>
        </div>
      </div>

      {exportError ? (
        <p className="mb-3 text-sm text-red-600">{exportError}</p>
      ) : null}

      {error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : loading || !data ? (
        <DetailSkeleton />
      ) : (
        <div className="space-y-3">
          <div className="rounded-lg border border-(--brand-card-border) bg-(--brand-card) px-4 py-3">
            <p className="text-sm font-semibold text-(--brand-text)">
              {data.name}
            </p>
            <p className="text-xs text-(--brand-text-muted)">
              Cells: On-hand / Reserved · Available / Blocked
            </p>
          </div>
          <PowerWiseMatrixPanel
            variants={data.variants}
            family={data.family}
            familyLabel={data.family.name}
            stockLeaves={data.leaves}
          />
        </div>
      )}
    </AdminPage>
  );
}
