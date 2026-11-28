"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Layers,
  RefreshCw,
  Search,
} from "lucide-react";
import { AdminPage } from "@/components/admin-shell";
import { AdminSelect } from "@/components/admin-select";
import { CardGridSkeleton } from "@/components/admin-skeletons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminApiError } from "@/app/lib/admin-api";
import {
  fetchLensAttributes,
  type LensAttribute,
} from "@/app/lib/admin-lens-catalog";
import {
  fetchPowerWiseProducts,
  type PowerWiseProductCard,
} from "@/app/lib/admin-power-wise-stock";

type AttrOptions = {
  family: LensAttribute[];
  base: LensAttribute[];
  material: LensAttribute[];
  index: LensAttribute[];
  coating: LensAttribute[];
  color: LensAttribute[];
  diameter: LensAttribute[];
  progressiveType: LensAttribute[];
};

const EMPTY_ATTRS: AttrOptions = {
  family: [],
  base: [],
  material: [],
  index: [],
  coating: [],
  color: [],
  diameter: [],
  progressiveType: [],
};

function toOptions(items: LensAttribute[], allLabel: string) {
  return [
    { value: "", label: allLabel },
    ...items.map((item) => ({
      value: item.id,
      label:
        item.value != null && Number.isFinite(item.value)
          ? `${item.name} (${Number(item.value).toFixed(2)})`
          : item.name,
    })),
  ];
}

