"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { AdminPage } from "@/components/admin-shell";
import { DetailSkeleton } from "@/components/admin-skeletons";
import { AdminTable } from "@/components/admin-table";
import {
  AdditionMultiSelect,
  AxisMultiSelect,
  PowerRangeMultiSelect,
  catalogLabelClass,
} from "@/components/catalog/catalog-field";
import { CatalogMatrixPanel } from "@/components/catalog/catalog-matrix-panel";
import { SkuChip } from "@/components/catalog/sku-chip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  addLensProductVariantsRequest,
  fetchLensAttributes,
  fetchLensProduct,
  type LensAttribute,
  type LensProduct,
} from "@/app/lib/admin-lens-catalog";
import { useGetPowerRanges } from "@/app/lib/modules/lens-catalog/query/use-get-power-ranges";
import { formatPowerRangeCompact } from "@/app/lib/catalog/catalog-power-select-options";

const CATALOG_HREF = "/inventory/products-catalog";

const errorBannerClass =
  "rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200";

const inputClass =
  "h-10 rounded-xl border-(--brand-input-border) bg-(--brand-input-bg)";

function errorMessage(err: unknown, fallback: string) {
  return err instanceof AdminApiError ? err.message : fallback;
}

function formatMoney(n: number) {
  return n.toFixed(2);
}

function powerRangeAllowsAxis(cylMin: number, cylMax: number): boolean {
  return Math.max(Math.abs(cylMin), Math.abs(cylMax)) !== 0;
}

function attrNumericOptions(items: LensAttribute[]) {
  return items
    .filter((a) => a.value != null && Number.isFinite(a.value))
    .map((a) => ({
      id: a.id,
      label: a.name?.trim() || a.code,
      value: Number(a.value),
    }));
}

