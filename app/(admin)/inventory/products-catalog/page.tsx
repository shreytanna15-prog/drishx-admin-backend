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
import { formatPowerRangeSpan } from "@/app/lib/catalog/catalog-power-select-options";
import {
  buildLensProductFlatGroupName,
  buildLensProductFlatLeafName,
} from "@/app/lib/catalog/lens-product-sku";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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

type AxisSubgroup = {
  key: string;
  axis: number | null;
  label: string;
  variants: LensProductVariant[];
};

/** Flat: within a name group, nest variants by axis (largest first; none last). */
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
      return {
        key,
        axis,
        label: axis == null ? "No axis" : `Axis ${axis}°`,
        variants: vs.toSorted((a, b) => a.skuCode.localeCompare(b.skuCode)),
      };
    })
    .toSorted((a, b) => {
      if (a.axis == null && b.axis == null) return 0;
      if (a.axis == null) return 1;
      if (b.axis == null) return -1;
      return b.axis - a.axis;
    });
}

function axisExpandKey(groupKey: string, axisKey: string) {
  return `${groupKey}::${axisKey}`;
}

function flatNameParts(v: LensProductVariant) {
  const p = v.product;
  return {
    familyCode: p.family.code,
    baseCode: p.base.code,
    materialCode: p.material?.code ?? null,
    indexCode: p.index?.code ?? null,
    coatingLabel: p.coating?.name?.trim() || p.coating?.code || null,
    colorLabel: p.color?.name?.trim() || p.color?.code || null,
    sphMin: v.sphMin,
    sphMax: v.sphMax,
    cylMin: v.cylMin,
    cylMax: v.cylMax,
  };
}

/** Parent: attrs + compact power (material/coating/color when set). No axis, no span. */
function flatParentLabel(v: LensProductVariant): string {
  return buildLensProductFlatGroupName(flatNameParts(v));
}

/** Leaf: attrs + compact power + axis. No span. Stored variant.name is unchanged. */
function flatLeafLabel(v: LensProductVariant): string {
  return buildLensProductFlatLeafName({
    ...flatNameParts(v),
    axisValue: v.axis,
  });
}

/** Catalog list only: SPH/CYL min–max span under compact name (+ tooltip). */
function flatPowerBoundsLabel(v: Pick<
  LensProductVariant,
  "sphMin" | "sphMax" | "cylMin" | "cylMax"
>): string {
  return `${formatPowerRangeSpan(v.sphMin, v.sphMax)} / ${formatPowerRangeSpan(v.cylMin, v.cylMax)}`;
}

