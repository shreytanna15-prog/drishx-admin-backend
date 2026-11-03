"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Grid3x3,
  Loader2,
  RotateCcw,
  Save,
  Search,
} from "lucide-react";
import { AdminPage } from "@/components/admin-shell";
import { ListSkeleton, TableSkeleton } from "@/components/admin-skeletons";
import { AdminConfirmDialog } from "@/components/admin-confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminSelect } from "@/components/admin-select";
import { adminFetch, AdminApiError } from "@/app/lib/admin-api";
import {
  cellKey,
  parseQuantityInput,
  validateMatrixQuantities,
  type MatrixCell,
  type MatrixRule,
  type ProductMatrix,
} from "@/app/lib/stock-matrix";
import { cn } from "@/lib/utils";

type ProductSummary = {
  key: string;
  title: string;
  subtitle: string;
  leaves: number;
  onHand: number;
  withRule: number;
  belowThreshold: number;
};

type ListResponse = {
  products: ProductSummary[];
  total: number;
  page: number;
  pageSize: number;
  canEdit: boolean;
  options: { categories: string[]; brands: string[]; indexes: string[]; coatings: string[] };
};

type ProductResponse = {
  key: string;
  title: string;
  subtitle: string;
  matrix: ProductMatrix;
  canEdit: boolean;
};

type Draft = { min: string; target: string };

const LENS_TABS = [
  { value: "SINGLE_VISION", label: "Single Vision" },
  { value: "KRYPTOK", label: "Kryptok" },
  { value: "PROGRESSIVE", label: "Progressive" },
] as const;

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-(--brand-card-border) bg-(--brand-card) px-2 text-sm text-(--brand-text) disabled:opacity-50";

function draftFromRule(rule: MatrixRule | null): Draft {
  return rule
    ? { min: String(rule.minStock), target: String(rule.targetStock) }
    : { min: "", target: "" };
}

function isDirty(cell: MatrixCell, draft: Draft | undefined) {
  if (!draft) return false;
  const original = draftFromRule(cell.rule);
  return draft.min.trim() !== original.min || draft.target.trim() !== original.target;
}

/** Client-side validation of one cell's draft; null when valid or untouched. */
function draftError(cell: MatrixCell, draft: Draft | undefined): string | null {
  if (!draft || !isDirty(cell, draft)) return null;
  const min = parseQuantityInput(draft.min);
  if (min.error) return `Threshold: ${min.error}`;
  const target = parseQuantityInput(draft.target);
  if (target.error) return `Target: ${target.error}`;
  if (cell.rule && min.value === null && target.value === null) {
    return "Existing thresholds cannot be cleared here";
  }
  return validateMatrixQuantities(min.value, target.value);
}