export default function LensProductParentDetailPage() {
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [addIds, setAddIds] = useState<string[]>([]);
  const [addAxisIds, setAddAxisIds] = useState<string[]>([]);
  const [addAdditionIds, setAddAdditionIds] = useState<string[]>([]);
  const [axes, setAxes] = useState<LensAttribute[]>([]);
  const [additions, setAdditions] = useState<LensAttribute[]>([]);
  const [addPurchasePrice, setAddPurchasePrice] = useState("");
  const [addSellingPrice, setAddSellingPrice] = useState("");
  const [addBusy, setAddBusy] = useState(false);

  const { data: powerRangeData } = useGetPowerRanges({ activeOnly: true });
  const powerRanges = useMemo(
    () => powerRangeData?.items ?? [],
    [powerRangeData]
  );

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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load on mount
    void load();
  }, [load]);

  useEffect(() => {
    void (async () => {
      try {
        const [ax, add] = await Promise.all([
          fetchLensAttributes("axis", { activeOnly: true }),
          fetchLensAttributes("addition", { activeOnly: true }),
        ]);
        setAxes(ax.items);
        setAdditions(add.items);
      } catch {
        setAxes([]);
        setAdditions([]);
      }
    })();
  }, []);

  const usedRangeIds = useMemo(
    () => new Set(product?.variants.map((v) => v.powerRangeId) ?? []),
    [product]
  );

  const supportsAxis = Boolean(product?.family.supportsAxis);
  const supportsAdd = Boolean(product?.family.supportsAdd);

  const addRangesAllowAxis = useMemo(() => {
    if (addIds.length === 0) return false;
    const byId = new Map(powerRanges.map((r) => [r.id, r]));
    return addIds.some((id) => {
      const r = byId.get(id);
      return r ? powerRangeAllowsAxis(r.cylMin, r.cylMax) : false;
    });
  }, [addIds, powerRanges]);

  const showAddAxisMulti = supportsAxis && addRangesAllowAxis;

  async function addRanges() {
    if (!product || addIds.length === 0) return;
    setAddBusy(true);
    setError("");
    try {
      const res = await addLensProductVariantsRequest(product.id, {
        powerRangeIds: addIds,
        axisIds: showAddAxisMulti ? addAxisIds : [],
        additionIds: supportsAdd ? addAdditionIds : [],
        purchasePrice: addPurchasePrice.trim()
          ? Number(addPurchasePrice)
          : null,
        sellingPrice: addSellingPrice.trim() ? Number(addSellingPrice) : null,
      });
      setProduct(res.product);
      setAddIds([]);
      setAddAxisIds([]);
      setAddAdditionIds([]);
      setAddPurchasePrice("");
      setAddSellingPrice("");
    } catch (err) {
      setError(errorMessage(err, "Failed to add power ranges."));
    } finally {
      setAddBusy(false);
    }
  }

  if (loading) {
    return (
      <AdminPage title="Product parent" subtitle="Loading…">
        <DetailSkeleton />
      </AdminPage>
    );
  }

  if (!product) {
    return (
      <AdminPage title="Product parent" subtitle="Not found">
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
    <AdminPage
      title={product.attributeSummary}
      subtitle={`Parent · ${product.variantCount} variant(s)`}
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button asChild variant="ghost" className="h-9 gap-1.5 px-2">
          <Link href={CATALOG_HREF}>
            <ArrowLeft className="size-4" />
            Catalog
          </Link>
        </Button>
        <Badge
          variant="outline"
          className={
            product.isActive
              ? "border-emerald-500/40 text-emerald-300"
              : "border-(--brand-card-border) text-(--brand-text-muted)"
          }
        >
          {product.isActive ? "Active" : "Inactive"}
        </Badge>
      </div>

      {error ? <div className={`${errorBannerClass} mb-4`}>{error}</div> : null}

      <section className="mb-6 rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-5">
        <h2 className="mb-3 text-sm font-extrabold uppercase tracking-[0.14em] text-(--brand-primary)">
          Attributes
        </h2>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-(--brand-label)">Family</dt>
            <dd className="font-semibold">{product.family.code}</dd>
          </div>
          <div>
            <dt className="text-(--brand-label)">Base</dt>
            <dd className="font-semibold">{product.base.code}</dd>
          </div>
          <div>
            <dt className="text-(--brand-label)">Material</dt>
            <dd className="font-semibold">{product.material?.code ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-(--brand-label)">Index</dt>
            <dd className="font-semibold">{product.index?.code ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-(--brand-label)">Coating</dt>
            <dd className="font-semibold">
              {product.coating?.name || product.coating?.code || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-(--brand-label)">Color</dt>
            <dd className="font-semibold">
              {product.color?.name || product.color?.code || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-(--brand-label)">Diameter</dt>
            <dd className="font-semibold">
              {product.diameter?.name || product.diameter?.code || "—"}
            </dd>
          </div>
          {product.family.supportsProgressiveType ||
          product.progressiveType ? (
            <div>
              <dt className="text-(--brand-label)">Progressive type</dt>
              <dd className="font-semibold">
                {product.progressiveType?.name ||
                  product.progressiveType?.code ||
                  "—"}
              </dd>
            </div>
          ) : null}
        </dl>
      </section>

      <CatalogMatrixPanel
        className="mb-6"
        variants={product.variants}
        familyLabel={product.family.name}
        highlightAxis={highlightAxis}
        family={{
          supportsAdd: product.family.supportsAdd,
          supportsAxis: product.family.supportsAxis,
          supportsEye: product.family.supportsEye,
        }}
      />

      <section className="mb-6">
        <h2 className="mb-3 text-sm font-extrabold uppercase tracking-[0.14em] text-(--brand-primary)">
          Variants
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
              {product.variants.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-(--brand-text-muted)">
                    No variants yet.
                  </TableCell>
                </TableRow>
              ) : (
                product.variants.map((v) => (
                  <TableRow key={v.id}>
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
                      <Button asChild size="sm" variant="outline" className="h-8 rounded-lg">
                        <Link href={`${CATALOG_HREF}/variants/${v.id}`}>
                          Open
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </AdminTable>
      </section>

      <section className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-5">
        <h2 className="mb-3 text-sm font-extrabold uppercase tracking-[0.14em] text-(--brand-primary)">
          Add power range
        </h2>
        <PowerRangeMultiSelect
          options={powerRanges.map((r) => ({
            id: r.id,
            label: formatPowerRangeCompact(
              r.sphMin,
              r.sphMax,
              r.cylMin,
              r.cylMax
            ),
            cylSummary: "",
            disabled: usedRangeIds.has(r.id),
          }))}
          selectedIds={addIds}
          onChange={setAddIds}
        />

        {showAddAxisMulti ? (
          <AxisMultiSelect
            options={attrNumericOptions(axes)}
            selectedIds={addAxisIds}
            onChange={setAddAxisIds}
          />
        ) : null}

        {supportsAdd ? (
          <AdditionMultiSelect
            options={attrNumericOptions(additions)}
            selectedIds={addAdditionIds}
            onChange={setAddAdditionIds}
          />
        ) : null}

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1.5">
            <span className={catalogLabelClass}>Purchase price (₹)</span>
            <Input
              value={addPurchasePrice}
              onChange={(e) => setAddPurchasePrice(e.target.value)}
              className={inputClass}
              inputMode="decimal"
              placeholder="Optional — 0 if blank"
            />
          </label>
          <label className="grid gap-1.5">
            <span className={catalogLabelClass}>Selling price (₹)</span>
            <Input
              value={addSellingPrice}
              onChange={(e) => setAddSellingPrice(e.target.value)}
              className={inputClass}
              inputMode="decimal"
              placeholder="Optional — 0 if blank"
            />
          </label>
        </div>

        <Button
          type="button"
          className="mt-4 h-9 rounded-xl bg-(--brand-primary) px-3 font-bold text-black"
          disabled={addBusy || addIds.length === 0}
          onClick={() => void addRanges()}
        >
          {addBusy ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Adding…
            </>
          ) : (
            "Add selected ranges"
          )}
        </Button>
      </section>
    </AdminPage>
  );
}
