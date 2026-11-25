"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { AdminPage } from "@/components/admin-shell";
import { DetailSkeleton } from "@/components/admin-skeletons";
import {
  CatalogMatrixPanel,
  type CatalogMatrixCartPickItem,
} from "@/components/catalog/catalog-matrix-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { adminFetch, AdminApiError } from "@/app/lib/admin-api";
import {
  fetchLensProduct,
  fetchLensProductMatrixStock,
  saveLensProductMatrixRulesRequest,
  type CatalogStockLeaf,
  type LensProduct,
} from "@/app/lib/admin-lens-catalog";
import { addCatalogItemsToProcurementCartRequest } from "@/app/lib/admin-procurement";

export default function StockOverviewProductMatrixPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = typeof params.id === "string" ? params.id : "";
  const highlightAxis = useMemo(() => {
    const raw = searchParams.get("axis");
    if (raw == null || raw.trim() === "") return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }, [searchParams]);

  const [product, setProduct] = useState<LensProduct | null>(null);
  const [stockLeaves, setStockLeaves] = useState<
    Record<string, CatalogStockLeaf>
  >({});
  const [suppliers, setSuppliers] = useState<Array<{ id: string; name: string }>>(
    []
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [matrixSaving, setMatrixSaving] = useState(false);
  const [addingToCart, setAddingToCart] = useState(false);
  const [cartNotice, setCartNotice] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const [res, matrix, supRes] = await Promise.all([
        fetchLensProduct(id),
        fetchLensProductMatrixStock(id).catch(() => null),
        adminFetch<{
          suppliers: Array<{ id: string; name: string; isActive?: boolean }>;
        }>("/api/procurement/suppliers").catch(() => ({ suppliers: [] })),
      ]);
      setProduct(res.product);
      setStockLeaves(matrix?.leaves ?? {});
      setSuppliers(
        (supRes.suppliers ?? [])
          .filter((s) => s.isActive !== false)
          .map((s) => ({ id: s.id, name: s.name }))
      );
    } catch (err) {
      setError(
        err instanceof AdminApiError ? err.message : "Failed to load product stock."
      );
      setProduct(null);
      setStockLeaves({});
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const stockLeafViews = useMemo(() => {
    const out: Record<
      string,
      { current: number; minStock: number; targetStock: number }
    > = {};
    for (const [key, leaf] of Object.entries(stockLeaves)) {
      out[key] = {
        current: leaf.current,
        minStock: leaf.minStock,
        targetStock: leaf.targetStock,
      };
    }
    return out;
  }, [stockLeaves]);

  async function saveMatrixRules(
    edits: Array<{
      variantId: string;
      sph: number;
      cyl: number;
      minStock: number;
      targetStock: number;
    }>
  ) {
    if (!id) return;
    setMatrixSaving(true);
    try {
      const res = await saveLensProductMatrixRulesRequest(id, edits);
      setStockLeaves((prev) => {
        const next = { ...prev };
        for (const leaf of res.leaves) {
          const key = `${leaf.variantId}:${leaf.sph.toFixed(2)}:${leaf.cyl.toFixed(2)}`;
          next[key] = leaf;
        }
        return next;
      });
    } finally {
      setMatrixSaving(false);
    }
  }

  if (loading) {
    return (
      <AdminPage title="Stock Matrix" subtitle="Loading product stock…">
        <DetailSkeleton />
      </AdminPage>
    );
  }

  if (error || !product) {
    return (
      <AdminPage title="Stock Matrix" subtitle="Stock Overview">
        <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
          {error || "Product not found."}
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/inventory/stock-overview">
            <ArrowLeft className="size-4" />
            Back to Stock Overview
          </Link>
        </Button>
      </AdminPage>
    );
  }

  const attrSummary = [
    product.family.name,
    product.base.name,
    product.material?.name,
    product.index?.name || product.index?.code,
    product.coating?.name,
    product.color?.name,
    product.diameter?.name || product.diameter?.code,
    product.progressiveType?.name,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <AdminPage
      title="Stock Matrix"
      subtitle="Live 2D stock matrix — edit Threshold / Target in bulk or pick shortages into Procurement Cart."
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-bold text-(--brand-text)">
            {attrSummary || product.baseCode}
          </h2>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button asChild variant="outline" size="sm" className="h-9">
            <Link href="/inventory/stock-overview">
              <ArrowLeft className="size-4" />
              Stock Overview
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="h-9">
            <Link href={`/inventory/products-catalog/${product.id}`}>
              Catalog Setup
              <ExternalLink className="size-3.5" />
            </Link>
          </Button>
          <Button asChild size="sm" className="h-9">
            <Link href="/procurement/requests">Procurement Cart</Link>
          </Button>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-(--brand-card-border) bg-(--brand-card) px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge variant="outline">{product.family.code}</Badge>
          <span className="font-medium text-(--brand-text)">{attrSummary}</span>
        </div>
        <span className="text-xs text-(--brand-text-muted)">
          {product.variants.length}{" "}
          {product.variants.length === 1 ? "variant" : "variants"} · Base code{" "}
          <span className="font-mono">{product.baseCode}</span>
        </span>
      </div>

      {cartNotice ? (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">
          <span>{cartNotice}</span>
          <Link
            href="/procurement/requests"
            className="font-semibold underline underline-offset-2"
          >
            Open Procurement Cart →
          </Link>
        </div>
      ) : null}

      <CatalogMatrixPanel
        className="mb-6"
        variants={product.variants}
        familyLabel={product.family.name}
        highlightAxis={highlightAxis}
        editable
        stockLeaves={stockLeafViews}
        saving={matrixSaving}
        onSaveRules={saveMatrixRules}
        suppliers={suppliers}
        addingToCart={addingToCart}
        onAddToCart={async (
          items: CatalogMatrixCartPickItem[],
          quantityOverride: number | null,
          supplierId: string | null
        ) => {
          setAddingToCart(true);
          setCartNotice("");
          try {
            const res = await addCatalogItemsToProcurementCartRequest({
              items: items.map((item) => ({
                variantId: item.variantId,
                sph: item.sph,
                cyl: item.cyl,
                quantity: quantityOverride ?? item.suggestedQty,
                supplierId,
              })),
            });
            const parts: string[] = [];
            if (res.created.length > 0) parts.push(`${res.created.length} added`);
            if (res.updated.length > 0) parts.push(`${res.updated.length} updated`);
            if (res.skippedOpenPo.length > 0) {
              parts.push(`${res.skippedOpenPo.length} skipped (already on open PO)`);
            }
            setCartNotice(`Procurement Cart: ${parts.join(", ") || "no changes"}.`);
          } finally {
            setAddingToCart(false);
          }
        }}
        family={{
          supportsAdd: product.family.supportsAdd,
          supportsAxis: product.family.supportsAxis,
          supportsEye: product.family.supportsEye,
        }}
      />
    </AdminPage>
  );
}
