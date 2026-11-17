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
import { SkuChip } from "@/components/catalog/sku-chip";
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
const FLAT_FETCH_LIMIT = 500;

const labelClass =
  "text-[11px] font-bold uppercase tracking-wider text-(--brand-text-muted)";
const inputClass =
  "h-10 rounded-xl border-(--brand-input-border) bg-(--brand-input-bg) text-(--brand-text) placeholder:text-(--brand-placeholder)";
const errorBannerClass =
  "rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200";

function errorMessage(err: unknown, fallback: string) {
  return err instanceof AdminApiError ? err.message : fallback;
}

function isVariant(
  row: LensProduct | LensProductVariant
): row is LensProductVariant {
  return "skuCode" in row && "productId" in row;
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
  const [items, setItems] = useState<Array<LensProduct | LensProductVariant>>(
    []
  );
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [families, setFamilies] = useState<LensAttribute[]>([]);
  const [bases, setBases] = useState<LensAttribute[]>([]);
  const [materials, setMaterials] = useState<LensAttribute[]>([]);
  const [coatings, setCoatings] = useState<LensAttribute[]>([]);
  /** RC-04 / CLIENT-PLAN: grouped view expands parents → variants */
  const [expandedParentIds, setExpandedParentIds] = useState<Set<string>>(
    () => new Set()
  );
  /** Flat view: collapsible name groups */
  const [expandedNameGroups, setExpandedNameGroups] = useState<Set<string>>(
    () => new Set()
  );
  const [groupPage, setGroupPage] = useState(1);
  const [flatVariants, setFlatVariants] = useState<LensProductVariant[]>([]);

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
      const fetchLimit = listView === "flat" ? FLAT_FETCH_LIMIT : PAGE_SIZE;
      const res = await fetchLensProducts({
        view: listView,
        q: q || undefined,
        familyId: familyId || undefined,
        baseId: baseId || undefined,
        materialId: materialId || undefined,
        coatingId: coatingId || undefined,
        isActive:
          activeFilter === "all" ? null : activeFilter === "true",
        page,
        limit: fetchLimit,
      });
      if (listView === "flat") {
        const variants = res.items.filter(isVariant);
        setFlatVariants(variants);
        setItems([]);
        setTotal(variants.length);
        setHasMore(false);
      } else {
        setFlatVariants([]);
        setItems(res.items);
        setTotal(res.total ?? res.items.length);
        setHasMore(res.hasMore);
      }
    } catch (err) {
      setError(errorMessage(err, "Failed to load products."));
      setItems([]);
      setFlatVariants([]);
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
    if (listView === "flat") {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset grouping on filter change
      setExpandedNameGroups(new Set());
      setGroupPage(1);
    }
  }, [listView, q, familyId, baseId, materialId, coatingId, activeFilter]);

  function applySearch() {
    setPage(1);
    setQ(qDraft.trim());
  }

  /** Flat view: group variants by name and paginate by group count */
  const nameGroups = useMemo(() => {
    const map = new Map<string, LensProductVariant[]>();
    for (const v of flatVariants) {
      const key = v.name;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(v);
    }
    return Array.from(map.entries())
      .map(([name, variants]) => ({
        name,
        variants: variants.sort((a, b) => a.skuCode.localeCompare(b.skuCode)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [flatVariants]);

  const totalGroups = nameGroups.length;
  const groupStart = (groupPage - 1) * GROUP_SIZE;
  const pageGroups = nameGroups.slice(groupStart, groupStart + GROUP_SIZE);

  const flatRows: Array<{
    kind: "group" | "variant";
    name?: string;
    variantCount?: number;
    allActive?: boolean;
    anyActive?: boolean;
    attributeSummary?: string;
    variant?: LensProductVariant;
  }> = [];
  for (const g of pageGroups) {
    const allActive = g.variants.every((v) => v.isActive);
    const anyActive = g.variants.some((v) => v.isActive);
    flatRows.push({
      kind: "group",
      name: g.name,
      variantCount: g.variants.length,
      allActive,
      anyActive,
      attributeSummary: g.variants[0]?.product.attributeSummary ?? "",
    });
    if (expandedNameGroups.has(g.name)) {
      for (const v of g.variants) {
        flatRows.push({ kind: "variant", variant: v });
      }
    }
  }

  return (
    <AdminPage
      title="Products & catalog"
      subtitle="Parents hold attributes; variants are sellable SKUs (one per power range)."
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
                  ...coatings.map((c) => ({ value: c.id, label: c.name })),
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
                  setExpandedNameGroups(new Set());
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

        {loading ? (
          <TableSkeleton rows={8} />
        ) : (listView === "flat" ? flatVariants.length === 0 : items.length === 0) ? (
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
        ) : listView === "flat" ? (
          <AdminTable>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" />
                  <TableHead>Name</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Attributes</TableHead>
                  <TableHead>Range</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {flatRows.map((row) =>
                  row.kind === "group" ? (
                    <TableRow key={`group-${row.name}`}>
                      <TableCell className="w-10 pr-0">
                        <button
                          type="button"
                          className="inline-flex size-8 items-center justify-center rounded-lg text-(--brand-text-muted) hover:bg-(--brand-input-bg) hover:text-(--brand-text)"
                          aria-expanded={expandedNameGroups.has(row.name!)}
                          aria-label={
                            expandedNameGroups.has(row.name!)
                              ? "Collapse variants"
                              : "Expand variants"
                          }
                          onClick={() => {
                            setExpandedNameGroups((prev) => {
                              const next = new Set(prev);
                              if (next.has(row.name!)) next.delete(row.name!);
                              else next.add(row.name!);
                              return next;
                            });
                          }}
                        >
                          {expandedNameGroups.has(row.name!) ? (
                            <ChevronDown className="size-4" />
                          ) : (
                            <ChevronRight className="size-4" />
                          )}
                        </button>
                      </TableCell>
                      <TableCell>
                        <span className="font-semibold text-(--brand-text)">
                          {row.name}
                        </span>
                        <Badge variant="secondary" className="ml-2 text-[10px]">
                          {row.variantCount} variant(s)
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-(--brand-text-muted)">—</TableCell>
                      <TableCell className="text-sm text-(--brand-text-muted)">
                        {row.attributeSummary ?? ""}
                      </TableCell>
                      <TableCell className="text-sm text-(--brand-text-muted)">Multiple ranges</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            row.allActive
                              ? "border-emerald-500/40 text-emerald-700"
                              : row.anyActive
                                ? "border-amber-500/40 text-amber-700"
                                : "border-zinc-400/40 text-zinc-500"
                          }
                        >
                          {row.allActive ? "Active" : row.anyActive ? "Mixed" : "Inactive"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ) : (
                    <TableRow key={`variant-${row.variant!.id}`} className="bg-(--brand-input-bg)/30">
                      <TableCell />
                      <TableCell className="pl-6">
                        <div className="flex flex-col gap-1">
                          <Link
                            href={`/inventory/products-catalog/variants/${row.variant!.id}`}
                            className="font-semibold text-(--brand-text) hover:underline"
                          >
                            {row.variant!.name}
                          </Link>
                          <SkuChip sku={row.variant!.skuCode} />
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-(--brand-text-muted)">
                        {row.variant!.product.attributeSummary}
                      </TableCell>
                      <TableCell className="text-sm">{row.variant!.rangeLabel}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            row.variant!.isActive
                              ? "border-emerald-500/40 text-emerald-700"
                              : "border-zinc-400/40 text-zinc-500"
                          }
                        >
                          {row.variant!.isActive ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  )
                )}
              </TableBody>
            </Table>
          </AdminTable>
        ) : (
          <AdminTable>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" />
                  <TableHead>Parent</TableHead>
                  <TableHead>Attributes</TableHead>
                  <TableHead>Variants</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items
                  .filter((row): row is LensProduct => !isVariant(row))
                  .flatMap((p) => {
                    const open = expandedParentIds.has(p.id);
                    const parentRow = (
                      <TableRow key={p.id}>
                        <TableCell className="w-10 pr-0">
                          <button
                            type="button"
                            className="inline-flex size-8 items-center justify-center rounded-lg text-(--brand-text-muted) hover:bg-(--brand-input-bg) hover:text-(--brand-text)"
                            aria-expanded={open}
                            aria-label={
                              open
                                ? "Collapse variants"
                                : "Expand variants"
                            }
                            onClick={() => {
                              setExpandedParentIds((prev) => {
                                const next = new Set(prev);
                                if (next.has(p.id)) next.delete(p.id);
                                else next.add(p.id);
                                return next;
                              });
                            }}
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
                          {p.material ? ` · ${p.material.code}` : ""}
                        </TableCell>
                        <TableCell>{p.variantCount}</TableCell>
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
                    const variantRows =
                      (p.variants ?? []).length === 0
                        ? [
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
                          ]
                        : (p.variants ?? []).map((v) => (
                            <TableRow
                              key={v.id}
                              className="bg-(--brand-input-bg)/40"
                            >
                              <TableCell />
                              <TableCell className="pl-6">
                                <div className="flex flex-col gap-1">
                                  <Link
                                    href={`/inventory/products-catalog/variants/${v.id}`}
                                    className="font-semibold hover:underline"
                                  >
                                    {v.name}
                                  </Link>
                                  <SkuChip sku={v.skuCode} />
                                </div>
                              </TableCell>
                              <TableCell className="text-sm text-(--brand-text-muted)">
                                {v.rangeLabel}
                              </TableCell>
                              <TableCell>
                                <Button
                                  asChild
                                  size="sm"
                                  variant="outline"
                                  className="h-8 rounded-lg"
                                >
                                  <Link
                                    href={`/inventory/products-catalog/variants/${v.id}`}
                                  >
                                    Matrix
                                  </Link>
                                </Button>
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant="outline"
                                  className={
                                    v.isActive
                                      ? "border-emerald-500/40 text-emerald-700"
                                      : "border-zinc-400/40 text-zinc-500"
                                  }
                                >
                                  {v.isActive ? "Active" : "Inactive"}
                                </Badge>
                              </TableCell>
                            </TableRow>
                          ));
                    return [parentRow, ...variantRows];
                  })}
              </TableBody>
            </Table>
          </AdminTable>
        )}

        {!loading &&
        (listView === "flat" ? totalGroups > 0 : items.length > 0) ? (
          <div className="flex items-center justify-between gap-3 text-sm text-(--brand-text-muted)">
            <span>
              {listView === "flat"
                ? `Page ${groupPage} of ${Math.ceil(totalGroups / GROUP_SIZE)} groups`
                : `Page ${page}${total > 0 ? ` · ${total} total` : null}`}
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
                    ? groupPage >= Math.ceil(totalGroups / GROUP_SIZE)
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