export default function PowerWiseStockPage() {
  const [products, setProducts] = useState<PowerWiseProductCard[]>([]);
  const [attrs, setAttrs] = useState<AttrOptions>(EMPTY_ATTRS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [familyId, setFamilyId] = useState("");
  const [baseId, setBaseId] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [indexId, setIndexId] = useState("");
  const [coatingId, setCoatingId] = useState("");
  const [colorId, setColorId] = useState("");
  const [diameterId, setDiameterId] = useState("");
  const [progressiveTypeId, setProgressiveTypeId] = useState("");
  const [shortageOnly, setShortageOnly] = useState(false);

  const loadAttrs = useCallback(async () => {
    const types = [
      "family",
      "base",
      "material",
      "index",
      "coating",
      "color",
      "diameter",
      "progressive-type",
    ] as const;
    const results = await Promise.all(
      types.map((type) =>
        fetchLensAttributes(type, { activeOnly: true }).catch(() => ({
          items: [] as LensAttribute[],
        }))
      )
    );
    setAttrs({
      family: results[0]?.items ?? [],
      base: results[1]?.items ?? [],
      material: results[2]?.items ?? [],
      index: results[3]?.items ?? [],
      coating: results[4]?.items ?? [],
      color: results[5]?.items ?? [],
      diameter: results[6]?.items ?? [],
      progressiveType: results[7]?.items ?? [],
    });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchPowerWiseProducts({
        q: q.trim() || undefined,
        familyId: familyId || undefined,
        baseId: baseId || undefined,
        materialId: materialId || undefined,
        indexId: indexId || undefined,
        coatingId: coatingId || undefined,
        colorId: colorId || undefined,
        diameterId: diameterId || undefined,
        progressiveTypeId: progressiveTypeId || undefined,
        shortageOnly: shortageOnly || undefined,
      });
      setProducts(res.products);
    } catch (err) {
      setError(
        err instanceof AdminApiError
          ? err.message
          : "Failed to load Power-wise products."
      );
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [
    q,
    familyId,
    baseId,
    materialId,
    indexId,
    coatingId,
    colorId,
    diameterId,
    progressiveTypeId,
    shortageOnly,
  ]);

  useEffect(() => {
    void loadAttrs();
  }, [loadAttrs]);

  useEffect(() => {
    void load();
  }, [load]);

  const familySupportsProgressive = useMemo(() => {
    if (!familyId) return true;
    const family = attrs.family.find((f) => f.id === familyId);
    return family?.supportsProgressiveType !== false;
  }, [attrs.family, familyId]);

  return (
    <AdminPage
      title="Power-wise Inventory"
      subtitle="Find a product → pick a variant → view stock by power. Read-only. For threshold/target use Stock by Product."
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-(--brand-text-muted)" />
          <Input
            className="h-9 pl-8"
            placeholder="Search products by name, base, coating…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Button variant="outline" size="sm" className="h-9" onClick={() => void load()}>
          <RefreshCw className="size-4" />
          Refresh
        </Button>
        <Button asChild variant="outline" size="sm" className="h-9">
          <Link href="/inventory/stock-overview">Stock by Product</Link>
        </Button>
      </div>

      <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <AdminSelect
          value={familyId}
          onValueChange={setFamilyId}
          options={toOptions(attrs.family, "All families")}
          triggerClassName="h-9 w-full"
        />
        <AdminSelect
          value={baseId}
          onValueChange={setBaseId}
          options={toOptions(attrs.base, "All bases")}
          triggerClassName="h-9 w-full"
        />
        <AdminSelect
          value={materialId}
          onValueChange={setMaterialId}
          options={toOptions(attrs.material, "All materials")}
          triggerClassName="h-9 w-full"
        />
        <AdminSelect
          value={indexId}
          onValueChange={setIndexId}
          options={toOptions(attrs.index, "All indexes")}
          triggerClassName="h-9 w-full"
        />
        <AdminSelect
          value={coatingId}
          onValueChange={setCoatingId}
          options={toOptions(attrs.coating, "All coatings")}
          triggerClassName="h-9 w-full"
        />
        <AdminSelect
          value={colorId}
          onValueChange={setColorId}
          options={toOptions(attrs.color, "All colors")}
          triggerClassName="h-9 w-full"
        />
        <AdminSelect
          value={diameterId}
          onValueChange={setDiameterId}
          options={toOptions(attrs.diameter, "All diameters")}
          triggerClassName="h-9 w-full"
        />
        {familySupportsProgressive ? (
          <AdminSelect
            value={progressiveTypeId}
            onValueChange={setProgressiveTypeId}
            options={toOptions(attrs.progressiveType, "All progressive types")}
            triggerClassName="h-9 w-full"
          />
        ) : null}
      </div>

      <div className="mb-5 flex items-center justify-end">
        <label className="flex h-9 items-center gap-2 rounded-md border border-(--brand-card-border) bg-(--brand-card) px-3 text-xs font-medium whitespace-nowrap text-(--brand-text)">
          <input
            type="checkbox"
            checked={shortageOnly}
            onChange={(e) => setShortageOnly(e.target.checked)}
          />
          Active shortages only
        </label>
      </div>

      {error ? (
        <p className="text-sm text-red-600">{error}</p>
      ) : loading ? (
        <CardGridSkeleton />
      ) : products.length === 0 ? (
        <div className="rounded-xl border border-(--brand-card-border) bg-(--brand-card) px-6 py-12 text-center">
          <p className="text-sm text-(--brand-text-muted)">
            No catalog products match the current filters.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((card) => {
            const attrsLine = [
              card.familyName,
              card.baseName,
              card.materialName,
              card.indexValue != null ? card.indexValue.toFixed(2) : null,
              card.coatingName,
              card.colorName,
              card.diameterName,
              card.progressiveTypeName,
            ]
              .filter(Boolean)
              .join(" · ");

            return (
              <Link
                key={card.productId}
                href={`/inventory/power-wise-stock/${card.productId}`}
                className="group flex flex-col justify-between rounded-xl border border-(--brand-card-border) bg-(--brand-card) p-4 transition-colors hover:border-(--brand-primary)/60"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className="text-[11px]">
                          {card.familyCode}
                        </Badge>
                        <span className="text-xs text-(--brand-text-muted)">
                          {card.variantCount}{" "}
                          {card.variantCount === 1 ? "variant" : "variants"}
                        </span>
                      </div>
                      <h2 className="mt-1.5 truncate text-base font-semibold text-(--brand-text) group-hover:text-(--brand-primary)">
                        {card.name}
                      </h2>
                      <p className="mt-0.5 line-clamp-1 text-xs text-(--brand-text-muted)">
                        {attrsLine}
                      </p>
                    </div>
                    {card.activeShortagesCount > 0 ? (
                      <Badge className="shrink-0 gap-1 bg-amber-100 text-amber-900">
                        <AlertTriangle className="size-3" />
                        {card.activeShortagesCount} short
                      </Badge>
                    ) : null}
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-2 rounded-lg border border-(--brand-card-border) bg-(--brand-bg)/50 p-2.5 text-center">
                    <div>
                      <div className="text-[11px] text-(--brand-text-muted)">
                        On-Hand
                      </div>
                      <div className="mt-0.5 text-base font-bold tabular-nums text-(--brand-text)">
                        {card.totalOnHand}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-(--brand-text-muted)">
                        Available
                      </div>
                      <div className="mt-0.5 text-base font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                        {card.totalAvailable}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-(--brand-text-muted)">
                        Reserved
                      </div>
                      <div className="mt-0.5 text-base font-bold tabular-nums text-(--brand-text)">
                        {card.totalReserved}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between text-xs text-(--brand-text-muted)">
                  <span className="inline-flex items-center gap-1">
                    <Layers className="size-3.5" />
                    {card.leafCount} stocked cells
                  </span>
                  <span className="inline-flex items-center gap-1 font-semibold text-(--brand-primary)">
                    Open variants
                    <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </AdminPage>
  );
}
