"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ChevronRight,
  GitMerge,
  Package,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { AdminPage } from "@/components/admin-shell";
import { ListSkeleton, TableSkeleton } from "@/components/admin-skeletons";
import { CatalogProductLineModal } from "@/components/catalog-product-line-modal";
import { CoatingFilterLabelModal } from "@/components/coating-filter-label-modal";
import { InfiniteScrollSentinel } from "@/components/infinite-scroll-sentinel";
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
  LENS_CATEGORIES,
  type AdminCatalogProductLine,
  type AdminCoatingFilterLabel,
  type LensCatalogItem,
  type LensCategory,
  type LensCategoryType,
  type StockLens,
  deleteAdminCatalogLine,
  deleteAdminCoatingFilter,
  fetchAdminCatalogLines,
  fetchAdminCoatingFilters,
  fetchLensCatalogItems,
  fetchStockLensesPage,
  formatPower,
  mergeAdminCoatingFilters,
  stockTone,
  syncAdminCoatingFilters,
  updateAdminCatalogLine,
  updateAdminCoatingFilter,
} from "@/app/lib/admin-lenses";
import {
  LIST_PAGE_SIZE,
  LIST_PRELOAD_AT,
  useInfiniteScrollSentinel,
  useProgressiveList,
} from "@/hooks/use-progressive-list";
import { cn } from "@/lib/utils";

type ViewLevel = "categories" | "items" | "products";
type ItemsTab = "lines" | "coatings";

type DisplayProductLine =
  | {
      kind: "managed";
      name: string;
      productCount: number;
      line: AdminCatalogProductLine;
    }
  | {
      kind: "dynamic";
      name: string;
      productCount: number;
    };

function StockOverviewContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // `?type=...&item=...` restores the view after returning from /new.
  const [initialCategory] = useState<LensCategory | null>(() => {
    const type = searchParams.get("type");
    return LENS_CATEGORIES.find((cat) => cat.type === type) ?? null;
  });
  const [initialItemName] = useState<string | null>(() => {
    const item = searchParams.get("item")?.trim();
    return item ? item : null;
  });

  const [view, setView] = useState<ViewLevel>(() =>
    initialCategory ? (initialItemName ? "products" : "items") : "categories"
  );
  const [category, setCategory] = useState<LensCategory | null>(
    initialCategory
  );
  const [catalogItem, setCatalogItem] = useState<LensCatalogItem | null>(() =>
    initialCategory && initialItemName
      ? { name: initialItemName, productCount: 0 }
      : null
  );

  const [managedLines, setManagedLines] = useState<AdminCatalogProductLine[]>(
    []
  );
  const [dynamicItems, setDynamicItems] = useState<LensCatalogItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemsError, setItemsError] = useState("");
  const [itemQuery, setItemQuery] = useState("");
  const [lineModalOpen, setLineModalOpen] = useState(false);
  const [editingLine, setEditingLine] =
    useState<AdminCatalogProductLine | null>(null);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);

  const [itemsTab, setItemsTab] = useState<ItemsTab>("lines");
  const [coatingFilters, setCoatingFilters] = useState<AdminCoatingFilterLabel[]>(
    []
  );
  const [coatingsLoading, setCoatingsLoading] = useState(false);
  const [coatingsError, setCoatingsError] = useState("");
  const [coatingQuery, setCoatingQuery] = useState("");
  const [coatingModalOpen, setCoatingModalOpen] = useState(false);
  const [editingCoating, setEditingCoating] =
    useState<AdminCoatingFilterLabel | null>(null);
  const [coatingBusyId, setCoatingBusyId] = useState<string | null>(null);

  const [products, setProducts] = useState<StockLens[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsLoadingMore, setProductsLoadingMore] = useState(false);
  const [productsError, setProductsError] = useState("");
  const [productQuery, setProductQuery] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [totalSkus, setTotalSkus] = useState(0);
  const productsLoadingMoreRef = useRef(false);

  const loadItems = useCallback(async (type: LensCategoryType) => {
    setItemsLoading(true);
    setItemsError("");
    try {
      const [managedRes, catalogRes] = await Promise.all([
        fetchAdminCatalogLines(type, { includeInactive: true }),
        fetchLensCatalogItems(type),
      ]);

      const managed = Array.isArray(managedRes.items) ? managedRes.items : [];
      const catalog = Array.isArray(catalogRes.items) ? catalogRes.items : [];
      const managedNames = new Set(
        managed.map((line) => line.name.toLowerCase())
      );

      setManagedLines(managed);
      setDynamicItems(
        catalog.filter(
          (item) =>
            item.dynamic && !managedNames.has(item.name.trim().toLowerCase())
        )
      );
    } catch (err) {
      setItemsError(
        err instanceof AdminApiError
          ? err.message
          : "Failed to load product lines."
      );
      setManagedLines([]);
      setDynamicItems([]);
    } finally {
      setItemsLoading(false);
    }
  }, []);

  const loadCoatingFilters = useCallback(async (type: LensCategoryType) => {
    setCoatingsLoading(true);
    setCoatingsError("");
    try {
      const res = await fetchAdminCoatingFilters(type, {
        includeInactive: true,
      });
      setCoatingFilters(Array.isArray(res.items) ? res.items : []);
    } catch (err) {
      setCoatingsError(
        err instanceof AdminApiError
          ? err.message
          : "Failed to load coating filters."
      );
      setCoatingFilters([]);
    } finally {
      setCoatingsLoading(false);
    }
  }, []);

  const loadProducts = useCallback(
    async (
      type: LensCategoryType,
      itemName: string,
      nextPage: number,
      append: boolean,
      search: string
    ) => {
      if (append) setProductsLoadingMore(true);
      else setProductsLoading(true);
      setProductsError("");

      try {
        const data = await fetchStockLensesPage({
          type,
          item: itemName,
          page: nextPage,
          limit: LIST_PAGE_SIZE,
          search,
        });
        const list = Array.isArray(data.items) ? data.items : [];
        setProducts((prev) => (append ? [...prev, ...list] : list));
        setPage(data.page ?? nextPage);
        setHasMore(Boolean(data.hasMore));
        setTotalSkus(data.total ?? list.length);
      } catch (err) {
        if (!append) setProducts([]);
        setProductsError(
          err instanceof AdminApiError
            ? err.message
            : "Failed to load products."
        );
      } finally {
        setProductsLoading(false);
        setProductsLoadingMore(false);
        productsLoadingMoreRef.current = false;
      }
    },
    []
  );

  useEffect(() => {
    if (view === "items" && category) {
      void loadItems(category.type);
    }
  }, [view, category, loadItems]);

  useEffect(() => {
    if (view === "items" && category && itemsTab === "coatings") {
      void loadCoatingFilters(category.type);
    }
  }, [view, category, itemsTab, loadCoatingFilters]);

  useEffect(() => {
    if (view !== "products" || !category || !catalogItem) return;

    const timer = window.setTimeout(() => {
      void loadProducts(category.type, catalogItem.name, 1, false, productQuery);
    }, productQuery ? 300 : 0);

    return () => window.clearTimeout(timer);
  }, [productQuery, view, category, catalogItem, loadProducts]);

  const displayLines = useMemo((): DisplayProductLine[] => {
    const managed: DisplayProductLine[] = managedLines.map((line) => ({
      kind: "managed",
      name: line.name,
      productCount: line.productCount,
      line,
    }));
    const dynamic: DisplayProductLine[] = dynamicItems.map((item) => ({
      kind: "dynamic",
      name: item.name,
      productCount: item.productCount,
    }));
    return [...managed, ...dynamic];
  }, [managedLines, dynamicItems]);

  const filteredItems = useMemo(() => {
    const q = itemQuery.trim().toLowerCase();
    if (!q) return displayLines;
    return displayLines.filter((item) => item.name.toLowerCase().includes(q));
  }, [displayLines, itemQuery]);

  const filteredCoatings = useMemo(() => {
    const q = coatingQuery.trim().toLowerCase();
    if (!q) return coatingFilters;
    return coatingFilters.filter(
      (label) =>
        label.name.toLowerCase().includes(q) ||
        (label.description ?? "").toLowerCase().includes(q)
    );
  }, [coatingFilters, coatingQuery]);

  const {
    visibleItems: visibleCatalogItems,
    hasMore: catalogHasMore,
    sentinelIndex: catalogSentinelIndex,
    setSentinelNode: setCatalogSentinel,
  } = useProgressiveList(filteredItems);

  const totalQuantity = useMemo(
    () => products.reduce((sum, product) => sum + (product.quantity || 0), 0),
    [products]
  );

  const loadNextProductsPage = useCallback(() => {
    if (!category || !catalogItem) return;
    if (!hasMore || productsLoading || productsLoadingMoreRef.current) return;
    productsLoadingMoreRef.current = true;
    void loadProducts(
      category.type,
      catalogItem.name,
      page + 1,
      true,
      productQuery
    );
  }, [
    category,
    catalogItem,
    hasMore,
    productsLoading,
    page,
    productQuery,
    loadProducts,
  ]);

  const productSentinelIndex = useMemo(() => {
    if (products.length === 0) return -1;
    const fromEnd = LIST_PAGE_SIZE - LIST_PRELOAD_AT;
    return Math.min(
      products.length - 1,
      Math.max(LIST_PRELOAD_AT, products.length - fromEnd)
    );
  }, [products.length]);

  const { setSentinelNode: setProductSentinel } = useInfiniteScrollSentinel({
    enabled: hasMore && !productsLoading && products.length > 0,
    onLoadMore: loadNextProductsPage,
    deps: [products.length, page, hasMore, productsLoadingMore],
  });

  function openCategory(next: LensCategory) {
    setCategory(next);
    setCatalogItem(null);
    setItemQuery("");
    setCoatingQuery("");
    setItemsTab("lines");
    setManagedLines([]);
    setDynamicItems([]);
    setCoatingFilters([]);
    setView("items");
  }

  function openItem(name: string, productCount: number) {
    setCatalogItem({ name, productCount });
    setProductQuery("");
    setProducts([]);
    setPage(1);
    setHasMore(false);
    setTotalSkus(0);
    setView("products");
  }

  function goToCategories() {
    setView("categories");
    setCategory(null);
    setCatalogItem(null);
    setItemsTab("lines");
  }

  function goToItems() {
    setView("items");
    setCatalogItem(null);
    setProducts([]);
  }

  function openCreateLineModal() {
    setEditingLine(null);
    setLineModalOpen(true);
  }

  function openCreateCoatingModal() {
    setEditingCoating(null);
    setCoatingModalOpen(true);
  }

  function openAddProductPage(params: {
    lensType: LensCategoryType;
    defaultItem?: string | null;
  }) {
    const query = new URLSearchParams({ type: params.lensType });
    if (params.defaultItem) query.set("item", params.defaultItem);
    router.push(`/inventory/stock-overview/new?${query.toString()}`);
  }

  function openEditLineModal(line: AdminCatalogProductLine) {
    setEditingLine(line);
    setLineModalOpen(true);
  }

  function openEditCoatingModal(label: AdminCoatingFilterLabel) {
    setEditingCoating(label);
    setCoatingModalOpen(true);
  }

  async function handleToggleActive(line: AdminCatalogProductLine) {
    setActionBusyId(line.id);
    try {
      await updateAdminCatalogLine(line.id, { isActive: !line.isActive });
      if (category) void loadItems(category.type);
    } catch (err) {
      window.alert(
        err instanceof AdminApiError
          ? err.message
          : "Failed to update product line."
      );
    } finally {
      setActionBusyId(null);
    }
  }

  async function handleDeleteLine(line: AdminCatalogProductLine) {
    const canHardDelete = !line.isSystem && line.productCount === 0;

    if (canHardDelete) {
      const hard = window.confirm(
        `Permanently delete product line "${line.name}"? This cannot be undone.\n\nClick Cancel to only deactivate instead.`
      );
      if (hard) {
        setActionBusyId(line.id);
        try {
          await deleteAdminCatalogLine(line.id, true);
          if (category) void loadItems(category.type);
        } catch (err) {
          window.alert(
            err instanceof AdminApiError
              ? err.message
              : "Failed to delete product line."
          );
        } finally {
          setActionBusyId(null);
        }
        return;
      }
    }

    if (!line.isActive) {
      window.alert(
        line.isSystem
          ? "System lines cannot be permanently deleted. Activate them again from Edit if needed."
          : "This line is already inactive. Permanent delete is only allowed when it has no stock."
      );
      return;
    }

    const ok = window.confirm(
      `Deactivate product line "${line.name}"? It will hide from shop catalog lists.`
    );
    if (!ok) return;

    setActionBusyId(line.id);
    try {
      await deleteAdminCatalogLine(line.id, false);
      if (category) void loadItems(category.type);
    } catch (err) {
      window.alert(
        err instanceof AdminApiError
          ? err.message
          : "Failed to deactivate product line."
      );
    } finally {
      setActionBusyId(null);
    }
  }

  async function handleToggleCoatingActive(label: AdminCoatingFilterLabel) {
    setCoatingBusyId(label.id);
    try {
      await updateAdminCoatingFilter(label.id, { isActive: !label.isActive });
      if (category) void loadCoatingFilters(category.type);
    } catch (err) {
      window.alert(
        err instanceof AdminApiError
          ? err.message
          : "Failed to update coating filter."
      );
    } finally {
      setCoatingBusyId(null);
    }
  }

  async function handleDeleteCoating(label: AdminCoatingFilterLabel) {
    const canHardDelete = !label.isSystem && label.productCount === 0;

    if (canHardDelete) {
      const hard = window.confirm(
        `Permanently delete coating filter "${label.name}"? This cannot be undone.\n\nClick Cancel to only deactivate instead.`
      );
      if (hard) {
        setCoatingBusyId(label.id);
        try {
          await deleteAdminCoatingFilter(label.id, true);
          if (category) void loadCoatingFilters(category.type);
        } catch (err) {
          window.alert(
            err instanceof AdminApiError
              ? err.message
              : "Failed to delete coating filter."
          );
        } finally {
          setCoatingBusyId(null);
        }
        return;
      }
    }

    if (!label.isActive) {
      window.alert(
        label.isSystem
          ? "System filters cannot be permanently deleted. Activate them again from Edit if needed."
          : "This filter is already inactive. Permanent delete is only allowed when it has no matching products."
      );
      return;
    }

    const ok = window.confirm(
      `Deactivate coating filter "${label.name}"? It will hide from shop and wholesale chips.`
    );
    if (!ok) return;

    setCoatingBusyId(label.id);
    try {
      await deleteAdminCoatingFilter(label.id, false);
      if (category) void loadCoatingFilters(category.type);
    } catch (err) {
      window.alert(
        err instanceof AdminApiError
          ? err.message
          : "Failed to deactivate coating filter."
      );
    } finally {
      setCoatingBusyId(null);
    }
  }

  async function handleMergeCoating(source: AdminCoatingFilterLabel) {
    const targets = coatingFilters.filter((label) => label.id !== source.id);
    if (targets.length === 0) {
      window.alert("No other coating filters to merge into.");
      return;
    }

    const choices = targets
      .map((label, index) => `${index + 1}. ${label.name}`)
      .join("\n");
    const answer = window.prompt(
      `Merge "${source.name}" into which filter?\nEnter the number:\n\n${choices}`
    );
    if (!answer) return;
    const index = Number(answer.trim()) - 1;
    if (!Number.isInteger(index) || index < 0 || index >= targets.length) {
      window.alert("Invalid selection.");
      return;
    }

    const target = targets[index];
    const ok = window.confirm(
      `Merge "${source.name}" into "${target.name}"?\nAll matching product coatings will be rewritten to "${target.name}".`
    );
    if (!ok) return;

    setCoatingBusyId(source.id);
    try {
      const result = await mergeAdminCoatingFilters(source.id, target.id);
      window.alert(
        `Merged. ${result.rewrittenCount} product${result.rewrittenCount === 1 ? "" : "s"} updated.`
      );
      if (category) void loadCoatingFilters(category.type);
    } catch (err) {
      window.alert(
        err instanceof AdminApiError
          ? err.message
          : "Failed to merge coating filters."
      );
    } finally {
      setCoatingBusyId(null);
    }
  }

  async function handleSyncCoatings() {
    if (!category) return;
    setCoatingsLoading(true);
    try {
      const result = await syncAdminCoatingFilters(category.type);
      await loadCoatingFilters(category.type);
      window.alert(
        `Sync complete. ${result.created} new filter${result.created === 1 ? "" : "s"} added, ${result.skipped} already present.`
      );
    } catch (err) {
      window.alert(
        err instanceof AdminApiError
          ? err.message
          : "Failed to sync coating filters."
      );
      setCoatingsLoading(false);
    }
  }

  return (
    <AdminPage title="Stock Overview" subtitle="Category-wise product stock">
      <div className="mb-5 flex flex-col gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-(--brand-text)">
            Stock Overview
          </h1>
          <p className="mt-1 text-sm text-(--brand-text-muted)">
            Browse stock by category, then product line, with available
            quantities. Manage product lines and coating filter chips as an
            admin.
          </p>
        </div>

        <nav
          aria-label="Stock breadcrumb"
          className="flex flex-wrap items-center gap-1 text-sm text-(--brand-text-muted)"
        >
          <button
            type="button"
            onClick={goToCategories}
            className={cn(
              "rounded-md px-1.5 py-0.5 font-semibold transition hover:text-(--brand-text)",
              view === "categories"
                ? "text-(--brand-primary)"
                : "text-(--brand-link)"
            )}
          >
            Categories
          </button>
          {category ? (
            <>
              <ChevronRight className="size-3.5 opacity-60" />
              <button
                type="button"
                onClick={goToItems}
                className={cn(
                  "rounded-md px-1.5 py-0.5 font-semibold transition hover:text-(--brand-text)",
                  view === "items"
                    ? "text-(--brand-primary)"
                    : "text-(--brand-link)"
                )}
              >
                {category.label}
              </button>
            </>
          ) : null}
          {catalogItem ? (
            <>
              <ChevronRight className="size-3.5 opacity-60" />
              <span className="px-1.5 py-0.5 font-semibold text-(--brand-primary)">
                {catalogItem.name}
              </span>
            </>
          ) : null}
        </nav>
      </div>

      {view === "categories" ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {LENS_CATEGORIES.map((cat) => (
            <button
              key={cat.type}
              type="button"
              onClick={() => openCategory(cat)}
              className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-5 text-left shadow-(--brand-card-shadow) transition hover:border-(--brand-primary) hover:bg-[rgba(240,161,50,0.06)]"
            >
              <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-[rgba(240,161,50,0.14)] text-(--brand-primary)">
                <Package className="size-5" />
              </div>
              <h2 className="text-lg font-extrabold text-(--brand-text)">
                {cat.label}
              </h2>
              <p className="mt-1 text-sm text-(--brand-text-muted)">
                {cat.description}
              </p>
            </button>
          ))}
        </div>
      ) : null}

      {view === "items" && category ? (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setItemsTab("lines")}
              className={cn(
                "rounded-xl px-3.5 py-2 text-sm font-bold transition",
                itemsTab === "lines"
                  ? "bg-(--brand-primary) text-(--brand-primary-text)"
                  : "border border-(--brand-card-border) bg-(--brand-card) text-(--brand-text-muted) hover:text-(--brand-text)"
              )}
            >
              Product lines
            </button>
            <button
              type="button"
              onClick={() => setItemsTab("coatings")}
              className={cn(
                "rounded-xl px-3.5 py-2 text-sm font-bold transition",
                itemsTab === "coatings"
                  ? "bg-(--brand-primary) text-(--brand-primary-text)"
                  : "border border-(--brand-card-border) bg-(--brand-card) text-(--brand-text-muted) hover:text-(--brand-text)"
              )}
            >
              Coating filters
            </button>
          </div>

          {itemsTab === "lines" ? (
            <>
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <p className="text-sm text-(--brand-text-muted)">
                  {itemsLoading
                    ? "Loading product lines\u2026"
                    : `${filteredItems.length} product line${filteredItems.length === 1 ? "" : "s"}`}
                </p>
                <div className="flex w-full flex-col gap-2 sm:max-w-xl sm:flex-row sm:items-center">
                  <Input
                    value={itemQuery}
                    onChange={(e) => setItemQuery(e.target.value)}
                    placeholder={"Search product lines\u2026"}
                    className="h-10 border-(--brand-input-border) bg-(--brand-input-bg) text-(--brand-text) placeholder:text-(--brand-placeholder)"
                  />
                  <Button
                    type="button"
                    onClick={openCreateLineModal}
                    className="h-10 shrink-0 bg-(--brand-primary) font-bold text-(--brand-primary-text)"
                  >
                    <Plus className="size-4" />
                    Add product line
                  </Button>
                  <Button
                    type="button"
                    onClick={() =>
                      openAddProductPage({
                        lensType: category.type,
                        defaultItem: null,
                      })
                    }
                    className="h-10 shrink-0 bg-(--brand-primary) font-bold text-(--brand-primary-text)"
                    title="Add SKU directly under a product line"
                  >
                    <Plus className="size-4" />
                    Add product
                  </Button>
                </div>
              </div>

              {itemsError ? (
                <div className="auth-alert-error mb-4" role="alert">
                  {itemsError}
                </div>
              ) : null}

              {itemsLoading ? (
                <ListSkeleton compact rows={6} />
              ) : filteredItems.length === 0 ? (
                <div className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) px-4 py-16 text-center text-sm text-(--brand-text-muted)">
                  {itemQuery.trim()
                    ? "No product lines match your search."
                    : "No product lines found in this category."}
                </div>
              ) : (
                <>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {visibleCatalogItems.map((item, index) => {
                      const managed =
                        item.kind === "managed" ? item.line : null;
                      const inactive = managed ? !managed.isActive : false;

                      return (
                        <div
                          key={`${item.kind}-${item.name}`}
                          className={cn(
                            "relative flex flex-col gap-3 rounded-2xl border border-(--brand-card-border) bg-(--brand-card) p-4 transition",
                            inactive && "opacity-70"
                          )}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              openItem(item.name, item.productCount)
                            }
                            className="flex flex-1 items-start justify-between gap-3 text-left hover:opacity-90"
                          >
                            <div>
                              <h3 className="font-extrabold text-(--brand-text)">
                                {item.name}
                              </h3>
                              <p className="mt-1 text-xs text-(--brand-text-muted)">
                                {item.productCount} SKU
                                {item.productCount === 1 ? "" : "s"}
                                {item.kind === "dynamic"
                                  ? " \u00b7 dynamic"
                                  : ""}
                                {managed?.isSystem ? " \u00b7 system" : ""}
                                {inactive ? " \u00b7 inactive" : ""}
                              </p>
                              {managed?.description ? (
                                <p className="mt-1 line-clamp-2 text-xs text-(--brand-text-muted)">
                                  {managed.description}
                                </p>
                              ) : null}
                            </div>
                            <ChevronRight className="mt-1 size-4 shrink-0 text-(--brand-text-muted)" />
                          </button>

                          {managed ? (
                            <div className="flex flex-wrap gap-2 border-t border-(--brand-card-border) pt-3">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={actionBusyId === managed.id}
                                onClick={() => openEditLineModal(managed)}
                                className="h-8 rounded-lg text-xs font-semibold"
                              >
                                <Pencil className="size-3.5" />
                                Edit
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={actionBusyId === managed.id}
                                onClick={() => void handleToggleActive(managed)}
                                className="h-8 rounded-lg text-xs font-semibold"
                              >
                                <Power className="size-3.5" />
                                {managed.isActive ? "Deactivate" : "Activate"}
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={actionBusyId === managed.id}
                                onClick={() => void handleDeleteLine(managed)}
                                className="h-8 rounded-lg text-xs font-semibold text-(--brand-danger)"
                              >
                                <Trash2 className="size-3.5" />
                                {managed.isSystem || managed.productCount > 0
                                  ? "Hide"
                                  : "Delete"}
                              </Button>
                            </div>
                          ) : (
                            <p className="border-t border-(--brand-card-border) pt-3 text-xs text-(--brand-text-muted)">
                              Dynamic line from unmatched stock rows. Create a
                              product line with this name to manage it.
                            </p>
                          )}

                          {index === catalogSentinelIndex && catalogHasMore ? (
                            <InfiniteScrollSentinel
                              active
                              setSentinelNode={setCatalogSentinel}
                            />
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                  {catalogHasMore &&
                  visibleCatalogItems.length <= catalogSentinelIndex ? (
                    <InfiniteScrollSentinel
                      active
                      setSentinelNode={setCatalogSentinel}
                    />
                  ) : null}
                </>
              )}

              <CatalogProductLineModal
                open={lineModalOpen}
                onOpenChange={setLineModalOpen}
                lensType={category.type}
                editing={editingLine}
                onSaved={() => {
                  void loadItems(category.type);
                }}
              />
            </>
          ) : (
            <>
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <p className="text-sm text-(--brand-text-muted)">
                  {coatingsLoading
                    ? "Loading coating filters\u2026"
                    : `${filteredCoatings.length} coating filter${filteredCoatings.length === 1 ? "" : "s"}`}
                </p>
                <div className="flex w-full flex-col gap-2 sm:max-w-2xl sm:flex-row sm:items-center">
                  <Input
                    value={coatingQuery}
                    onChange={(e) => setCoatingQuery(e.target.value)}
                    placeholder={"Search coating filters\u2026"}
                    className="h-10 border-(--brand-input-border) bg-(--brand-input-bg) text-(--brand-text) placeholder:text-(--brand-placeholder)"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void handleSyncCoatings()}
                    disabled={coatingsLoading}
                    className="h-10 shrink-0 border-(--brand-input-border) font-bold"
                  >
                    <RefreshCw className="size-4" />
                    Sync from products
                  </Button>
                  <Button
                    type="button"
                    onClick={openCreateCoatingModal}
                    className="h-10 shrink-0 bg-(--brand-primary) font-bold text-(--brand-primary-text)"
                  >
                    <Plus className="size-4" />
                    Add filter
                  </Button>
                </div>
              </div>

              {coatingsError ? (
                <div className="auth-alert-error mb-4" role="alert">
                  {coatingsError}
                </div>
              ) : null}

              {coatingsLoading ? (
                <ListSkeleton compact rows={6} />
              ) : filteredCoatings.length === 0 ? (
                <div className="rounded-2xl border border-(--brand-card-border) bg-(--brand-card) px-4 py-16 text-center text-sm text-(--brand-text-muted)">
                  {coatingQuery.trim()
                    ? "No coating filters match your search."
                    : "No coating filters yet. Sync from products or add one."}
                </div>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-(--brand-card-border) bg-(--brand-card)">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-(--brand-card-border) hover:bg-transparent">
                        <TableHead className="text-(--brand-text-muted)">
                          Name
                        </TableHead>
                        <TableHead className="text-(--brand-text-muted)">
                          Sort
                        </TableHead>
                        <TableHead className="text-(--brand-text-muted)">
                          Products
                        </TableHead>
                        <TableHead className="text-(--brand-text-muted)">
                          Status
                        </TableHead>
                        <TableHead className="text-right text-(--brand-text-muted)">
                          Actions
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredCoatings.map((label) => (
                        <TableRow
                          key={label.id}
                          className={cn(
                            "border-(--brand-card-border)",
                            !label.isActive && "opacity-70"
                          )}
                        >
                          <TableCell>
                            <div className="space-y-0.5">
                              <p className="font-bold text-(--brand-text)">
                                {label.name}
                              </p>
                              <p className="text-xs text-(--brand-text-muted)">
                                {label.isSystem ? "system" : "custom"}
                                {label.description
                                  ? ` \u00b7 ${label.description}`
                                  : ""}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell className="text-(--brand-text)">
                            {label.sortOrder}
                          </TableCell>
                          <TableCell className="text-(--brand-text)">
                            {label.productCount}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={cn(
                                "font-semibold",
                                label.isActive
                                  ? "border-(--brand-success-border) bg-(--brand-success-bg) text-(--brand-success)"
                                  : "border-(--brand-danger-border) bg-(--brand-danger-bg) text-(--brand-danger)"
                              )}
                            >
                              {label.isActive ? "Active" : "Inactive"}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap justify-end gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={coatingBusyId === label.id}
                                onClick={() => openEditCoatingModal(label)}
                                className="h-8 rounded-lg text-xs font-semibold"
                              >
                                <Pencil className="size-3.5" />
                                Edit
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={coatingBusyId === label.id}
                                onClick={() =>
                                  void handleToggleCoatingActive(label)
                                }
                                className="h-8 rounded-lg text-xs font-semibold"
                              >
                                <Power className="size-3.5" />
                                {label.isActive ? "Deactivate" : "Activate"}
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={coatingBusyId === label.id}
                                onClick={() => void handleMergeCoating(label)}
                                className="h-8 rounded-lg text-xs font-semibold"
                              >
                                <GitMerge className="size-3.5" />
                                Merge
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={coatingBusyId === label.id}
                                onClick={() => void handleDeleteCoating(label)}
                                className="h-8 rounded-lg text-xs font-semibold text-(--brand-danger)"
                              >
                                <Trash2 className="size-3.5" />
                                {label.isSystem || label.productCount > 0
                                  ? "Hide"
                                  : "Delete"}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              <CoatingFilterLabelModal
                open={coatingModalOpen}
                onOpenChange={setCoatingModalOpen}
                lensType={category.type}
                editing={editingCoating}
                onSaved={() => {
                  void loadCoatingFilters(category.type);
                }}
              />
            </>
          )}
        </>
      ) : null}

      {view === "products" && category && catalogItem ? (
        <>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="text-sm text-(--brand-text-muted)">
              {productsLoading ? (
                "Loading products\u2026"
              ) : (
                <>
                  {totalSkus} SKU{totalSkus === 1 ? "" : "s"}
                  {products.length > 0 ? (
                    <>
                      {" "}
                      {"\u00b7"} loaded qty sum{" "}
                      <span className="font-semibold text-(--brand-text)">
                        {totalQuantity}
                      </span>
                    </>
                  ) : null}
                </>
              )}
            </div>
            <div className="flex w-full flex-col gap-2 sm:max-w-md sm:flex-row sm:items-center sm:justify-end">
              <Input
                value={productQuery}
                onChange={(e) => setProductQuery(e.target.value)}
                placeholder={"Search power, brand, coating\u2026"}
                className="h-10 flex-1 border-(--brand-input-border) bg-(--brand-input-bg) text-(--brand-text) placeholder:text-(--brand-placeholder)"
              />
              <Button
                type="button"
                onClick={() =>
                  openAddProductPage({
                    lensType: category.type,
                    defaultItem: catalogItem.name,
                  })
                }
                className="h-10 shrink-0 bg-(--brand-primary) font-bold text-(--brand-primary-text)"
              >
                <Plus className="size-4" />
                Add product
              </Button>
            </div>
          </div>

          {productsError ? (
            <div className="auth-alert-error mb-4" role="alert">
              {productsError}
            </div>
          ) : null}

          {productsLoading ? (
            <TableSkeleton compact columns={7} rows={8} />
          ) : (
          <div className="overflow-hidden rounded-2xl border border-(--brand-card-border) bg-(--brand-card) shadow-(--brand-card-shadow)">
            <Table>
              <TableHeader>
                <TableRow className="border-(--brand-card-border) hover:bg-transparent">
                  <TableHead className="text-(--brand-label)">Product</TableHead>
                  <TableHead className="text-(--brand-label)">SPH</TableHead>
                  <TableHead className="text-(--brand-label)">CYL</TableHead>
                  <TableHead className="text-(--brand-label)">ADD</TableHead>
                  <TableHead className="text-(--brand-label)">Axis</TableHead>
                  <TableHead className="text-(--brand-label)">Price</TableHead>
                  <TableHead className="text-(--brand-label)">Quantity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={7}
                      className="h-28 text-center text-(--brand-text-muted)"
                    >
                      {productQuery.trim()
                        ? "No products match your search."
                        : "No products found in this line."}
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {products.map((product, index) => {
                      const tone = stockTone(product.quantity);
                      return (
                        <TableRow
                          key={product.id}
                          className="border-(--brand-card-border)"
                        >
                          <TableCell className="align-top">
                            <div className="font-semibold text-(--brand-text)">
                              {product.brand || catalogItem.name}
                            </div>
                            <div className="mt-0.5 text-xs text-(--brand-text-muted)">
                              {[product.coating, product.category, product.item]
                                .filter(Boolean)
                                .join(" \u00b7 ") || "\u2014"}
                            </div>
                            {index === productSentinelIndex && hasMore ? (
                              <InfiniteScrollSentinel
                                active
                                setSentinelNode={setProductSentinel}
                              />
                            ) : null}
                          </TableCell>
                          <TableCell className="align-top text-(--brand-text)">
                            {formatPower(product.sph)}
                          </TableCell>
                          <TableCell className="align-top text-(--brand-text)">
                            {formatPower(product.cyl)}
                          </TableCell>
                          <TableCell className="align-top text-(--brand-text)">
                            {formatPower(product.add)}
                          </TableCell>
                          <TableCell className="align-top text-(--brand-text)">
                            {product.axis ?? "\u2014"}
                          </TableCell>
                          <TableCell className="align-top text-(--brand-text)">
                            {"\u20b9"}
                            {Number(product.price).toLocaleString("en-IN")}
                          </TableCell>
                          <TableCell className="align-top">
                            <Badge
                              variant="outline"
                              className={cn("rounded-lg font-bold", tone.className)}
                            >
                              {tone.label}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {hasMore && products.length <= productSentinelIndex ? (
                      <InfiniteScrollSentinel
                        active
                        asTableRow
                        colSpan={7}
                        loadingMore={productsLoadingMore}
                        setSentinelNode={setProductSentinel}
                      />
                    ) : null}
                  </>
                )}
              </TableBody>
            </Table>
          </div>
          )}
        </>
      ) : null}
    </AdminPage>
  );
}

export default function StockOverviewPage() {
  return (
    <Suspense
      fallback={
        <AdminPage title="Stock Overview" subtitle="Category-wise product stock">
          <ListSkeleton compact rows={6} />
        </AdminPage>
      }
    >
      <StockOverviewContent />
    </Suspense>
  );
}
