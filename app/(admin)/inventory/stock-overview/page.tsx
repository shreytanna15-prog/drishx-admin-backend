"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Layers, RefreshCw, Search } from "lucide-react";
import { AdminPage } from "@/components/admin-shell";
import { AdminSelect } from "@/components/admin-select";
import { CardGridSkeleton } from "@/components/admin-skeletons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminApiError } from "@/app/lib/admin-api";
import {
  fetchCatalogStockOverview,
  type CatalogStockOverview,
} from "@/app/lib/admin-stock";

export default function CatalogStockOverviewPage() {
  const [overview, setOverview] = useState<CatalogStockOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [familyCode, setFamilyCode] = useState("");
  const [shortageOnly, setShortageOnly] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetchCatalogStockOverview();
      setOverview(res.overview);
    } catch (err) {
      setError(
        err instanceof AdminApiError ? err.message : "Failed to load overview."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const cards = useMemo(() => {
    const list = overview?.productCards ?? [];
    const query = q.trim().toLowerCase();
    return list.filter((card) => {
      if (familyCode && card.familyCode !== familyCode) return false;
      if (shortageOnly && card.activeShortagesCount === 0) return false;
      if (!query) return true;
      return (
        card.name.toLowerCase().includes(query) ||
        card.familyName.toLowerCase().includes(query) ||
        card.baseName.toLowerCase().includes(query) ||
        (card.materialName ?? "").toLowerCase().includes(query) ||
        (card.coatingName ?? "").toLowerCase().includes(query)
      );
    });
  }, [overview, q, familyCode, shortageOnly]);

  return (
    <AdminPage
      title="Stock Overview"
      subtitle="Select any catalog product to open its live 2D Excel power matrix."
    >
      <div className="mb-3 flex flex-wrap items-center gap-2 lg:flex-nowrap">
        <div className="relative w-full lg:w-1/2 lg:shrink-0">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-(--brand-text-muted)" />
          <Input
            className="h-9 pl-8"
            placeholder="Search catalog products by name, base, material, coating…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="min-w-0 flex-1">
          <AdminSelect
            value={familyCode}
            onValueChange={setFamilyCode}
            options={[
              { value: "", label: "All families" },
              { value: "SV", label: "Single Vision" },
              { value: "KT", label: "Kryptok" },
              { value: "V2", label: "Progressive V2" },
            ]}
            triggerClassName="h-9 w-full min-w-32"
          />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" className="h-9" onClick={() => void load()}>
            <RefreshCw className="size-4" />
            Refresh
          </Button>
          <Button asChild variant="outline" size="sm" className="h-9">
            <Link href="/inventory/stock-dashboard">Stock Dashboard</Link>
          </Button>
          <Button asChild size="sm" className="h-9">
            <Link href="/inventory/power-wise-stock">Power-wise Inventory</Link>
          </Button>
        </div>
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
      ) : loading || !overview ? (
        <CardGridSkeleton />
      ) : cards.length === 0 ? (
        <div className="rounded-xl border border-(--brand-card-border) bg-(--brand-card) px-6 py-12 text-center">
          <p className="text-sm text-(--brand-text-muted)">
            No catalog products match the current filters.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => {
            const attrs = [
              card.familyName,
              card.baseName,
              card.materialName,
              card.indexValue != null ? card.indexValue.toFixed(2) : null,
              card.coatingName,
              card.colorName,
            ]
              .filter(Boolean)
              .join(" · ");

            return (
              <Link
                key={card.productId}
                href={`/inventory/stock-overview/${card.productId}`}
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
                        {attrs}
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
                    {card.openPoCount > 0 ? ` · ${card.openPoCount} open PO` : ""}
                  </span>
                  <span className="inline-flex items-center gap-1 font-semibold text-(--brand-primary)">
                    Open 2D Matrix
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