export default function StockMatrixPage() {
  const [lensType, setLensType] = useState<string>("SINGLE_VISION");
  const [category, setCategory] = useState("");
  const [brand, setBrand] = useState("");
  const [index, setIndex] = useState("");
  const [coating, setCoating] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const [list, setList] = useState<ListResponse | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState("");

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [product, setProduct] = useState<ProductResponse | null>(null);
  const [productLoading, setProductLoading] = useState(false);
  const [productError, setProductError] = useState("");

  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [serverCellErrors, setServerCellErrors] = useState<Record<string, string>>({});
  const [conflicts, setConflicts] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [notice, setNotice] = useState("");
  const [pendingNav, setPendingNav] = useState<(() => void) | null>(null);

  const canEdit = product?.canEdit ?? list?.canEdit ?? false;

  // Debounce search typing.
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]);

  const listRequest = useRef(0);
  const loadList = useCallback(async () => {
    const id = ++listRequest.current;
    setListLoading(true);
    setListError("");
    try {
      const params = new URLSearchParams({ lensType, page: String(page), pageSize: "20" });
      if (category) params.set("category", category);
      if (brand) params.set("brand", brand);
      if (index) params.set("index", index);
      if (coating) params.set("coating", coating);
      if (search) params.set("search", search);
      const res = await adminFetch<ListResponse>(`/api/inventory/stock-matrix?${params}`);
      if (id !== listRequest.current) return;
      setList(res);
    } catch (err) {
      if (id !== listRequest.current) return;
      setListError(err instanceof AdminApiError ? err.message : "Failed to load products.");
    } finally {
      if (id === listRequest.current) setListLoading(false);
    }
  }, [lensType, page, category, brand, index, coating, search]);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const productRequest = useRef(0);
  const loadProduct = useCallback(
    async (key: string) => {
      const id = ++productRequest.current;
      setProductLoading(true);
      setProductError("");
      try {
        const res = await adminFetch<ProductResponse>(
          `/api/inventory/stock-matrix/product?lensType=${lensType}&key=${encodeURIComponent(key)}`
        );
        if (id !== productRequest.current) return;
        setProduct(res);
        setDrafts({});
        setServerCellErrors({});
        setConflicts(new Set());
      } catch (err) {
        if (id !== productRequest.current) return;
        setProduct(null);
        setProductError(err instanceof AdminApiError ? err.message : "Failed to load matrix.");
      } finally {
        if (id === productRequest.current) setProductLoading(false);
      }
    },
    [lensType]
  );

  const cellsById = useMemo(() => {
    const map = new Map<string, MatrixCell>();
    for (const section of product?.matrix.sections ?? []) {
      for (const list of Object.values(section.cells)) {
        for (const cell of list) map.set(cell.lensId, cell);
      }
    }
    return map;
  }, [product]);

  const dirtyIds = useMemo(
    () => [...cellsById.values()].filter((c) => isDirty(c, drafts[c.lensId])).map((c) => c.lensId),
    [cellsById, drafts]
  );
  const clientErrors = useMemo(() => {
    const out: Record<string, string> = {};
    for (const id of dirtyIds) {
      const cell = cellsById.get(id)!;
      const error = draftError(cell, drafts[id]);
      if (error) out[id] = error;
    }
    return out;
  }, [dirtyIds, cellsById, drafts]);
  const hasUnsaved = dirtyIds.length > 0;

  useEffect(() => {
    if (!hasUnsaved) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasUnsaved]);

  /** Run a navigation now, or after confirming that edits will be discarded. */
  function guard(action: () => void) {
    if (hasUnsaved) setPendingNav(() => action);
    else action();
  }

  function selectProduct(key: string) {
    guard(() => {
      setSelectedKey(key);
      setNotice("");
      setSaveError("");
      void loadProduct(key);
    });
  }

  function changeFilter(apply: () => void) {
    guard(() => {
      apply();
      setPage(1);
      setSelectedKey(null);
      setProduct(null);
      setDrafts({});
    });
  }

  function updateDraft(cell: MatrixCell, patch: Partial<Draft>) {
    setDrafts((prev) => ({
      ...prev,
      [cell.lensId]: { ...(prev[cell.lensId] ?? draftFromRule(cell.rule)), ...patch },
    }));
    setServerCellErrors((prev) => {
      if (!prev[cell.lensId]) return prev;
      const next = { ...prev };
      delete next[cell.lensId];
      return next;
    });
    setNotice("");
  }

  async function save() {
    if (!product || !hasUnsaved || Object.keys(clientErrors).length) return;
    setSaving(true);
    setSaveError("");
    setNotice("");
    try {
      const edits = dirtyIds.map((id) => {
        const cell = cellsById.get(id)!;
        const draft = drafts[id]!;
        return {
          lensId: id,
          minStock: parseQuantityInput(draft.min).value,
          targetStock: parseQuantityInput(draft.target).value,
          expectedUpdatedAt: cell.rule?.updatedAt ?? null,
        };
      });
      const res = await adminFetch<{ saved: number }>("/api/inventory/stock-matrix/rules", {
        method: "PUT",
        body: JSON.stringify({ lensType, edits }),
      });
      setNotice(
        `Saved ${res.saved} threshold/target change(s). Stock quantities were not changed.`
      );
      await loadProduct(product.key);
      void loadList();
    } catch (err) {
      if (err instanceof AdminApiError) {
        setSaveError(err.message);
        const cellErrors = err.details.cellErrors;
        if (cellErrors && typeof cellErrors === "object") {
          setServerCellErrors(cellErrors as Record<string, string>);
        }
        const ids = err.details.lensIds;
        if (err.code === "MATRIX_CONFLICT" && Array.isArray(ids)) {
          setConflicts(new Set(ids.filter((v): v is string => typeof v === "string")));
        }
      } else {
        setSaveError("Save failed.");
      }
    } finally {
      setSaving(false);
    }
  }

  const options = list?.options;
  const totalPages = list ? Math.max(1, Math.ceil(list.total / list.pageSize)) : 1;
  const errorCount = Object.keys(clientErrors).length;

  return (
    <AdminPage
      title="Stock matrix"
      subtitle="Power-wise Current / Threshold / Target. Current stock is read-only; thresholds feed Run Reorder."
    >
      {/* Lens type + filters */}
      <div className="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Lens type">
        {LENS_TABS.map((tab) => (
          <Button
            key={tab.value}
            role="tab"
            aria-selected={lensType === tab.value}
            size="sm"
            variant={lensType === tab.value ? "default" : "outline"}
            onClick={() =>
              changeFilter(() => {
                setLensType(tab.value);
                setCategory("");
                setBrand("");
                setIndex("");
                setCoating("");
              })
            }
          >
            {tab.label}
          </Button>
        ))}
        <Button variant="ghost" size="sm" asChild className="ml-auto">
          <Link href="/inventory/power-wise-stock">List view &amp; Run Reorder</Link>
        </Button>
      </div>

      <div className="mb-4 grid gap-3 rounded-xl border border-(--brand-card-border) bg-(--brand-card) p-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="space-y-1 text-xs text-(--brand-text-muted)">
          <span>Category</span>
          <AdminSelect
            value={category}
            onValueChange={(value) => {
              changeFilter(() => {
                setCategory(value);
                setBrand("");
                setIndex("");
                setCoating("");
              });
            }}
            options={[
              { value: "", label: "All categories" },
              ...(options?.categories.map((c) => ({ value: c, label: c })) ??
                []),
            ]}
            placeholder="All categories"
            size="sm"
            triggerClassName={SELECT_CLASS}
          />
        </label>
        <label className="space-y-1 text-xs text-(--brand-text-muted)">
          <span>Product / brand</span>
          <AdminSelect
            value={brand}
            onValueChange={(value) => {
              changeFilter(() => setBrand(value));
            }}
            options={[
              { value: "", label: "All products" },
              ...(options?.brands.map((b) => ({ value: b, label: b })) ?? []),
            ]}
            placeholder="All products"
            size="sm"
            triggerClassName={SELECT_CLASS}
          />
        </label>
        <label className="space-y-1 text-xs text-(--brand-text-muted)">
          <span>Index</span>
          <AdminSelect
            value={index}
            disabled={!options?.indexes.length}
            onValueChange={(value) => {
              changeFilter(() => setIndex(value));
            }}
            options={[
              {
                value: "",
                label: options?.indexes.length
                  ? "All indexes"
                  : "Not applicable",
              },
              ...(options?.indexes.map((i) => ({ value: i, label: i })) ?? []),
            ]}
            placeholder="All indexes"
            size="sm"
            triggerClassName={SELECT_CLASS}
          />
        </label>
        <label className="space-y-1 text-xs text-(--brand-text-muted)">
          <span>Coating</span>
          <AdminSelect
            value={coating}
            onValueChange={(value) => {
              changeFilter(() => setCoating(value));
            }}
            options={[
              { value: "", label: "All coatings" },
              ...(options?.coatings.map((c) => ({ value: c, label: c })) ??
                []),
            ]}
            placeholder="All coatings"
            size="sm"
            triggerClassName={SELECT_CLASS}
          />
        </label>
        <label className="space-y-1 text-xs text-(--brand-text-muted)">
          <span>Search</span>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-(--brand-text-muted)" />
            <Input
              value={searchInput}
              onChange={(e) => {
                const value = e.target.value;
                if (hasUnsaved) {
                  setPendingNav(() => () => setSearchInput(value));
                } else {
                  setSearchInput(value);
                }
              }}
              placeholder="Brand, item, coating"
              className="h-9 pl-8"
              aria-label="Search products"
            />
          </div>
        </label>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(260px,320px)_minmax(0,1fr)]">
        {/* Product list */}
        <section aria-label="Products" className="min-w-0">
          <div className="mb-2 flex items-center justify-between text-xs text-(--brand-text-muted)">
            <span>{list ? `${list.total} product(s)` : " "}</span>
            {listLoading && list ? <Loader2 className="size-3.5 animate-spin" /> : null}
          </div>
          {listError ? (
            <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
              {listError}
            </p>
          ) : listLoading && !list ? (
            <ListSkeleton rows={8} />
          ) : list && list.products.length === 0 ? (
            <div className="rounded-lg border border-dashed border-(--brand-card-border) px-4 py-10 text-center text-sm text-(--brand-text-muted)">
              No products match these filters.
            </div>
          ) : (
            <ul className={cn("space-y-2", listLoading && "opacity-60")}>
              {list?.products.map((p) => (
                <li key={p.key}>
                  <button
                    type="button"
                    onClick={() => selectProduct(p.key)}
                    aria-current={selectedKey === p.key ? "true" : undefined}
                    className={cn(
                      "w-full rounded-lg border px-3 py-2.5 text-left transition-colors",
                      selectedKey === p.key
                        ? "border-(--brand-primary) bg-(--brand-input-bg)"
                        : "border-(--brand-card-border) bg-(--brand-card) hover:bg-(--brand-input-bg)"
                    )}
                  >
                    <div className="truncate text-sm font-medium text-(--brand-text)">{p.title}</div>
                    <div className="truncate text-xs text-(--brand-text-muted)">
                      {p.subtitle || "—"}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px]">
                      <Badge variant="outline" className="font-normal">
                        {p.leaves} power(s)
                      </Badge>
                      <Badge variant="outline" className="font-normal">
                        {p.withRule}/{p.leaves} set
                      </Badge>
                      {p.belowThreshold > 0 ? (
                        <Badge
                          variant="outline"
                          className="border-red-300 bg-red-50 font-normal text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
                        >
                          {p.belowThreshold} below
                        </Badge>
                      ) : null}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {list && totalPages > 1 ? (
            <div className="mt-3 flex items-center justify-between gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || listLoading}
                onClick={() => guard(() => setPage((p) => Math.max(1, p - 1)))}
                aria-label="Previous page"
              >
                <ChevronLeft className="size-4" />
              </Button>
              <span className="text-xs text-(--brand-text-muted)">
                Page {list.page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages || listLoading}
                onClick={() => guard(() => setPage((p) => p + 1))}
                aria-label="Next page"
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          ) : null}
        </section>

        {/* Matrix */}
        <section aria-label="Power matrix" className="min-w-0">
          {!selectedKey ? (
            <div className="flex h-full min-h-60 flex-col items-center justify-center rounded-xl border border-dashed border-(--brand-card-border) px-6 py-12 text-center text-sm text-(--brand-text-muted)">
              <Grid3x3 className="mb-2 size-6" />
              Select a product to view its power matrix.
            </div>
          ) : productLoading && !product ? (
            <TableSkeleton rows={6} columns={5} />
          ) : productError ? (
            <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
              {productError}
            </p>
          ) : product ? (
            <div className={cn("space-y-4", productLoading && "opacity-60")}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-(--brand-text)">{product.title}</h2>
                  <p className="text-sm text-(--brand-text-muted)">{product.subtitle}</p>
                  <p className="mt-1 text-xs text-(--brand-text-muted)">
                    {product.matrix.totals.leaves} power(s) · {product.matrix.totals.onHand} on hand ·{" "}
                    {product.matrix.totals.withRule} with thresholds ·{" "}
                    {product.matrix.totals.belowThreshold} at/below threshold
                  </p>
                </div>
                {canEdit ? (
                  <div className="flex flex-wrap items-center gap-2">
                    {hasUnsaved ? (
                      <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
                        {dirtyIds.length} unsaved change(s)
                        {errorCount ? ` · ${errorCount} invalid` : ""}
                      </span>
                    ) : null}
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!hasUnsaved || saving}
                      onClick={() => {
                        setDrafts({});
                        setServerCellErrors({});
                        setSaveError("");
                      }}
                    >
                      <RotateCcw className="size-4" />
                      Discard
                    </Button>
                    <Button
                      size="sm"
                      disabled={!hasUnsaved || saving || errorCount > 0}
                      onClick={() => void save()}
                    >
                      {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                      Save changes
                    </Button>
                  </div>
                ) : (
                  <Badge variant="outline" className="font-normal">
                    Read-only — admins edit thresholds
                  </Badge>
                )}
              </div>

              {saveError ? (
                <div className="flex flex-wrap items-center gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
                  <AlertTriangle className="size-4 shrink-0" />
                  <span className="flex-1">{saveError}</span>
                  {conflicts.size ? (
                    <Button size="sm" variant="outline" onClick={() => void loadProduct(product.key)}>
                      Reload latest (discards edits)
                    </Button>
                  ) : null}
                </div>
              ) : null}
              {notice ? (
                <p className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100">
                  {notice}
                </p>
              ) : null}
              {product.matrix.totals.overlappingCells > 0 ? (
                <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">
                  {product.matrix.totals.overlappingCells} grid position(s) hold more than one catalog
                  row; each is shown separately.
                </p>
              ) : null}

              <MatrixLegend />

              {product.matrix.sections.map((section) => (
                <div key={section.key} className="space-y-2">
                  {section.label ? (
                    <h3 className="text-sm font-semibold text-(--brand-text)">{section.label}</h3>
                  ) : null}
                  <div className="overflow-x-auto rounded-lg border border-(--brand-card-border)">
                    <table className="w-full border-collapse text-sm">
                      <thead>
                        <tr className="bg-(--brand-input-bg)">
                          <th
                            scope="col"
                            className="sticky left-0 z-10 bg-(--brand-input-bg) px-3 py-2 text-left text-xs font-medium text-(--brand-text-muted)"
                          >
                            SPH ↓ / CYL →
                          </th>
                          {section.cylBands.map((cyl) => (
                            <th
                              key={cyl.key}
                              scope="col"
                              className="min-w-36 px-2 py-2 text-center text-xs font-medium whitespace-nowrap text-(--brand-text)"
                            >
                              {cyl.end === null && !cyl.key.startsWith("x:") ? "No CYL" : cyl.label}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {section.sphBands.map((sph) => (
                          <tr key={sph.key} className="border-t border-(--brand-card-border)">
                            <th
                              scope="row"
                              className="sticky left-0 z-10 bg-(--brand-card) px-3 py-2 text-left text-xs font-medium whitespace-nowrap text-(--brand-text)"
                            >
                              {sph.label}
                            </th>
                            {section.cylBands.map((cyl) => {
                              const cells = section.cells[cellKey(sph.key, cyl.key)] ?? [];
                              return (
                                <td key={cyl.key} className="border-l border-(--brand-card-border) p-1 align-top">
                                  {cells.length === 0 ? (
                                    <div className="py-3 text-center text-xs text-(--brand-text-muted)" aria-label="No catalog power">
                                      —
                                    </div>
                                  ) : (
                                    <div className="space-y-1">
                                      {cells.map((cell) => (
                                        <MatrixCellEditor
                                          key={cell.lensId}
                                          cell={cell}
                                          showPower={cells.length > 1}
                                          canEdit={canEdit}
                                          draft={drafts[cell.lensId]}
                                          error={clientErrors[cell.lensId] ?? serverCellErrors[cell.lensId] ?? null}
                                          conflict={conflicts.has(cell.lensId)}
                                          onChange={(patch) => updateDraft(cell, patch)}
                                        />
                                      ))}
                                    </div>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      </div>

      <AdminConfirmDialog
        open={pendingNav !== null}
        title="Discard unsaved changes?"
        description={`You have ${dirtyIds.length} unsaved threshold/target change(s) on this matrix.`}
        confirmLabel="Discard and continue"
        cancelLabel="Keep editing"
        tone="destructive"
        onCancel={() => setPendingNav(null)}
        onConfirm={() => {
          const action = pendingNav;
          setPendingNav(null);
          setDrafts({});
          setServerCellErrors({});
          action?.();
        }}
      />
    </AdminPage>
  );
}

function MatrixLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-(--brand-text-muted)">
      <span>
        Cell: <strong className="text-(--brand-text)">Current</strong> (on hand, read-only) /
        Threshold / Target
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="size-3 rounded-sm border border-red-300 bg-red-100 dark:border-red-800 dark:bg-red-950" />
        Available at/below threshold — Run Reorder raises it
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="size-3 rounded-sm border border-dashed border-(--brand-card-border)" />
        No threshold set
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="size-3 rounded-sm border border-(--brand-card-border) bg-(--brand-input-bg)" />
        Paused (excluded from Run Reorder)
      </span>
      <span>New thresholds are included in Run Reorder.</span>
    </div>
  );
}

function MatrixCellEditor({
  cell,
  showPower,
  canEdit,
  draft,
  error,
  conflict,
  onChange,
}: {
  cell: MatrixCell;
  showPower: boolean;
  canEdit: boolean;
  draft: Draft | undefined;
  error: string | null;
  conflict: boolean;
  onChange: (patch: Partial<Draft>) => void;
}) {
  const value = draft ?? draftFromRule(cell.rule);
  const dirty = isDirty(cell, draft);
  const errorId = `err-${cell.lensId}`;
  const stockTitle = [
    cell.powerLabel,
    `On hand ${cell.onHand}`,
    cell.reserved ? `Reserved ${cell.reserved}` : null,
    `Available ${cell.available}`,
    cell.onOrder ? `On open PO ${cell.onOrder}` : null,
    cell.openPurchaseOrder ? `Open ${cell.openPurchaseOrder.publicId}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className={cn(
        "rounded-md border px-2 py-1.5",
        cell.state === "BELOW_THRESHOLD" &&
          "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/60",
        cell.state === "OK" && "border-(--brand-card-border) bg-(--brand-card)",
        cell.state === "NO_RULE" && "border-dashed border-(--brand-card-border)",
        cell.state === "INACTIVE" && "border-(--brand-card-border) bg-(--brand-input-bg)",
        dirty && "ring-2 ring-amber-400",
        (error || conflict) && "ring-2 ring-red-500"
      )}
      title={stockTitle}
    >
      {showPower ? (
        <div className="mb-1 truncate text-[10px] text-(--brand-text-muted)">{cell.powerLabel}</div>
      ) : null}
      <div className="flex items-center justify-center gap-1">
        <span
          className={cn(
            "min-w-7 rounded bg-(--brand-input-bg) px-1 py-0.5 text-center text-xs font-semibold tabular-nums",
            cell.state === "BELOW_THRESHOLD"
              ? "text-red-700 dark:text-red-300"
              : "text-(--brand-text-muted)"
          )}
          aria-label={`Current stock ${cell.onHand}`}
        >
          {cell.onHand}
        </span>
        <span className="text-(--brand-text-muted)">/</span>
        {canEdit ? (
          <>
            <input
              inputMode="numeric"
              value={value.min}
              onChange={(e) => onChange({ min: e.target.value })}
              placeholder="–"
              aria-label={`Threshold for ${cell.powerLabel}`}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? errorId : undefined}
              className="h-6 w-10 rounded border border-(--brand-card-border) bg-(--brand-card) px-1 text-center text-xs tabular-nums text-(--brand-text) focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
            />
            <span className="text-(--brand-text-muted)">/</span>
            <input
              inputMode="numeric"
              value={value.target}
              onChange={(e) => onChange({ target: e.target.value })}
              placeholder="–"
              aria-label={`Target for ${cell.powerLabel}`}
              aria-invalid={Boolean(error)}
              aria-describedby={error ? errorId : undefined}
              className="h-6 w-10 rounded border border-(--brand-card-border) bg-(--brand-card) px-1 text-center text-xs tabular-nums text-(--brand-text) focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
            />
          </>
        ) : (
          <span className="text-xs tabular-nums text-(--brand-text)">
            {cell.rule ? `${cell.rule.minStock} / ${cell.rule.targetStock}` : "– / –"}
          </span>
        )}
      </div>
      {cell.state === "INACTIVE" ? (
        <div className="mt-0.5 text-center text-[10px] text-(--brand-text-muted)">Paused</div>
      ) : null}
      {cell.openPurchaseOrder ? (
        <div className="mt-0.5 truncate text-center text-[10px] text-sky-700 dark:text-sky-300">
          {cell.openPurchaseOrder.publicId} +{cell.onOrder}
        </div>
      ) : null}
      {error || conflict ? (
        <p id={errorId} role="alert" className="mt-1 text-center text-[10px] leading-tight text-red-700 dark:text-red-300">
          {error ?? "Changed by someone else"}
        </p>
      ) : null}
    </div>
  );
}
