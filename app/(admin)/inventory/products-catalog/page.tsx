"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  LayoutList,
  Plus,
  Search,
} from "lucide-react";
import { AdminPage } from "@/components/admin-shell";
import { TableSkeleton } from "@/components/admin-skeletons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminSelect } from "@/components/admin-select";
import { AdminTable } from "@/components/admin-table";
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
  type LensProductVariant,
} from "@/app/lib/admin-lens-catalog";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;
const GROUP_SIZE = 10;
/** Flat view loads parents once then paginates client-side. */
const FLAT_FETCH_LIMIT = 200;

const labelClass =
  "text-[11px] font-bold uppercase tracking-wider text-(--brand-text-muted)";
const inputClass =
  "h-10 rounded-xl border-(--brand-input-border) bg-(--brand-input-bg) text-(--brand-text) placeholder:text-(--brand-placeholder)";
const errorBannerClass =
  "rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200";

function errorMessage(err: unknown, fallback: string) {
  return err instanceof AdminApiError ? err.message : fallback;
}

function isProduct(
  row: LensProduct | LensProductVariant
): row is LensProduct {
  return "variantCount" in row && "attributeSummary" in row && !("skuCode" in row);
}

type AxisSubgroup = {
  key: string;
  axis: number | null;
  label: string;
  variantCount: number;
  rangeSummary: string;
};

/** Unique axes under a parent — largest first; axis-less last. */
function axisSubgroupsFromVariants(
  variants: LensProductVariant[]
): AxisSubgroup[] {
  const map = new Map<string, LensProductVariant[]>();
  for (const v of variants) {
    const key = v.axis == null ? "none" : String(v.axis);
    const list = map.get(key);
    if (list) list.push(v);
    else map.set(key, [v]);
  }
  return Array.from(map.entries())
    .map(([key, vs]) => {
      const axis = key === "none" ? null : Number(key);
      const ranges = [...new Set(vs.map((v) => v.rangeLabel).filter(Boolean))];
      return {
        key,
        axis,
        label: axis == null ? "No axis" : `${axis}°`,
        variantCount: vs.length,
        rangeSummary: ranges.join(" · ") || "—",
      };
    })
    .sort((a, b) => {
      if (a.axis == null && b.axis == null) return 0;
      if (a.axis == null) return 1;
      if (b.axis == null) return -1;
      return b.axis - a.axis;
    });
}

function parentMatrixHref(productId: string, axis: number | null) {
  const base = `/inventory/products-catalog/${productId}`;
  // Query only — panel scrolls itself; avoid stacking `#matrix#matrix`.
  if (axis == null) return base;
  return `${base}?axis=${axis}`;
}

