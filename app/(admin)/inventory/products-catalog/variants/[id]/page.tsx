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
  fetchLensProductVariant,
  steppedPowerRange,
  updateLensProductVariantRequest,
  type LensProductVariant,
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

export default function LensProductVariantDetailPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const [variant, setVariant] = useState<LensProductVariant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toggleBusy, setToggleBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetchLensProductVariant(id);
      setVariant(res.variant);
    } catch (err) {
      setError(errorMessage(err, "Failed to load variant."));
      setVariant(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const sphValues = useMemo(
    () => (variant ? steppedPowerRange(variant.sphMin, variant.sphMax) : []),
    [variant]
  );
  const cylValues = useMemo(
    () => (variant ? steppedPowerRange(variant.cylMin, variant.cylMax) : []),
    [variant]
  );

  async function toggleActive() {
    if (!variant) return;
    setToggleBusy(true);
    setError("");
    try {
      const res = await updateLensProductVariantRequest(variant.id, {
        isActive: !variant.isActive,
      });
      setVariant(res.variant);
    } catch (err) {
      setError(errorMessage(err, "Failed to update status."));
    } finally {
      setToggleBusy(false);
    }
  }

  if (loading) {
    return (
      <AdminPage title="Variant" subtitle="Loading…">
        <DetailSkeleton />
      </AdminPage>
    );
  }

  if (!variant) {
    return (
      <AdminPage title="Variant" subtitle="Not found">
        {error ? <div className={errorBannerClass}>{error}</div> : null}
        <Button asChild variant="outline" className="mt-4 h-9 rounded-xl">
          <Link href={CATALOG_HREF}>
            <ArrowLeft className="size-4" />
            Back
          </Link>
        </Button>
      </AdminPage>
    );
  }

  return (
    <AdminPage title={variant.name} subtitle={variant.rangeSummary}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button asChild variant="ghost" className="h-9 gap-1.5 px-2">
          <Link href={`${CATALOG_HREF}/${variant.productId}`}>
            <ArrowLeft className="size-4" />
            Parent
          </Link>
        </Button>
        <SkuChip sku={variant.skuCode} />
        <Badge
          variant="outline"
          className={
            variant.isActive
              ? "border-emerald-500/40 text-emerald-300"
              : "border-(--brand-card-border) text-(--brand-text-muted)"
          }
        >
          {variant.isActive ? "Active" : "Inactive"}
        </Badge>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 rounded-lg"
          disabled={toggleBusy}
          onClick={() => void toggleActive()}
        >
          {toggleBusy ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : variant.isActive ? (
            "Deactivate"
          ) : (
            "Activate"
          )}
        </Button>
      </div>

      {error ? <div className={`${errorBannerClass} mb-4`}>{error}</div> : null}

      <p className="mb-3 text-sm text-(--brand-text-muted)">
        {variant.product.attributeSummary} · matrix cells are placeholders
        (_ / _ / _)
      </p>

      <div className="overflow-x-auto rounded-2xl border border-(--brand-card-border) bg-(--brand-card)">
        <table className="min-w-full border-collapse text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 border border-(--brand-card-border) bg-(--brand-input-bg) px-2 py-1.5 text-left font-bold text-(--brand-label)">
                SPH \\ CYL
              </th>
              {cylValues.map((c) => (
                <th
                  key={c}
                  className="border border-(--brand-card-border) px-2 py-1.5 font-bold text-(--brand-label)"
                >
                  {formatPower(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sphValues.map((s) => (
              <tr key={s}>
                <th className="sticky left-0 z-10 border border-(--brand-card-border) bg-(--brand-input-bg) px-2 py-1 text-left font-semibold text-(--brand-text)">
                  {formatPower(s)}
                </th>
                {cylValues.map((c) => (
                  <td
                    key={`${s}-${c}`}
                    className="border border-(--brand-card-border) px-2 py-1 text-center text-(--brand-text-muted)"
                  >
                    _ / _ / _
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminPage>
  );
}
