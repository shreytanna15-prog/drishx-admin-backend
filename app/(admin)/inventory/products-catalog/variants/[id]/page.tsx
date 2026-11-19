"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { AdminPage } from "@/components/admin-shell";
import { DetailSkeleton } from "@/components/admin-skeletons";
import { AdminTable } from "@/components/admin-table";
import { CatalogMatrixPanel } from "@/components/catalog/catalog-matrix-panel";
import { SkuChip } from "@/components/catalog/sku-chip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AdminApiError } from "@/app/lib/admin-api";
import {
  fetchLensProduct,
  fetchLensProductVariant,
  updateLensProductVariantRequest,
  type LensProduct,
  type LensProductVariant,
} from "@/app/lib/admin-lens-catalog";
import { cn } from "@/lib/utils";

const CATALOG_HREF = "/inventory/products-catalog";

const errorBannerClass =
  "rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200";

function errorMessage(err: unknown, fallback: string) {
  return err instanceof AdminApiError ? err.message : fallback;
}

function formatMoney(n: number) {
  return n.toFixed(2);
}

export default function LensProductVariantDetailPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const [variant, setVariant] = useState<LensProductVariant | null>(null);
  const [product, setProduct] = useState<LensProduct | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [matrixError, setMatrixError] = useState("");
  const [toggleBusy, setToggleBusy] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const res = await fetchLensProductVariant(id);
      setVariant(res.variant);

      try {
        const parent = await fetchLensProduct(res.variant.productId);
        setProduct(parent.product);
      } catch (err) {
        setProduct(null);
        setMatrixError(
          errorMessage(err, "Failed to load the family power matrix.")
        );
      }
    } catch (err) {
      setError(errorMessage(err, "Failed to load variant."));
      setVariant(null);
      setProduct(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load on mount
    void load();
  }, [load]);

  async function toggleActive() {
    if (!variant) return;
    setToggleBusy(true);
    setError("");
    try {
      const res = await updateLensProductVariantRequest(variant.id, {
        isActive: !variant.isActive,
      });
      setVariant(res.variant);
      setProduct((prev) =>
        prev
          ? {
              ...prev,
              variants: prev.variants.map((v) =>
                v.id === res.variant.id
                  ? { ...v, isActive: res.variant.isActive }
                  : v
              ),
            }
          : prev
      );
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

  const attributes = variant.product;

  return (
    <AdminPage title={variant.name} subtitle={variant.rangeSummary}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button asChild variant="ghost" className="h-9 gap-1.5 px-2">
          <Link href={CATALOG_HREF}>
            <ArrowLeft className="size-4" />
            Catalog
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

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <section className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-5">
          <h2 className="mb-3 text-sm font-extrabold uppercase tracking-[0.14em] text-(--brand-primary)">
            Variant
          </h2>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-(--brand-label)">Purchase price (₹)</dt>
              <dd className="font-semibold tabular-nums">
                {formatMoney(variant.purchasePrice)}
              </dd>
            </div>
            <div>
              <dt className="text-(--brand-label)">Selling price (₹)</dt>
              <dd className="font-semibold tabular-nums">
                {formatMoney(variant.sellingPrice)}
              </dd>
            </div>
            <div>
              <dt className="text-(--brand-label)">Range</dt>
              <dd className="font-semibold">{variant.rangeLabel}</dd>
            </div>
            <div>
              <dt className="text-(--brand-label)">Axis</dt>
              <dd className="font-semibold">
                {variant.axisRef?.name ??
                  (variant.axis != null ? String(variant.axis) : "—")}
              </dd>
            </div>
            <div>
              <dt className="text-(--brand-label)">ADD</dt>
              <dd className="font-semibold">{variant.addition?.name ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-(--brand-label)">Eye</dt>
              <dd className="font-semibold">{variant.eye ?? "—"}</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-5">
          <h2 className="mb-3 text-sm font-extrabold uppercase tracking-[0.14em] text-(--brand-primary)">
            Product attributes
          </h2>
          <dl className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-(--brand-label)">Family</dt>
              <dd className="font-semibold">{attributes.family.code}</dd>
            </div>
            <div>
              <dt className="text-(--brand-label)">Base</dt>
              <dd className="font-semibold">{attributes.base.code}</dd>
            </div>
            <div>
              <dt className="text-(--brand-label)">Material</dt>
              <dd className="font-semibold">
                {attributes.material?.code ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-(--brand-label)">Index</dt>
              <dd className="font-semibold">{attributes.index?.code ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-(--brand-label)">Coating</dt>
              <dd className="font-semibold">
                {attributes.coating?.name || attributes.coating?.code || "—"}
              </dd>
            </div>
            <div>
              <dt className="text-(--brand-label)">Color</dt>
              <dd className="font-semibold">
                {attributes.color?.name || attributes.color?.code || "—"}
              </dd>
            </div>
            <div>
              <dt className="text-(--brand-label)">Diameter</dt>
              <dd className="font-semibold">
                {attributes.diameter?.name || attributes.diameter?.code || "—"}
              </dd>
            </div>
            {attributes.family.supportsProgressiveType ||
            attributes.progressiveType ? (
              <div>
                <dt className="text-(--brand-label)">Progressive type</dt>
                <dd className="font-semibold">
                  {attributes.progressiveType?.name ||
                    attributes.progressiveType?.code ||
                    "—"}
                </dd>
              </div>
            ) : null}
          </dl>
        </section>
      </div>

      {product ? (
        <CatalogMatrixPanel
          className="mb-6"
          variants={product.variants}
          familyLabel={product.family.name}
          family={{
            supportsAdd: product.family.supportsAdd,
            supportsAxis: product.family.supportsAxis,
            supportsEye: product.family.supportsEye,
          }}
        />
      ) : matrixError ? (
        <div className={`${errorBannerClass} mb-6`}>{matrixError}</div>
      ) : null}

      {product ? (
        <section className="mb-6">
          <h2 className="mb-3 text-sm font-extrabold uppercase tracking-[0.14em] text-(--brand-primary)">
            All variants
          </h2>
          <AdminTable>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>SKU</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Range</TableHead>
                  <TableHead>Axis</TableHead>
                  <TableHead>ADD</TableHead>
                  <TableHead>Eye</TableHead>
                  <TableHead className="text-right">Purchase</TableHead>
                  <TableHead className="text-right">Selling</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Open</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {product.variants.map((v) => (
                  <TableRow
                    key={v.id}
                    className={cn(
                      v.id === variant.id && "bg-(--brand-input-bg)/40"
                    )}
                  >
                    <TableCell>
                      <SkuChip sku={v.skuCode} />
                    </TableCell>
                    <TableCell className="max-w-[16rem] whitespace-normal">
                      {v.name}
                    </TableCell>
                    <TableCell>{v.rangeLabel}</TableCell>
                    <TableCell>
                      {v.axisRef?.name ??
                        (v.axis != null ? String(v.axis) : "—")}
                    </TableCell>
                    <TableCell>{v.addition?.name ?? "—"}</TableCell>
                    <TableCell>{v.eye ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(v.purchasePrice)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(v.sellingPrice)}
                    </TableCell>
                    <TableCell>
                      {v.isActive ? "Active" : "Inactive"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        asChild
                        size="sm"
                        variant="outline"
                        className="h-8 rounded-lg"
                      >
                        <Link
                          href={`${CATALOG_HREF}/variants/${v.id}`}
                          onClick={() => {
                            if (v.id !== variant.id) setLoading(true);
                          }}
                        >
                          Open
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </AdminTable>
        </section>
      ) : null}
    </AdminPage>
  );
}