export default function ProductsCatalogPage() {
  const [listView, setListView] = useState<"flat" | "grouped">("flat");
  const [q, setQ] = useState("");
  const [qDraft, setQDraft] = useState("");
  const [familyId, setFamilyId] = useState("");
  const [baseId, setBaseId] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [coatingId, setCoatingId] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "true" | "false">(
    "all"
  );
  const [page, setPage] = useState(1);
  const [parents, setParents] = useState<LensProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [families, setFamilies] = useState<LensAttribute[]>([]);
  const [bases, setBases] = useState<LensAttribute[]>([]);
  const [materials, setMaterials] = useState<LensAttribute[]>([]);
  const [coatings, setCoatings] = useState<LensAttribute[]>([]);
  const [expandedParentIds, setExpandedParentIds] = useState<Set<string>>(
    () => new Set()
  );
  const [groupPage, setGroupPage] = useState(1);

  useEffect(() => {
    void (async () => {
      try {
        const [f, b, m, c] = await Promise.all([
          fetchLensAttributes("family", { activeOnly: true }),
          fetchLensAttributes("base", { activeOnly: true }),
          fetchLensAttributes("material", { activeOnly: true }),
          fetchLensAttributes("coating", { activeOnly: true }),
        ]);
        setFamilies(f.items);
        setBases(b.items);
        setMaterials(m.items);
        setCoatings(c.items);
      } catch {
        // filters optional
      }
    })();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      // Always load parents + nested variants so both views can subgroup by axis.
      const fetchPage = listView === "flat" ? 1 : page;
      const fetchLimit = listView === "flat" ? FLAT_FETCH_LIMIT : PAGE_SIZE;
      const res = await fetchLensProducts({
        view: "grouped",
        q: q || undefined,
        familyId: familyId || undefined,
        baseId: baseId || undefined,
        materialId: materialId || undefined,
        coatingId: coatingId || undefined,
        isActive:
          activeFilter === "all" ? null : activeFilter === "true",
        page: fetchPage,
        limit: fetchLimit,
      });
      const nextParents = res.items.filter(isProduct);
      setParents(nextParents);
      setTotal(res.total ?? nextParents.length);
      setHasMore(Boolean(res.hasMore));
    } catch (err) {
      setError(errorMessage(err, "Failed to load products."));
      setParents([]);
      setTotal(0);
      setHasMore(false);
    } finally {
      setLoading(false);
    }
  }, [q, familyId, baseId, materialId, coatingId, activeFilter, page, listView]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch list on filter change
    void load();
  }, [load]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset expand/page on filter change
    setExpandedParentIds(new Set());
    setGroupPage(1);
  }, [listView, q, familyId, baseId, materialId, coatingId, activeFilter]);

  function applySearch() {
    setPage(1);
    setQ(qDraft.trim());
  }

  function toggleParent(id: string) {
    setExpandedParentIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const visibleParents = useMemo(() => {
    if (listView === "grouped") return parents;
    const start = (groupPage - 1) * GROUP_SIZE;
    return parents.slice(start, start + GROUP_SIZE);
  }, [listView, parents, groupPage]);

  const flatGroupPages = Math.max(1, Math.ceil(parents.length / GROUP_SIZE));

  return (
    <AdminPage
      title="Products & catalog"
      subtitle="Parents hold attributes; expand to axes, then open the matrix."
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
                  placeholder="SKU, name, attributes…"
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
              <AdminSelect
                value={familyId}
                onValueChange={(v) => {
                  setFamilyId(v);
                  setPage(1);
                }}
                options={[
                  { value: "", label: "All" },
                  ...families.map((f) => ({ value: f.id, label: f.code })),
                ]}
                placeholder="All"
                size="sm"
                triggerClassName="h-10 rounded-xl min-w-0"
              />
            </label>
            <label className="w-36 space-y-1">
              <span className={labelClass}>Base</span>
              <AdminSelect
                value={baseId}
                onValueChange={(v) => {
                  setBaseId(v);
                  setPage(1);
                }}
                options={[
                  { value: "", label: "All" },
                  ...bases.map((b) => ({ value: b.id, label: b.code })),
                ]}
                placeholder="All"
                size="sm"
                triggerClassName="h-10 rounded-xl min-w-0"
              />
            </label>
            <label className="w-40 space-y-1">
              <span className={labelClass}>Material</span>
              <AdminSelect
                value={materialId}
                onValueChange={(v) => {
                  setMaterialId(v);
                  setPage(1);
                }}
                options={[
                  { value: "", label: "All" },
                  ...materials.map((m) => ({ value: m.id, label: m.code })),
                ]}
                placeholder="All"
                size="sm"
                triggerClassName="h-10 rounded-xl min-w-0"
              />
            </label>
            <label className="w-40 space-y-1">
              <span className={labelClass}>Coating</span>
              <AdminSelect
                value={coatingId}
                onValueChange={(v) => {
                  setCoatingId(v);
                  setPage(1);
                }}
                options={[
                  { value: "", label: "All" },
                  ...coatings.map((c) => ({ value: c.id, label: c.code })),
                ]}
                placeholder="All"
                size="sm"
                triggerClassName="h-10 rounded-xl min-w-0"
              />
            </label>
            <label className="w-36 space-y-1">
              <span className={labelClass}>Status</span>
              <AdminSelect
                value={activeFilter}
                onValueChange={(v) => {
                  setActiveFilter(v as "all" | "true" | "false");
                  setPage(1);
                }}
                options={[
                  { value: "all", label: "All" },
                  { value: "true", label: "Active" },
                  { value: "false", label: "Inactive" },
                ]}
                placeholder="All"
                size="sm"
                triggerClassName="h-10 rounded-xl min-w-0"
              />
            </label>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex rounded-xl border border-(--brand-card-border) p-1">
              <button
                type="button"
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm font-bold",
                  listView === "flat"
                    ? "bg-(--brand-primary) text-black"
                    : "text-(--brand-text-muted)"
                )}
                onClick={() => {
                  setListView("flat");
                  setPage(1);
                  setGroupPage(1);
                  setExpandedParentIds(new Set());
                }}
              >
                <LayoutList className="inline size-4" /> Flat
              </button>
              <button
                type="button"
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm font-bold",
                  listView === "grouped"
                    ? "bg-(--brand-primary) text-black"
                    : "text-(--brand-text-muted)"
                )}
                onClick={() => {
                  setListView("grouped");
                  setPage(1);
                  setExpandedParentIds(new Set());
                }}
              >
                <LayoutGrid className="inline size-4" /> Grouped
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
        {listView === "flat" && hasMore && !loading && !error ? (
          <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
            Showing the first {parents.length} of {total} products. Narrow
            filters if results look incomplete.
          </div>
        ) : null}

        {loading ? (
          <TableSkeleton rows={8} />
        ) : parents.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-(--brand-card-border) px-6 py-16 text-center">
            <p className="text-sm font-bold text-(--brand-text)">
              No catalog products yet
            </p>
            <p className="mt-1 text-sm text-(--brand-text-muted)">
              Create a parent from attributes and attach one or more power
              ranges as variants.
            </p>
            <Button
              asChild
              className="mt-4 h-10 rounded-xl bg-(--brand-primary) px-4 font-bold text-black"
            >
              <Link href="/inventory/products-catalog/new">Create product</Link>
            </Button>
          </div>
        ) : (
          <AdminTable>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" />
                  <TableHead>Product</TableHead>
                  <TableHead>Attributes</TableHead>
                  <TableHead>Axes / variants</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleParents.flatMap((p) => {
                  const open = expandedParentIds.has(p.id);
                  const axes = axisSubgroupsFromVariants(p.variants ?? []);
                  const parentRow = (
                    <TableRow key={p.id}>
                      <TableCell className="w-10 pr-0">
                        <button
                          type="button"
                          className="inline-flex size-8 items-center justify-center rounded-lg text-(--brand-text-muted) hover:bg-(--brand-input-bg) hover:text-(--brand-text)"
                          aria-expanded={open}
                          aria-label={open ? "Collapse axes" : "Expand axes"}
                          onClick={() => toggleParent(p.id)}
                        >
                          {open ? (
                            <ChevronDown className="size-4" />
                          ) : (
                            <ChevronRight className="size-4" />
                          )}
                        </button>
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/inventory/products-catalog/${p.id}`}
                          className="font-semibold hover:underline"
                        >
                          {p.attributeSummary}
                        </Link>
                      </TableCell>
                      <TableCell className="text-sm text-(--brand-text-muted)">
                        {p.family.code} · {p.base.code}
                        {p.coating ? ` · ${p.coating.code}` : ""}
                        {p.material ? ` · ${p.material.code}` : ""}
                      </TableCell>
                      <TableCell className="text-sm text-(--brand-text-muted)">
                        {axes.length} axis
                        {axes.length === 1 ? "" : "es"}
                        <span className="text-(--brand-text-muted)/70">
                          {" "}
                          · {p.variantCount} SKU
                          {p.variantCount === 1 ? "" : "s"}
                        </span>
                      </TableCell>
                      <TableCell>
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
                      </TableCell>
                    </TableRow>
                  );

                  if (!open) return [parentRow];

                  if (axes.length === 0) {
                    return [
                      parentRow,
                      <TableRow
                        key={`${p.id}-empty`}
                        className="bg-(--brand-input-bg)/40"
                      >
                        <TableCell />
                        <TableCell
                          colSpan={4}
                          className="text-sm text-(--brand-text-muted)"
                        >
                          No variants on this parent.
                        </TableCell>
                      </TableRow>,
                    ];
                  }

                  const axisRows = axes.map((ax) => (
                    <TableRow
                      key={`${p.id}-axis-${ax.key}`}
                      className="bg-(--brand-input-bg)/40"
                    >
                      <TableCell />
                      <TableCell className="pl-6">
                        <Link
                          href={parentMatrixHref(p.id, ax.axis)}
                          className="font-semibold tabular-nums hover:underline"
                        >
                          {ax.label}
                        </Link>
                        <p className="mt-0.5 text-xs text-(--brand-text-muted)">
                          Open matrix
                        </p>
                      </TableCell>
                      <TableCell className="text-sm text-(--brand-text-muted)">
                        {ax.rangeSummary}
                      </TableCell>
                      <TableCell className="text-sm text-(--brand-text-muted)">
                        {ax.variantCount} SKU
                        {ax.variantCount === 1 ? "" : "s"}
                      </TableCell>
                      <TableCell>
                        <Button
                          asChild
                          size="sm"
                          variant="outline"
                          className="h-8 rounded-lg"
                        >
                          <Link href={parentMatrixHref(p.id, ax.axis)}>
                            Matrix
                          </Link>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ));

                  return [parentRow, ...axisRows];
                })}
              </TableBody>
            </Table>
          </AdminTable>
        )}

        {!loading && parents.length > 0 ? (
          <div className="flex items-center justify-between gap-3 text-sm text-(--brand-text-muted)">
            <span>
              {listView === "flat"
                ? `Page ${groupPage} of ${flatGroupPages} · ${parents.length} product${parents.length === 1 ? "" : "s"}`
                : `Page ${page}${total > 0 ? ` · ${total} total` : ""}`}
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-9 rounded-xl"
                disabled={listView === "flat" ? groupPage <= 1 : page <= 1}
                onClick={() => {
                  if (listView === "flat") {
                    setGroupPage((p) => Math.max(1, p - 1));
                  } else {
                    setPage((p) => Math.max(1, p - 1));
                  }
                }}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-9 rounded-xl"
                disabled={
                  listView === "flat"
                    ? groupPage >= flatGroupPages
                    : !hasMore
                }
                onClick={() => {
                  if (listView === "flat") {
                    setGroupPage((p) => p + 1);
                  } else {
                    setPage((p) => p + 1);
                  }
                }}
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
