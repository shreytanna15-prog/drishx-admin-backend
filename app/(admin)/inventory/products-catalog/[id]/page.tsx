"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { AdminPage } from "@/components/admin-shell";
import { DetailSkeleton } from "@/components/admin-skeletons";
import { SkuChip } from "@/components/catalog/sku-chip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AdminApiError } from "@/app/lib/admin-api";
import {
  fetchLensProduct,
  steppedPowerRange,
  updateLensProductRequest,
  type LensProduct,
} from "@/app/lib/admin-lens-catalog";

const CATALOG_HREF = "/inventory/products-catalog";

const errorBannerClass =
  "rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200";

function errorMessage(err: unknown, fallback: string) {
  return err instanceof AdminApiError ? err.message : fallback;
}

function formatPower(n: number) {
  return n.toFixed(2);
}

export default function LensProductDetailPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const [product, setProduct] = useState<LensProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toggleBusy, setToggleBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetchLensProduct(id);
      setProduct(res.product);
    } catch (err) {
      setError(errorMessage(err, "Failed to load product."));
      setProduct(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const sphValues = useMemo(
    () =>
      product ? steppedPowerRange(product.sphMin, product.sphMax) : [],
    [product]
  );
  const cylValues = useMemo(
    () =>
      product ? steppedPowerRange(product.cylMin, product.cylMax) : [],
    [product]
  );

  async function toggleActive() {
    if (!product) return;
    setToggleBusy(true);
    setError("");
    try {
      const res = await updateLensProductRequest(product.id, {
        isActive: !product.isActive,
      });
      setProduct(res.product);
    } catch (err) {
      setError(errorMessage(err, "Failed to update status."));
    } finally {
      setToggleBusy(false);
    }
  }

  if (loading) {
    return (
      <AdminPage title="Product" subtitle="Loading…">
        <DetailSkeleton />
      </AdminPage>
    );
  }

  if (!product) {
    return (
      <AdminPage title="Product" subtitle="Not found">
        {error ? <div className={errorBannerClass}>{error}</div> : null}
        <Button asChild variant="outline" className="mt-4 h-9 rounded-xl">
          <Link href={CATALOG_HREF}>
            <ArrowLeft className="mr-1 size-4" />
            Back to catalog
          </Link>
        </Button>
      </AdminPage>
    );
  }

  return (
    <AdminPage
      title={product.name}
      subtitle={product.attributeSummary}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button asChild variant="outline" className="h-9 rounded-xl">
            <Link href={CATALOG_HREF}>
              <ArrowLeft className="mr-1 size-4" />
              Back to catalog
            </Link>
          </Button>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={
                product.isActive
                  ? "border-emerald-500/40 text-emerald-700"
                  : "border-zinc-400/40 text-zinc-500"
              }
            >
              {product.isActive ? "Active" : "Inactive"}
            </Badge>
            <Button
              type="button"
              variant="outline"
              className="h-9 rounded-xl"
              disabled={toggleBusy}
              onClick={() => void toggleActive()}
            >
              {toggleBusy ? (
                <Loader2 className="mr-1 size-4 animate-spin" />
              ) : null}
              {product.isActive ? "Deactivate" : "Activate"}
            </Button>
          </div>
        </div>

        {error ? <div className={errorBannerClass}>{error}</div> : null}

        <div className="rounded-2xl border border-(--brand-card-border) bg-(--brand-input-bg)/40 p-4">
          <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-[11px] font-bold uppercase tracking-wider text-(--brand-text-muted)">
                SKU
              </dt>
              <dd className="mt-0.5">
                <SkuChip sku={product.skuCode} />
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-bold uppercase tracking-wider text-(--brand-text-muted)">
                Attributes
              </dt>
              <dd>{product.attributeSummary}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-bold uppercase tracking-wider text-(--brand-text-muted)">
                Range
              </dt>
              <dd className="leading-snug">
                {product.powerRange ? (
                  <div className="font-mono font-bold">
                    {product.powerRange.label}
                  </div>
                ) : null}
                <div>
                  SPH {product.sphMin}…{product.sphMax}
                </div>
                <div>
                  CYL {product.cylMin}…{product.cylMax}
                  {product.rangeType !== "NORMAL" ? (
                    <span className="ml-1 text-(--brand-text-muted)">
                      ({product.rangeType})
                    </span>
                  ) : null}
                </div>
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-bold uppercase tracking-wider text-(--brand-text-muted)">
                Price
              </dt>
              <dd>
                {product.defaultPrice != null
                  ? product.defaultPrice.toFixed(2)
                  : "—"}
              </dd>
            </div>
            {(product.addMin != null ||
              product.addMax != null ||
              product.axis != null ||
              product.eye) && (
              <div className="sm:col-span-2">
                <dt className="text-[11px] font-bold uppercase tracking-wider text-(--brand-text-muted)">
                  KT / V2 extras
                </dt>
                <dd>
                  {[
                    product.addMin != null || product.addMax != null
                      ? `ADD ${product.addMin ?? "—"}…${product.addMax ?? "—"}`
                      : null,
                    product.axis != null ? `AXIS ${product.axis}` : null,
                    product.eye ? `EYE ${product.eye}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </dd>
              </div>
            )}
          </dl>
        </div>

        <div>
          <h2 className="mb-2 text-sm font-bold text-(--brand-text)">
            Power matrix (SPH × CYL)
          </h2>
          <p className="mb-3 text-xs text-(--brand-text-muted)">
            Cells show Current / Threshold / Target placeholders. Live stock is
            out of scope for this slice. {sphValues.length} SPH ×{" "}
            {cylValues.length} CYL = {sphValues.length * cylValues.length}{" "}
            cells.
          </p>
          <div className="max-h-[70vh] overflow-auto rounded-2xl border border-(--brand-card-border)">
            <table className="min-w-full border-collapse text-xs">
              <thead>
                <tr>
                  <th className="sticky left-0 top-0 z-30 border-b border-r border-(--brand-card-border) bg-(--brand-card) px-2 py-2 text-left font-bold">
                    SPH \\ CYL
                  </th>
                  {cylValues.map((cyl) => (
                    <th
                      key={cyl}
                      className="sticky top-0 z-20 border-b border-(--brand-card-border) bg-(--brand-card) px-2 py-2 text-center font-bold whitespace-nowrap"
                    >
                      {formatPower(cyl)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sphValues.map((sph) => (
                  <tr key={sph}>
                    <th className="sticky left-0 z-10 border-r border-b border-(--brand-card-border) bg-(--brand-card) px-2 py-1.5 text-left font-semibold whitespace-nowrap">
                      {formatPower(sph)}
                    </th>
                    {cylValues.map((cyl) => (
                      <td
                        key={`${sph}-${cyl}`}
                        className="border-b border-(--brand-card-border) px-2 py-1.5 text-center font-mono text-(--brand-text-muted) whitespace-nowrap"
                      >
                        _ / _ / _
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </AdminPage>
  );
}