/** Same parent product + same power range → one Flat parent group. */
function flatParentGroupKey(v: LensProductVariant): string {
  return `${v.productId}::${v.powerRangeId}`;
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
  /** Flat view: collapsible name groups → axis subgroups → SKUs */
  const [expandedNameGroups, setExpandedNameGroups] = useState<Set<string>>(
    () => new Set()
  );
  const [expandedAxisGroups, setExpandedAxisGroups] = useState<Set<string>>(
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
      setExpandedAxisGroups(new Set());
      setGroupPage(1);
    }
  }, [listView, q, familyId, baseId, materialId, coatingId, activeFilter]);

  function applySearch() {
    setPage(1);
    setQ(qDraft.trim());
  }

  /**
   * Flat: parent = product name + power (e.g. KT HC +2.00/+2.00),
   * then axis subgroups, then SKUs.
   */
  const parentGroups = useMemo(() => {
    const map = new Map<string, LensProductVariant[]>();
    for (const v of flatVariants) {
      const key = flatParentGroupKey(v);
      const list = map.get(key);
      if (list) list.push(v);
      else map.set(key, [v]);
    }
    return Array.from(map.entries())
      .map(([groupKey, variants]) => {
        const sample = variants[0]!;
        return {
          groupKey,
          label: flatParentLabel(sample),
          boundsLabel: flatPowerBoundsLabel(sample),
          attributeSummary: sample.product.attributeSummary ?? "",
          rangeLabel: sample.rangeLabel,
          variants,
          axes: axisSubgroupsFromVariants(variants),
        };
      })
      .toSorted((a, b) => a.label.localeCompare(b.label));
  }, [flatVariants]);

  const totalGroups = parentGroups.length;
  const groupStart = (groupPage - 1) * GROUP_SIZE;
  const pageGroups = parentGroups.slice(groupStart, groupStart + GROUP_SIZE);

  type FlatRow =
    | {
        kind: "group";
        groupKey: string;
        label: string;
        boundsLabel: string;
        variantCount: number;
        axisCount: number;
        allActive: boolean;
        anyActive: boolean;
        attributeSummary: string;
        rangeLabel: string;
      }
    | {
        kind: "axis";
        groupKey: string;
        axisKey: string;
        label: string;
        variantCount: number;
        rangeSummary: string;
        allActive: boolean;
        anyActive: boolean;
      }
    | { kind: "variant"; variant: LensProductVariant };

  const flatRows: FlatRow[] = [];
  for (const g of pageGroups) {
    const allActive = g.variants.every((v) => v.isActive);
    const anyActive = g.variants.some((v) => v.isActive);
    flatRows.push({
      kind: "group",
      groupKey: g.groupKey,
      label: g.label,
      boundsLabel: g.boundsLabel,
      variantCount: g.variants.length,
      axisCount: g.axes.length,
      allActive,
      anyActive,
      attributeSummary: g.attributeSummary,
      rangeLabel: g.rangeLabel,
    });
    if (!expandedNameGroups.has(g.groupKey)) continue;
    for (const ax of g.axes) {
      const axAll = ax.variants.every((v) => v.isActive);
      const axAny = ax.variants.some((v) => v.isActive);
      flatRows.push({
        kind: "axis",
        groupKey: g.groupKey,
        axisKey: ax.key,
        label: ax.label,
        variantCount: ax.variants.length,
        rangeSummary: g.rangeLabel || "—",
        allActive: axAll,
        anyActive: axAny,
      });
      const axOpen = expandedAxisGroups.has(
        axisExpandKey(g.groupKey, ax.key)
      );
      if (!axOpen) continue;
      for (const v of ax.variants) {
        flatRows.push({ kind: "variant", variant: v });
      }
    }
  }

  return (
    <AdminPage
      title="Products & catalog"
      subtitle="Flat: name + power → axis → SKUs (compact names; material/coating/color when set)."
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex min-w-[220px] flex-1 flex-wrap items-end gap-2">
            <label className="flex min-w-[200px] flex-1 flex-col gap-1">
              <span className={labelClass}>Search</span>
              <div className="flex h-10 items-center gap-2">
                <Input
                  className={cn(inputClass, "h-10")}
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
                  className="size-10 shrink-0 rounded-xl"
                  onClick={applySearch}
                >
                  <Search className="size-4" />
                </Button>
              </div>
            </label>
            <label className="flex w-36 flex-col gap-1">
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
                size="default"
                triggerClassName="h-10 rounded-xl min-w-0"
              />
            </label>
            <label className="flex w-36 flex-col gap-1">
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
                size="default"
                triggerClassName="h-10 rounded-xl min-w-0"
              />
            </label>
            <label className="flex w-40 flex-col gap-1">
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
                size="default"
                triggerClassName="h-10 rounded-xl min-w-0"
              />
            </label>
            <label className="flex w-40 flex-col gap-1">
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
                size="default"
                triggerClassName="h-10 rounded-xl min-w-0"
              />
            </label>
            <label className="flex w-36 flex-col gap-1">
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
                size="default"
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
                  setExpandedAxisGroups(new Set());
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
                {flatRows.map((row) => {
                  if (row.kind === "group") {
                    const open = expandedNameGroups.has(row.groupKey);
                    return (
                      <TableRow key={`group-${row.groupKey}`}>
                        <TableCell className="w-10 pr-0">
                          <button
                            type="button"
                            className="inline-flex size-8 items-center justify-center rounded-lg text-(--brand-text-muted) hover:bg-(--brand-input-bg) hover:text-(--brand-text)"
                            aria-expanded={open}
                            aria-label={
                              open ? "Collapse axes" : "Expand axes"
                            }
                            onClick={() => {
                              setExpandedNameGroups((prev) => {
                                const next = new Set(prev);
                                if (next.has(row.groupKey)) {
                                  next.delete(row.groupKey);
                                  setExpandedAxisGroups((axes) => {
                                    const pruned = new Set(axes);
                                    for (const k of axes) {
                                      if (
                                        k.startsWith(`${row.groupKey}::`)
                                      ) {
                                        pruned.delete(k);
                                      }
                                    }
                                    return pruned;
                                  });
                                } else {
                                  next.add(row.groupKey);
                                }
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
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="inline-flex max-w-full flex-col items-start gap-0.5 text-left">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-semibold text-(--brand-text)">
                                    {row.label}
                                  </span>
                                  <Badge
                                    variant="secondary"
                                    className="text-[10px]"
                                  >
                                    {row.axisCount}{" "}
                                    {row.axisCount === 1 ? "axis" : "axes"} ·{" "}
                                    {row.variantCount} SKU
                                    {row.variantCount === 1 ? "" : "s"}
                                  </Badge>
                                </div>
                                <span className="text-[11px] text-(--brand-text-muted)">
                                  {row.boundsLabel}
                                </span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              {row.boundsLabel}
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell className="text-sm text-(--brand-text-muted)">
                          —
                        </TableCell>
                        <TableCell className="text-sm text-(--brand-text-muted)">
                          {row.attributeSummary}
                        </TableCell>
                        <TableCell className="text-sm text-(--brand-text-muted)">
                          {row.rangeLabel || "—"}
                        </TableCell>
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
                            {row.allActive
                              ? "Active"
                              : row.anyActive
                                ? "Mixed"
                                : "Inactive"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  }

                  if (row.kind === "axis") {
                    const key = axisExpandKey(row.groupKey, row.axisKey);
                    const open = expandedAxisGroups.has(key);
                    return (
                      <TableRow
                        key={`axis-${key}`}
                        className="bg-(--brand-input-bg)/20"
                      >
                        <TableCell className="w-10 pr-0" />
                        <TableCell className="pl-6">
                          <div className="flex items-center gap-1 border-l-2 border-(--brand-card-border) pl-3">
                            <button
                              type="button"
                              className="inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-(--brand-text-muted) hover:bg-(--brand-input-bg) hover:text-(--brand-text)"
                              aria-expanded={open}
                              aria-label={
                                open ? "Collapse SKUs" : "Expand SKUs"
                              }
                              onClick={() => {
                                setExpandedAxisGroups((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(key)) next.delete(key);
                                  else next.add(key);
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
                            <span className="font-medium text-(--brand-text)">
                              {row.label}
                            </span>
                            <Badge
                              variant="secondary"
                              className="ml-1 text-[10px]"
                            >
                              {row.variantCount} SKU
                              {row.variantCount === 1 ? "" : "s"}
                            </Badge>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-(--brand-text-muted)">
                          —
                        </TableCell>
                        <TableCell className="text-sm text-(--brand-text-muted)">
                          {row.rangeSummary}
                        </TableCell>
                        <TableCell className="text-sm text-(--brand-text-muted)">
                          —
                        </TableCell>
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
                            {row.allActive
                              ? "Active"
                              : row.anyActive
                                ? "Mixed"
                                : "Inactive"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  }

                  const v = row.variant;
                  return (
                    <TableRow
                      key={`variant-${v.id}`}
                      className="bg-(--brand-input-bg)/35"
                    >
                      <TableCell />
                      <TableCell className="pl-16">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Link
                              href={`/inventory/products-catalog/variants/${v.id}`}
                              className="inline-flex max-w-full flex-col items-start gap-0.5 text-left"
                            >
                              <span className="font-semibold text-(--brand-text) hover:underline">
                                {flatLeafLabel(v)}
                              </span>
                              <span className="text-[11px] font-normal text-(--brand-text-muted)">
                                {flatPowerBoundsLabel(v)}
                              </span>
                            </Link>
                          </TooltipTrigger>
                          <TooltipContent side="top">
                            {flatPowerBoundsLabel(v)}
                          </TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell>
                        <SkuChip sku={v.skuCode} />
                      </TableCell>
                      <TableCell className="text-sm text-(--brand-text-muted)">
                        {v.product.attributeSummary}
                      </TableCell>
                      <TableCell className="text-sm">{v.rangeLabel}</TableCell>
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
                  );
                })}
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
