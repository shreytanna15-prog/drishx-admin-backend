"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Grid3x3,
  LayoutList,
  Plus,
  Search,
} from "lucide-react";
import { AdminPage } from "@/components/admin-shell";
import { TableSkeleton } from "@/components/admin-skeletons";
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
  fetchLensAttributes,
  fetchLensProducts,
  type LensAttribute,
  type LensProduct,
} from "@/app/lib/admin-lens-catalog";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;

const labelClass =
  "text-[11px] font-bold uppercase tracking-wider text-(--brand-text-muted)";
const inputClass =
  "h-10 rounded-xl border-(--brand-input-border) bg-(--brand-input-bg) text-(--brand-text) placeholder:text-(--brand-placeholder)";
const selectClass =
  "h-10 w-full rounded-xl border border-(--brand-input-border) bg-(--brand-input-bg) px-3 text-sm text-(--brand-text) outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
const errorBannerClass =
  "rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200";

function errorMessage(err: unknown, fallback: string) {
  return err instanceof AdminApiError ? err.message : fallback;
}

type ViewMode = "list" | "grid";

export default function ProductsCatalogPage() {
  const [view, setView] = useState<ViewMode>("list");
  const [q, setQ] = useState("");
  const [qDraft, setQDraft] = useState("");
  const [familyId, setFamilyId] = useState("");
  const [baseId, setBaseId] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "true" | "false">(
    "all"
  );
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<LensProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [families, setFamilies] = useState<LensAttribute[]>([]);
  const [bases, setBases] = useState<LensAttribute[]>([]);
  const [materials, setMaterials] = useState<LensAttribute[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        const [f, b, m] = await Promise.all([
          fetchLensAttributes("family", { activeOnly: true }),
          fetchLensAttributes("base", { activeOnly: true }),
          fetchLensAttributes("material", { activeOnly: true }),
        ]);
        setFamilies(f.items);
        setBases(b.items);
        setMaterials(m.items);
      } catch {
        // filters optional
      }
    })();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetchLensProducts({
        q: q || undefined,
        familyId: familyId || undefined,
        baseId: baseId || undefined,
        materialId: materialId || undefined,
        isActive:
          activeFilter === "all" ? null : activeFilter === "true",
        page,
        limit: PAGE_SIZE,
      });
      setItems(res.items);
      setTotal(res.total ?? res.items.length);
      setHasMore(res.hasMore);
    } catch (err) {
      setError(errorMessage(err, "Failed to load products."));
      setItems([]);
      setTotal(0);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [q, familyId, baseId, materialId, activeFilter, page]);

  useEffect(() => {
    void load();
  }, [load]);

  function applySearch() {
    setPage(1);
    setQ(qDraft.trim());
  }

  return (
    <AdminPage
      title="Products & catalog"
      subtitle="SKU master products from attributes + power range. Open a product to see the SPH × CYL matrix (placeholders)."
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex min-w-[220px] flex-1 flex-wrap items-end gap-2">
            <label className="min-w-[200px] flex-1 space-y-1">
              <span className={labelClass}>Search</span>
              <div className="flex gap-2">
                <Input
                  className={inputClass}
                  value={qDraft}
                  onChange={(e) => setQDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") applySearch();
                  }}
                  placeholder="SKU, name, coating…"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 rounded-xl"
                  onClick={applySearch}
                >
                  <Search className="size-4" />
                </Button>
              </div>
            </label>
            <label className="w-36 space-y-1">
              <span className={labelClass}>Family</span>
              <select
                className={selectClass}
                value={familyId}
                onChange={(e) => {
                  setFamilyId(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All</option>
                {families.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.code}
                  </option>
                ))}
              </select>
            </label>
            <label className="w-36 space-y-1">
              <span className={labelClass}>Base</span>
              <select
                className={selectClass}
                value={baseId}
                onChange={(e) => {
                  setBaseId(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All</option>
                {bases.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.code}
                  </option>
                ))}
              </select>
            </label>
            <label className="w-40 space-y-1">
              <span className={labelClass}>Material</span>
              <select
                className={selectClass}
                value={materialId}
                onChange={(e) => {
                  setMaterialId(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All</option>
                {materials.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.code}
                  </option>
                ))}
              </select>
            </label>
            <label className="w-36 space-y-1">
              <span className={labelClass}>Status</span>
              <select
                className={selectClass}
                value={activeFilter}
                onChange={(e) => {
                  setActiveFilter(e.target.value as "all" | "true" | "false");
                  setPage(1);
                }}
              >
                <option value="all">All</option>
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </label>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex rounded-xl border border-(--brand-card-border) p-1">
              <button
                type="button"
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm font-bold",
                  view === "list"
                    ? "bg-(--brand-primary) text-black"
                    : "text-(--brand-text-muted)"
                )}
                onClick={() => setView("list")}
              >
                <LayoutList className="inline size-4" /> List
              </button>
              <button
                type="button"
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm font-bold",
                  view === "grid"
                    ? "bg-(--brand-primary) text-black"
                    : "text-(--brand-text-muted)"
                )}
                onClick={() => setView("grid")}
              >
                <Grid3x3 className="inline size-4" /> Grid
              </button>
            </div>
            <Button
              asChild
              className="h-10 rounded-xl bg-(--brand-primary) px-4 font-bold text-black hover:bg-(--brand-primary)/90"
            >
              <Link href="/inventory/products-catalog/new">
                <Plus className="mr-1 size-4" />
                Create product
              </Link>
            </Button>
          </div>
        </div>

        {error ? <div className={errorBannerClass}>{error}</div> : null}

        {loading ? (
          <TableSkeleton rows={8} />
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-(--brand-card-border) px-6 py-16 text-center">
            <p className="text-sm font-bold text-(--brand-text)">
              No catalog products yet
            </p>
            <p className="mt-1 text-sm text-(--brand-text-muted)">
              Create a product from attributes and a power range, or seed
              attributes first under Inventory → Attributes.
            </p>
            <Button
              asChild
              className="mt-4 h-10 rounded-xl bg-(--brand-primary) px-4 font-bold text-black"
            >
              <Link href="/inventory/products-catalog/new">Create product</Link>
            </Button>
          </div>
        ) : view === "list" ? (
          <div className="rounded-2xl border border-(--brand-card-border)">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Attributes</TableHead>
                  <TableHead>Range</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((p) => (
                  <TableRow key={p.id} className="cursor-pointer hover:bg-(--brand-input-bg)/50">
                    <TableCell className="align-top">
                      <Link
                        href={`/inventory/products-catalog/${p.id}`}
                        className="font-semibold text-(--brand-text) hover:underline"
                      >
                        {p.name}
                      </Link>
                    </TableCell>
                    <TableCell className="align-middle">
                      <SkuChip sku={p.skuCode} />
                    </TableCell>
                    <TableCell className="align-middle whitespace-normal text-sm text-(--brand-text-muted)">
                      {p.attributeSummary}
                    </TableCell>
                    <TableCell className="align-middle whitespace-normal text-sm text-(--brand-text)">
                      <div className="flex flex-col gap-1 text-xs tabular-nums leading-normal">
                        <span>
                          SPH {p.sphMin}…{p.sphMax}
                        </span>
                        <span>
                          CYL {p.cylMin}…{p.cylMax}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="align-middle">
                      <Badge
                        variant="outline"
                        className={
                          p.isActive
                            ? "h-7 overflow-visible border-emerald-500/40 text-emerald-700"
                            : "h-7 overflow-visible border-zinc-400/40 text-zinc-500"
                        }
                      >
                        {p.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((p) => (
              <Link
                key={p.id}
                href={`/inventory/products-catalog/${p.id}`}
                className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-4 transition hover:border-(--brand-primary)/50"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-bold text-(--brand-text)">{p.name}</p>
                  <Badge
                    variant="outline"
                    className={
                      p.isActive
                        ? "border-emerald-500/40 text-emerald-700"
                        : "border-zinc-400/40 text-zinc-500"
                    }
                  >
                    {p.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
                <SkuChip sku={p.skuCode} className="mt-1" />
                <p className="mt-2 text-sm text-(--brand-text-muted)">
                  {p.attributeSummary}
                </p>
                <div className="mt-1 text-xs leading-snug tabular-nums text-(--brand-text-muted)">
                  <div>
                    SPH {p.sphMin}…{p.sphMax}
                  </div>
                  <div>
                    CYL {p.cylMin}…{p.cylMax}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {!loading && items.length > 0 ? (
          <div className="flex items-center justify-between gap-3 text-sm text-(--brand-text-muted)">
            <span>
              Page {page}
              {total > 0 ? ` · ${total} total` : null}
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-9 rounded-xl"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-9 rounded-xl"
                disabled={!hasMore}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </AdminPage>
  );
}
