"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  Pencil,
  Plus,
  Power,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { AdminPage } from "@/components/admin-shell";
import {
  CardGridSkeleton,
  ListSkeleton,
  TableSkeleton,
} from "@/components/admin-skeletons";
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
import { AdminSelect, type AdminSelectOption } from "@/components/admin-select";
import { AdminApiError } from "@/app/lib/admin-api";
import {
  fetchLensAttributes,
  type LensAttribute,
} from "@/app/lib/admin-lens-catalog";
import {
  clearStorefrontOverride,
  createStorefrontCard,
  deleteStorefrontCard,
  fetchPinCandidates,
  fetchStorefrontCardProducts,
  fetchStorefrontCards,
  fetchStorefrontFamilies,
  updateStorefrontCard,
  upsertStorefrontOverride,
  type StorefrontCard,
  type StorefrontFamily,
  type StorefrontMembershipItem,
  type StorefrontPinCandidate,
} from "@/app/lib/admin-storefront";

function errMsg(err: unknown, fallback: string) {
  return err instanceof AdminApiError ? err.message : fallback;
}

function toFilterOptions(items: LensAttribute[]): AdminSelectOption[] {
  return [
    { value: "", label: "Any" },
    ...items.map((a) => ({
      value: a.id,
      label: `${a.code} — ${a.name}`,
    })),
  ];
}

function StorefrontCatalogContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const familyCode = searchParams.get("family")?.trim().toUpperCase() || "";
  const cardId = searchParams.get("card")?.trim() || "";

  const [families, setFamilies] = useState<StorefrontFamily[]>([]);
  const [familiesLoading, setFamiliesLoading] = useState(true);
  const [familiesError, setFamiliesError] = useState("");

  const selectedFamily = useMemo(
    () => families.find((f) => f.code === familyCode) ?? null,
    [families, familyCode]
  );

  const [cards, setCards] = useState<StorefrontCard[]>([]);
  const [cardsLoading, setCardsLoading] = useState(false);
  const [cardsError, setCardsError] = useState("");
  const [cardQuery, setCardQuery] = useState("");
  const [cardBusyId, setCardBusyId] = useState<string | null>(null);

  const [cardModalOpen, setCardModalOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<StorefrontCard | null>(null);
  const [cardName, setCardName] = useState("");
  const [cardDescription, setCardDescription] = useState("");
  const [cardSortOrder, setCardSortOrder] = useState("0");
  const [cardModalBusy, setCardModalBusy] = useState(false);
  const [cardModalError, setCardModalError] = useState("");
  const [filterAttrsLoading, setFilterAttrsLoading] = useState(false);
  const [filterBaseId, setFilterBaseId] = useState("");
  const [filterMaterialId, setFilterMaterialId] = useState("");
  const [filterIndexId, setFilterIndexId] = useState("");
  const [filterCoatingId, setFilterCoatingId] = useState("");
  const [filterColorId, setFilterColorId] = useState("");
  const [filterDiameterId, setFilterDiameterId] = useState("");
  const [filterProgressiveTypeId, setFilterProgressiveTypeId] = useState("");
  const [filterBaseOptions, setFilterBaseOptions] = useState<AdminSelectOption[]>(
    [{ value: "", label: "Any" }]
  );
  const [filterMaterialOptions, setFilterMaterialOptions] = useState<
    AdminSelectOption[]
  >([{ value: "", label: "Any" }]);
  const [filterIndexOptions, setFilterIndexOptions] = useState<
    AdminSelectOption[]
  >([{ value: "", label: "Any" }]);
  const [filterCoatingOptions, setFilterCoatingOptions] = useState<
    AdminSelectOption[]
  >([{ value: "", label: "Any" }]);
  const [filterColorOptions, setFilterColorOptions] = useState<
    AdminSelectOption[]
  >([{ value: "", label: "Any" }]);
  const [filterDiameterOptions, setFilterDiameterOptions] = useState<
    AdminSelectOption[]
  >([{ value: "", label: "Any" }]);
  const [filterProgressiveOptions, setFilterProgressiveOptions] = useState<
    AdminSelectOption[]
  >([{ value: "", label: "Any" }]);

  const [cardDetail, setCardDetail] = useState<StorefrontCard | null>(null);
  const [products, setProducts] = useState<StorefrontMembershipItem[]>([]);
  const [excludedProducts, setExcludedProducts] = useState<
    StorefrontMembershipItem[]
  >([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState("");
  const [productQuery, setProductQuery] = useState("");
  const [productBusyId, setProductBusyId] = useState<string | null>(null);

  const [pinModalOpen, setPinModalOpen] = useState(false);
  const [pinCandidates, setPinCandidates] = useState<StorefrontPinCandidate[]>(
    []
  );
  const [pinLoading, setPinLoading] = useState(false);
  const [pinQuery, setPinQuery] = useState("");
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(
    new Set()
  );
  const [pinBusy, setPinBusy] = useState(false);
  const [pinError, setPinError] = useState("");

  const setQuery = useCallback(
    (patch: { family?: string | null; card?: string | null }) => {
      const params = new URLSearchParams();
      const nextFamily =
        patch.family === null ? "" : (patch.family ?? familyCode);
      const nextCard = patch.card === null ? "" : (patch.card ?? cardId);
      if (nextFamily) params.set("family", nextFamily);
      if (nextCard) params.set("card", nextCard);
      const qs = params.toString();
      router.push(qs ? `/inventory/storefront-catalog?${qs}` : "/inventory/storefront-catalog");
    },
    [router, familyCode, cardId]
  );

  const loadFamilies = useCallback(async () => {
    setFamiliesLoading(true);
    setFamiliesError("");
    try {
      const res = await fetchStorefrontFamilies();
      setFamilies(res.items);
    } catch (err) {
      setFamiliesError(errMsg(err, "Failed to load families."));
    } finally {
      setFamiliesLoading(false);
    }
  }, []);

  const loadCards = useCallback(async (familyId: string) => {
    setCardsLoading(true);
    setCardsError("");
    try {
      const res = await fetchStorefrontCards({
        familyId,
        includeInactive: true,
      });
      setCards(res.items);
    } catch (err) {
      setCardsError(errMsg(err, "Failed to load cards."));
      setCards([]);
    } finally {
      setCardsLoading(false);
    }
  }, []);

  const loadProducts = useCallback(async (id: string, q?: string) => {
    setProductsLoading(true);
    setProductsError("");
    try {
      const res = await fetchStorefrontCardProducts(id, {
        q,
        includeInactiveProducts: true,
      });
      setCardDetail(res.card);
      setProducts(res.items);
      setExcludedProducts(res.excluded ?? []);
    } catch (err) {
      setProductsError(errMsg(err, "Failed to load products."));
      setProducts([]);
      setExcludedProducts([]);
      setCardDetail(null);
    } finally {
      setProductsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFamilies();
  }, [loadFamilies]);

  useEffect(() => {
    if (!selectedFamily || cardId) return;
    void loadCards(selectedFamily.id);
  }, [selectedFamily, cardId, loadCards]);

  useEffect(() => {
    if (!cardId) {
      setCardDetail(null);
      setProducts([]);
      setExcludedProducts([]);
      return;
    }
    void loadProducts(cardId, productQuery);
  }, [cardId, productQuery, loadProducts]);

  const filteredCards = useMemo(() => {
    const q = cardQuery.trim().toLowerCase();
    if (!q) return cards;
    return cards.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.description ?? "").toLowerCase().includes(q)
    );
  }, [cards, cardQuery]);

  const loadFilterAttributes = useCallback(async () => {
    setFilterAttrsLoading(true);
    try {
      const [
        base,
        material,
        index,
        coating,
        color,
        diameter,
        progressiveType,
      ] = await Promise.all([
        fetchLensAttributes("base", { activeOnly: true }),
        fetchLensAttributes("material", { activeOnly: true }),
        fetchLensAttributes("index", { activeOnly: true }),
        fetchLensAttributes("coating", { activeOnly: true }),
        fetchLensAttributes("color", { activeOnly: true }),
        fetchLensAttributes("diameter", { activeOnly: true }),
        fetchLensAttributes("progressive-type", { activeOnly: true }),
      ]);
      setFilterBaseOptions(toFilterOptions(base.items));
      setFilterMaterialOptions(toFilterOptions(material.items));
      setFilterIndexOptions(toFilterOptions(index.items));
      setFilterCoatingOptions(toFilterOptions(coating.items));
      setFilterColorOptions(toFilterOptions(color.items));
      setFilterDiameterOptions(toFilterOptions(diameter.items));
      setFilterProgressiveOptions(toFilterOptions(progressiveType.items));
    } catch (err) {
      setCardModalError(errMsg(err, "Failed to load filter options."));
    } finally {
      setFilterAttrsLoading(false);
    }
  }, []);

  function resetCardFilters() {
    setFilterBaseId("");
    setFilterMaterialId("");
    setFilterIndexId("");
    setFilterCoatingId("");
    setFilterColorId("");
    setFilterDiameterId("");
    setFilterProgressiveTypeId("");
  }

  function populateCardFilters(card: StorefrontCard) {
    setFilterBaseId(card.filters.baseId ?? "");
    setFilterMaterialId(card.filters.materialId ?? "");
    setFilterIndexId(card.filters.indexId ?? "");
    setFilterCoatingId(card.filters.coatingId ?? "");
    setFilterColorId(card.filters.colorId ?? "");
    setFilterDiameterId(card.filters.diameterId ?? "");
    setFilterProgressiveTypeId(card.filters.progressiveTypeId ?? "");
  }

  function openCreateCard() {
    if (!selectedFamily) return;
    setEditingCard(null);
    setCardName("");
    setCardDescription("");
    setCardSortOrder("0");
    resetCardFilters();
    setCardModalError("");
    setCardModalOpen(true);
    void loadFilterAttributes();
  }

  function openEditCard(card: StorefrontCard) {
    setEditingCard(card);
    setCardName(card.name);
    setCardDescription(card.description ?? "");
    setCardSortOrder(String(card.sortOrder));
    populateCardFilters(card);
    setCardModalError("");
    setCardModalOpen(true);
    void loadFilterAttributes();
  }

  const cardFilterPayload = useMemo(
    () => ({
      baseId: filterBaseId || null,
      materialId: filterMaterialId || null,
      indexId: filterIndexId || null,
      coatingId: filterCoatingId || null,
      colorId: filterColorId || null,
      diameterId: filterDiameterId || null,
      progressiveTypeId: filterProgressiveTypeId || null,
    }),
    [
      filterBaseId,
      filterMaterialId,
      filterIndexId,
      filterCoatingId,
      filterColorId,
      filterDiameterId,
      filterProgressiveTypeId,
    ]
  );

  const modalFamilyCode = (
    editingCard?.familyCode ??
    selectedFamily?.code ??
    familyCode
  ).toUpperCase();
  const showProgressiveFilter = modalFamilyCode === "V2";

  async function saveCard() {
    if (!editingCard && !selectedFamily) return;
    setCardModalBusy(true);
    setCardModalError("");
    try {
      const sortOrder = Number(cardSortOrder);
      if (editingCard) {
        await updateStorefrontCard(editingCard.id, {
          name: cardName,
          description: cardDescription,
          sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
          filters: cardFilterPayload,
        });
      } else {
        await createStorefrontCard({
          familyId: selectedFamily!.id,
          name: cardName,
          description: cardDescription,
          sortOrder: Number.isFinite(sortOrder) ? sortOrder : 0,
          filters: cardFilterPayload,
        });
      }
      setCardModalOpen(false);
      const refreshFamilyId =
        selectedFamily?.id ?? editingCard?.familyId ?? cardDetail?.familyId;
      if (refreshFamilyId) await loadCards(refreshFamilyId);
      await loadFamilies();
      if (cardId && editingCard?.id === cardId) {
        await loadProducts(cardId, productQuery);
      }
    } catch (err) {
      setCardModalError(errMsg(err, "Failed to save card."));
    } finally {
      setCardModalBusy(false);
    }
  }

  function renderCardModal() {
    if (!cardModalOpen) return null;
    const filterField = (
      label: string,
      value: string,
      onChange: (v: string) => void,
      options: AdminSelectOption[]
    ) => (
      <label className="grid gap-1">
        <span className="text-xs font-bold uppercase tracking-wider text-(--brand-text-muted)">
          {label}
        </span>
        <AdminSelect
          value={value}
          onValueChange={onChange}
          options={options}
          placeholder="Any"
          disabled={filterAttrsLoading || cardModalBusy}
          size="sm"
        />
      </label>
    );

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-xl border border-(--brand-card-border) bg-(--brand-card) p-5 shadow-xl">
          <h3 className="text-base font-bold text-(--brand-text)">
            {editingCard ? "Edit card" : "Add card"}
          </h3>
          <p className="mt-1 text-xs text-(--brand-text-muted)">
            Attribute filters combine with AND. Empty means any.
          </p>
          <div className="mt-3 grid gap-3">
            <label className="grid gap-1">
              <span className="text-xs font-bold uppercase tracking-wider text-(--brand-text-muted)">
                Name
              </span>
              <Input
                value={cardName}
                onChange={(e) => setCardName(e.target.value)}
                className="h-9"
              />
            </label>
            <label className="grid gap-1">
              <span className="text-xs font-bold uppercase tracking-wider text-(--brand-text-muted)">
                Description
              </span>
              <Input
                value={cardDescription}
                onChange={(e) => setCardDescription(e.target.value)}
                className="h-9"
              />
            </label>
            <label className="grid gap-1">
              <span className="text-xs font-bold uppercase tracking-wider text-(--brand-text-muted)">
                Sort order
              </span>
              <Input
                value={cardSortOrder}
                onChange={(e) => setCardSortOrder(e.target.value)}
                className="h-9"
                inputMode="numeric"
              />
            </label>
            <h4 className="pt-1 text-xs font-bold uppercase tracking-wider text-(--brand-text-muted)">
              Product filters
            </h4>
            <div className="grid gap-3 sm:grid-cols-2">
              {filterField("Base", filterBaseId, setFilterBaseId, filterBaseOptions)}
              {filterField(
                "Material",
                filterMaterialId,
                setFilterMaterialId,
                filterMaterialOptions
              )}
              {filterField("Index", filterIndexId, setFilterIndexId, filterIndexOptions)}
              {filterField(
                "Coating",
                filterCoatingId,
                setFilterCoatingId,
                filterCoatingOptions
              )}
              {filterField("Color", filterColorId, setFilterColorId, filterColorOptions)}
              {filterField(
                "Diameter",
                filterDiameterId,
                setFilterDiameterId,
                filterDiameterOptions
              )}
              {showProgressiveFilter
                ? filterField(
                    "Progressive type",
                    filterProgressiveTypeId,
                    setFilterProgressiveTypeId,
                    filterProgressiveOptions
                  )
                : null}
            </div>
          </div>
          {cardModalError ? (
            <p className="mt-2 text-sm text-red-600">{cardModalError}</p>
          ) : null}
          <div className="mt-4 flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => setCardModalOpen(false)}
              disabled={cardModalBusy}
            >
              Cancel
            </Button>
            <Button
              onClick={() => void saveCard()}
              disabled={cardModalBusy || !cardName.trim()}
            >
              {cardModalBusy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : null}
              Save
            </Button>
          </div>
        </div>
      </div>
    );
  }

  async function toggleCardActive(card: StorefrontCard) {
    if (!selectedFamily) return;
    setCardBusyId(card.id);
    try {
      await updateStorefrontCard(card.id, { isActive: !card.isActive });
      await loadCards(selectedFamily.id);
    } catch (err) {
      setCardsError(errMsg(err, "Failed to update card."));
    } finally {
      setCardBusyId(null);
    }
  }

  async function removeCard(card: StorefrontCard) {
    if (!selectedFamily) return;
    const ok = window.confirm(
      card.productCount > 0
        ? `"${card.name}" has linked products and will be deactivated (hidden from shop). Continue?`
        : `Delete card "${card.name}"?`
    );
    if (!ok) return;
    setCardBusyId(card.id);
    try {
      await deleteStorefrontCard(card.id);
      await loadCards(selectedFamily.id);
      await loadFamilies();
    } catch (err) {
      setCardsError(errMsg(err, "Failed to delete card."));
    } finally {
      setCardBusyId(null);
    }
  }

  async function openPinModal() {
    if (!cardId || !cardDetail) return;
    setPinModalOpen(true);
    setPinError("");
    setSelectedProductIds(new Set());
    setPinQuery("");
    setPinLoading(true);
    try {
      const res = await fetchPinCandidates({
        familyId: cardDetail.familyId,
        cardId,
        limit: 80,
      });
      setPinCandidates(res.items);
    } catch (err) {
      setPinError(errMsg(err, "Failed to load products."));
      setPinCandidates([]);
    } finally {
      setPinLoading(false);
    }
  }

  async function searchPinCandidates(q: string) {
    setPinQuery(q);
    if (!cardId || !cardDetail) return;
    setPinLoading(true);
    try {
      const res = await fetchPinCandidates({
        familyId: cardDetail.familyId,
        cardId,
        q,
        limit: 80,
      });
      setPinCandidates(res.items);
    } catch (err) {
      setPinError(errMsg(err, "Failed to search products."));
    } finally {
      setPinLoading(false);
    }
  }

  async function confirmPin() {
    if (!cardId || selectedProductIds.size === 0) return;
    setPinBusy(true);
    setPinError("");
    try {
      await Promise.all(
        [...selectedProductIds].map((lensProductId) =>
          upsertStorefrontOverride(cardId, { lensProductId, kind: "PIN" })
        )
      );
      setPinModalOpen(false);
      await loadProducts(cardId, productQuery);
      if (selectedFamily) await loadCards(selectedFamily.id);
    } catch (err) {
      setPinError(errMsg(err, "Failed to pin products."));
    } finally {
      setPinBusy(false);
    }
  }

  async function excludeProduct(productId: string) {
    if (!cardId) return;
    setProductBusyId(productId);
    try {
      await upsertStorefrontOverride(cardId, {
        lensProductId: productId,
        kind: "EXCLUDE",
      });
      await loadProducts(cardId, productQuery);
      if (selectedFamily) await loadCards(selectedFamily.id);
    } catch (err) {
      setProductsError(errMsg(err, "Failed to exclude product."));
    } finally {
      setProductBusyId(null);
    }
  }

  async function clearOverride(productId: string) {
    if (!cardId) return;
    setProductBusyId(productId);
    try {
      await clearStorefrontOverride(cardId, productId);
      await loadProducts(cardId, productQuery);
      if (selectedFamily) await loadCards(selectedFamily.id);
    } catch (err) {
      setProductsError(errMsg(err, "Failed to clear override."));
    } finally {
      setProductBusyId(null);
    }
  }

  // ─── Level 1: Families ───────────────────────────────────────────────────
  if (!familyCode) {
    return (
      <AdminPage
        title="Storefront Catalog"
        subtitle="Cards customers see in the shop — powered by Products & catalog (SoT)."
      >
        {familiesError ? (
          <p className="text-sm text-red-600">{familiesError}</p>
        ) : familiesLoading ? (
          <CardGridSkeleton />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {families.map((family) => (
              <button
                key={family.id}
                type="button"
                onClick={() => setQuery({ family: family.code, card: null })}
                className="rounded-xl border border-(--brand-card-border) bg-(--brand-card) p-6 text-left transition hover:border-(--brand-primary)/50"
              >
                <p className="text-lg font-extrabold text-(--brand-text)">
                  {family.name}
                </p>
                <p className="mt-1 text-sm font-medium text-(--brand-text-muted)">
                  {family.code}
                </p>
                <p className="mt-4 text-sm font-semibold text-(--brand-primary)">
                  {family.cardCount} card{family.cardCount === 1 ? "" : "s"}
                </p>
              </button>
            ))}
          </div>
        )}
      </AdminPage>
    );
  }

  // ─── Level 3: Products on a card ─────────────────────────────────────────
  if (cardId) {
    return (
      <AdminPage
        title={cardDetail?.name ?? "Storefront card"}
        subtitle={
          cardDetail
            ? `${cardDetail.familyName} · ${cardDetail.filterSummary} · ${products.length} visible`
            : familyCode
        }
      >
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-9 gap-1.5 px-2"
            onClick={() => setQuery({ family: familyCode, card: null })}
          >
            <ArrowLeft className="size-4" />
            Cards
          </Button>
          {cardDetail ? (
            <Badge variant={cardDetail.isActive ? "default" : "secondary"}>
              {cardDetail.isActive ? "Active" : "Inactive"}
            </Badge>
          ) : null}
          <div className="ml-auto flex flex-wrap gap-2">
            {cardDetail ? (
              <Button
                size="sm"
                variant="outline"
                className="h-9"
                onClick={() => openEditCard(cardDetail)}
              >
                <Pencil className="size-4" />
                Edit filters
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              className="h-9"
              onClick={() => void openPinModal()}
            >
              <Plus className="size-4" />
              Pin product
            </Button>
          </div>
        </div>

        <div className="mb-4">
          <Input
            className="h-9 max-w-md"
            placeholder="Search visible products…"
            value={productQuery}
            onChange={(e) => setProductQuery(e.target.value)}
          />
        </div>

        {productsError ? (
          <p className="text-sm text-red-600">{productsError}</p>
        ) : productsLoading ? (
          <TableSkeleton />
        ) : products.length === 0 ? (
          <div className="rounded-xl border border-(--brand-card-border) bg-(--brand-card) px-6 py-12 text-center text-sm text-(--brand-text-muted)">
            No visible products. Adjust card filters or pin catalog parents.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-(--brand-card-border)">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="w-24">Source</TableHead>
                  <TableHead className="w-24">Variants</TableHead>
                  <TableHead className="w-24">Active</TableHead>
                  <TableHead className="w-40">Open</TableHead>
                  <TableHead className="w-36" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {products.map((row) => (
                  <TableRow key={row.productId}>
                    <TableCell>
                      <p className="font-medium text-(--brand-text)">
                        {row.summary}
                      </p>
                      <p className="text-xs text-(--brand-text-muted)">
                        {row.baseCode}
                      </p>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{row.source}</Badge>
                    </TableCell>
                    <TableCell>{row.variantCount}</TableCell>
                    <TableCell>
                      <Badge variant={row.isActive ? "default" : "secondary"}>
                        {row.isActive ? "Yes" : "No"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button asChild variant="outline" size="sm" className="h-8">
                        <Link href={`/inventory/products-catalog/${row.productId}`}>
                          Catalog →
                        </Link>
                      </Button>
                    </TableCell>
                    <TableCell>
                      {row.source === "pinned" ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8"
                          disabled={productBusyId === row.productId}
                          onClick={() => void clearOverride(row.productId)}
                        >
                          Unpin
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8"
                          disabled={productBusyId === row.productId}
                          onClick={() => void excludeProduct(row.productId)}
                        >
                          Exclude
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {excludedProducts.length > 0 ? (
          <div className="mt-8">
            <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-(--brand-text-muted)">
              Excluded
            </h3>
            <div className="overflow-hidden rounded-xl border border-(--brand-card-border)">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className="w-40">Open</TableHead>
                    <TableHead className="w-28" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {excludedProducts.map((row) => (
                    <TableRow key={row.productId}>
                      <TableCell>
                        <p className="font-medium text-(--brand-text)">
                          {row.summary}
                        </p>
                        <p className="text-xs text-(--brand-text-muted)">
                          {row.baseCode}
                        </p>
                      </TableCell>
                      <TableCell>
                        <Button asChild variant="outline" size="sm" className="h-8">
                          <Link href={`/inventory/products-catalog/${row.productId}`}>
                            Catalog →
                          </Link>
                        </Button>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8"
                          disabled={productBusyId === row.productId}
                          onClick={() => void clearOverride(row.productId)}
                        >
                          Undo
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        ) : null}

        {pinModalOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="max-h-[85vh] w-full max-w-lg overflow-auto rounded-xl border border-(--brand-card-border) bg-(--brand-card) p-5 shadow-xl">
              <h3 className="text-base font-bold text-(--brand-text)">
                Pin products
              </h3>
              <p className="mt-1 text-sm text-(--brand-text-muted)">
                Active parents in this family — pin to force onto this card.
              </p>
              <Input
                className="mt-3 h-9"
                placeholder="Search…"
                value={pinQuery}
                onChange={(e) => void searchPinCandidates(e.target.value)}
              />
              {pinError ? (
                <p className="mt-2 text-sm text-red-600">{pinError}</p>
              ) : null}
              <div className="mt-3 max-h-72 space-y-2 overflow-auto">
                {pinLoading ? (
                  <ListSkeleton />
                ) : pinCandidates.length === 0 ? (
                  <p className="text-sm text-(--brand-text-muted)">
                    No products found.
                  </p>
                ) : (
                  pinCandidates.map((p) => {
                    const checked = selectedProductIds.has(p.productId);
                    return (
                      <label
                        key={p.productId}
                        className="flex cursor-pointer items-start gap-2 rounded-md border border-(--brand-card-border) px-3 py-2"
                      >
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={checked}
                          onChange={() => {
                            setSelectedProductIds((prev) => {
                              const next = new Set(prev);
                              if (next.has(p.productId)) next.delete(p.productId);
                              else next.add(p.productId);
                              return next;
                            });
                          }}
                        />
                        <span>
                          <span className="block text-sm font-medium text-(--brand-text)">
                            {p.summary}
                          </span>
                          <span className="text-xs text-(--brand-text-muted)">
                            {p.variantCount} variants
                          </span>
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setPinModalOpen(false)}
                  disabled={pinBusy}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => void confirmPin()}
                  disabled={pinBusy || selectedProductIds.size === 0}
                >
                  {pinBusy ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : null}
                  Pin {selectedProductIds.size || ""}
                </Button>
              </div>
            </div>
          </div>
        ) : null}
        {renderCardModal()}
      </AdminPage>
    );
  }

  // ─── Level 2: Cards ──────────────────────────────────────────────────────
  return (
    <AdminPage
      title={selectedFamily?.name ?? familyCode}
      subtitle="Merchandising cards — attribute filters plus pin / exclude overrides."
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-9 gap-1.5 px-2"
          onClick={() => setQuery({ family: null, card: null })}
        >
          <ArrowLeft className="size-4" />
          Families
        </Button>
      </div>

      <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Input
              className="h-9 max-w-sm"
              placeholder="Search cards…"
              value={cardQuery}
              onChange={(e) => setCardQuery(e.target.value)}
            />
            <Button
              size="sm"
              className="h-9"
              onClick={() => void (selectedFamily && loadCards(selectedFamily.id))}
            >
              <RefreshCw className="size-4" />
              Refresh
            </Button>
            <Button size="sm" className="ml-auto h-9" onClick={openCreateCard}>
              <Plus className="size-4" />
              Add card
            </Button>
          </div>

          {cardsError ? (
            <p className="text-sm text-red-600">{cardsError}</p>
          ) : cardsLoading ? (
            <CardGridSkeleton />
          ) : filteredCards.length === 0 ? (
            <div className="rounded-xl border border-(--brand-card-border) bg-(--brand-card) px-6 py-12 text-center text-sm text-(--brand-text-muted)">
              No cards yet. Add a card to start merchandising this family.
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredCards.map((card) => (
                <div
                  key={card.id}
                  className="rounded-xl border border-(--brand-card-border) bg-(--brand-card) p-4"
                >
                  <button
                    type="button"
                    className="w-full text-left"
                    onClick={() =>
                      setQuery({ family: familyCode, card: card.id })
                    }
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-base font-extrabold text-(--brand-text)">
                        {card.name}
                      </p>
                      <Badge variant={card.isActive ? "default" : "secondary"}>
                        {card.isActive ? "ON" : "OFF"}
                      </Badge>
                    </div>
                    <p className="mt-2 text-xs text-(--brand-text-muted)">
                      {card.filterSummary}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-(--brand-primary)">
                      {card.productCount} product
                      {card.productCount === 1 ? "" : "s"}
                    </p>
                  </button>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8"
                      onClick={() => openEditCard(card)}
                    >
                      <Pencil className="size-3.5" />
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8"
                      disabled={cardBusyId === card.id}
                      onClick={() => void toggleCardActive(card)}
                    >
                      <Power className="size-3.5" />
                      {card.isActive ? "Deactivate" : "Activate"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8"
                      disabled={cardBusyId === card.id}
                      onClick={() => void removeCard(card)}
                    >
                      <Trash2 className="size-3.5" />
                      {card.productCount > 0 ? "Hide" : "Delete"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
      </>

      {renderCardModal()}

    </AdminPage>
  );
}

export default function StorefrontCatalogPage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <StorefrontCatalogContent />
    </Suspense>
  );
}
