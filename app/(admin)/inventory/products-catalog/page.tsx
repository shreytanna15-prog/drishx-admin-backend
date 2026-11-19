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

type CatalogListView = "flat" | "grid";

const FLAT_GROUP_SIZE = 10;
const FLAT_FETCH_LIMIT = 500;
const GRID_PAGE_SIZE = 12;

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

function isProduct(row: LensProduct | LensProductVariant): row is LensProduct {
  return "variantCount" in row && "variants" in row && !("skuCode" in row);
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
function flatPowerBoundsLabel(
  v: Pick<LensProductVariant, "sphMin" | "sphMax" | "cylMin" | "cylMax">
): string {
  return `${formatPowerRangeSpan(v.sphMin, v.sphMax)} / ${formatPowerRangeSpan(v.cylMin, v.cylMax)}`;
}

/** Same parent product + same power range → one Flat parent group. */
function flatParentGroupKey(v: LensProductVariant): string {
  return `${v.productId}::${v.powerRangeId}`;
}

function attrChipsFromProduct(p: LensProduct): string[] {
  return [
    p.family.code,
    p.base.code,
    p.material?.code,
    p.index?.code,
    p.coating?.name || p.coating?.code,
    p.color?.name || p.color?.code,
    p.diameter?.code,
    p.progressiveType?.code,
  ].flatMap((x) => (x ? [x] : []));
}

/** Unique power ranges on a parent — compact label + Flat-style span subtitle. */
function uniqueRangesFromParent(p: LensProduct): Array<{
  key: string;
  label: string;
  boundsLabel: string;
}> {
  const seen = new Set<string>();
  const out: Array<{ key: string; label: string; boundsLabel: string }> = [];
  for (const v of p.variants) {
    if (seen.has(v.powerRangeId)) continue;
    seen.add(v.powerRangeId);
    out.push({
      key: v.powerRangeId,
      label: v.rangeLabel || v.powerRange?.label || "—",
      boundsLabel: flatPowerBoundsLabel(v),
    });
  }
  return out;
}

export default function ProductsCatalogPage() {
  const [listView, setListView] = useState<CatalogListView>("flat");
  const [q, setQ] = useState("");
  const [qDraft, setQDraft] = useState("");
  const [familyId, setFamilyId] = useState("");
  const [baseId, setBaseId] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [coatingId, setCoatingId] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "true" | "false">(
    "all"
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [families, setFamilies] = useState<LensAttribute[]>([]);
  const [bases, setBases] = useState<LensAttribute[]>([]);
  const [materials, setMaterials] = useState<LensAttribute[]>([]);
  const [coatings, setCoatings] = useState<LensAttribute[]>([]);
  /** Flat only: name groups → axis → SKUs */
  const [expandedNameGroups, setExpandedNameGroups] = useState<Set<string>>(
    () => new Set()
  );
  const [expandedAxisGroups, setExpandedAxisGroups] = useState<Set<string>>(
    () => new Set()
  );
  const [page, setPage] = useState(1);
  const [flatVariants, setFlatVariants] = useState<LensProductVariant[]>([]);
  /** Grid: one card per catalog parent */
  const [parents, setParents] = useState<LensProduct[]>([]);
  const [gridTotal, setGridTotal] = useState(0);

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
    const common = {
      q: q || undefined,
      familyId: familyId || undefined,
      baseId: baseId || undefined,
      materialId: materialId || undefined,
      coatingId: coatingId || undefined,
      isActive: activeFilter === "all" ? null : activeFilter === "true",
    };
    try {
      if (listView === "grid") {
        const res = await fetchLensProducts({
          ...common,
          view: "grouped",
          page,
          limit: GRID_PAGE_SIZE,
        });
        setParents(res.items.filter(isProduct));
        setGridTotal(res.total ?? res.items.length);
        setFlatVariants([]);
      } else {
        const res = await fetchLensProducts({
          ...common,
          view: "flat",
          page: 1,
          limit: FLAT_FETCH_LIMIT,
        });
        setFlatVariants(res.items.filter(isVariant));
        setParents([]);
        setGridTotal(0);
      }
    } catch (err) {
      setError(errorMessage(err, "Failed to load products."));
      setFlatVariants([]);
      setParents([]);
      setGridTotal(0);
    } finally {
      setLoading(false);
    }
  }, [q, familyId, baseId, materialId, coatingId, activeFilter, listView, page]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch list on filter/view change
    void load();
  }, [load]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset expand on filter change
    setExpandedNameGroups(new Set());
    setExpandedAxisGroups(new Set());
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

  const totalFlatGroups = parentGroups.length;
  const flatGroupPages = Math.max(1, Math.ceil(totalFlatGroups / FLAT_GROUP_SIZE));
  const flatStart = (page - 1) * FLAT_GROUP_SIZE;
  const pageGroups = parentGroups.slice(flatStart, flatStart + FLAT_GROUP_SIZE);

  const gridPages = Math.max(1, Math.ceil(gridTotal / GRID_PAGE_SIZE));

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

  const empty =
    listView === "flat" ? flatVariants.length === 0 : parents.length === 0;
  const showPager =
    listView === "flat" ? totalFlatGroups > 0 : gridTotal > 0;
  const pageLabel =
    listView === "flat"
      ? `Page ${Math.min(page, flatGroupPages)} of ${flatGroupPages} groups`
      : `Page ${Math.min(page, gridPages)} of ${gridPages} parents`;
  const canPrev = page > 1;
  const canNext =
    listView === "flat" ? page < flatGroupPages : page < gridPages;

  return (
    <AdminPage
      title="Products & catalog"
      subtitle="Flat: SKU drill-down. Grid: parent card list → open matrix."
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex min-w-55 flex-1 flex-wrap items-end gap-2">
            <label className="flex min-w-50 flex-1 flex-col gap-1">
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
                }}
              >
                <LayoutList className="inline size-4" /> Flat
              </button>
              <button
                type="button"
                className={cn(
                  "rounded-lg px-3 py-1.5 text-sm font-bold",
                  listView === "grid"
                    ? "bg-(--brand-primary) text-black"
                    : "text-(--brand-text-muted)"
                )}
                onClick={() => {
                  setListView("grid");
                  setPage(1);
                }}
              >
                <LayoutGrid className="inline size-4" /> Grid
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
        ) : empty ? (
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
                                      if (k.startsWith(`${row.groupKey}::`)) {
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
                              <div>
                                <div className="font-semibold text-(--brand-text)">
                                  {row.label}
                                </div>
                                <div className="text-[11px] text-(--brand-text-muted)">
                                  {row.boundsLabel}
                                </div>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              {row.boundsLabel}
                            </TooltipContent>
                          </Tooltip>
                          <div className="mt-1 text-[11px] text-(--brand-text-muted)">
                            {row.axisCount}{" "}
                            {row.axisCount === 1 ? "axis" : "axes"} ·{" "}
                            {row.variantCount} SKU
                            {row.variantCount === 1 ? "" : "s"}
                          </div>
                        </TableCell>
                        <TableCell className="text-(--brand-text-muted)">
                          —
                        </TableCell>
                        <TableCell className="max-w-55 truncate text-sm text-(--brand-text-muted)">
                          {row.attributeSummary || "—"}
                        </TableCell>
                        <TableCell>{row.rangeLabel}</TableCell>
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
                    const axKey = axisExpandKey(row.groupKey, row.axisKey);
                    const open = expandedAxisGroups.has(axKey);
                    return (
                      <TableRow
                        key={`axis-${axKey}`}
                        className="bg-(--brand-input-bg)/20"
                      >
                        <TableCell className="w-10 pr-0 pl-6">
                          <button
                            type="button"
                            className="inline-flex size-8 items-center justify-center rounded-lg text-(--brand-text-muted) hover:bg-(--brand-input-bg) hover:text-(--brand-text)"
                            aria-expanded={open}
                            aria-label={
                              open ? "Collapse SKUs" : "Expand SKUs"
                            }
                            onClick={() => {
                              setExpandedAxisGroups((prev) => {
                                const next = new Set(prev);
                                if (next.has(axKey)) next.delete(axKey);
                                else next.add(axKey);
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
                          <span className="pl-2 font-medium text-(--brand-text)">
                            {row.label}
                          </span>
                          <span className="ml-2 text-[11px] text-(--brand-text-muted)">
                            {row.variantCount} SKU
                            {row.variantCount === 1 ? "" : "s"}
                          </span>
                        </TableCell>
                        <TableCell className="text-(--brand-text-muted)">
                          —
                        </TableCell>
                        <TableCell className="text-(--brand-text-muted)">
                          —
                        </TableCell>
                        <TableCell>{row.rangeSummary}</TableCell>
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
                    <TableRow key={v.id}>
                      <TableCell className="w-10" />
                      <TableCell className="pl-12">
                        <Link
                          href={`/inventory/products-catalog/variants/${v.id}`}
                          className="font-semibold text-(--brand-text) hover:underline"
                        >
                          {flatLeafLabel(v)}
                        </Link>
                        <div className="text-[11px] text-(--brand-text-muted)">
                          {flatPowerBoundsLabel(v)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <SkuChip sku={v.skuCode} />
                      </TableCell>
                      <TableCell className="max-w-55 truncate text-sm text-(--brand-text-muted)">
                        {v.product.attributeSummary || "—"}
                      </TableCell>
                      <TableCell>{v.rangeLabel}</TableCell>
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
          <div className="flex flex-col gap-3">
            {parents.map((p) => {
              const chips = attrChipsFromProduct(p);
              const ranges = uniqueRangesFromParent(p);
              return (
                <Link
                  key={p.id}
                  href={`/inventory/products-catalog/${p.id}`}
                  className="block rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-4 shadow-(--brand-card-shadow) transition hover:border-(--brand-primary)/50 hover:shadow-md sm:px-5 sm:py-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-extrabold tracking-tight text-(--brand-text)">
                          {p.family.code}
                          <span className="font-semibold text-(--brand-text-muted)">
                            {" "}
                            · {p.base.code}
                          </span>
                        </h3>
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
                        <span className="text-sm font-bold text-(--brand-text-muted)">
                          {p.variantCount} variant
                          {p.variantCount === 1 ? "" : "s"}
                          {ranges.length > 0
                            ? ` · ${ranges.length} range${ranges.length === 1 ? "" : "s"}`
                            : ""}
                        </span>
                      </div>
                      <p className="mt-0.5 text-sm text-(--brand-text-muted)">
                        {p.attributeSummary || "Parent product"}
                      </p>
                    </div>
                    <span className="inline-flex h-9 shrink-0 items-center rounded-xl border border-(--brand-card-border) bg-(--brand-input-bg)/40 px-3 text-sm font-bold text-(--brand-text)">
                      Open parent →
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {chips.map((chip) => (
                      <Badge
                        key={chip}
                        variant="secondary"
                        className="text-[11px]"
                      >
                        {chip}
                      </Badge>
                    ))}
                  </div>

                  {ranges.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {ranges.map((r) => (
                        <div
                          key={r.key}
                          className="min-w-38 rounded-xl border border-(--brand-card-border)/70 bg-(--brand-input-bg)/25 px-3 py-2"
                        >
                          <div className="text-sm font-semibold text-(--brand-text)">
                            {r.label}
                          </div>
                          <div className="mt-0.5 text-[11px] leading-snug text-(--brand-text-muted)">
                            {r.boundsLabel}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-(--brand-text-muted)">
                      No power ranges yet
                    </p>
                  )}
                </Link>
              );
            })}
          </div>
        )}

        {!loading && showPager ? (
          <div className="flex items-center justify-between gap-3 text-sm text-(--brand-text-muted)">
            <span>{pageLabel}</span>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-9 rounded-xl"
                disabled={!canPrev}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-9 rounded-xl"
                disabled={!canNext}
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
