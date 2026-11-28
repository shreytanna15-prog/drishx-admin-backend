/**
 * Storefront Catalog — hybrid attribute filters + pin/exclude membership resolver.
 */

import {
  Prisma,
  StorefrontCardOverrideKind,
} from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import {
  normalizeFamilyCode,
  StorefrontCatalogError,
} from "./storefront-catalog-core";

export { normalizeFamilyCode, StorefrontCatalogError };

export type StorefrontMembershipSource = "matched" | "pinned" | "excluded";

export type StorefrontFilterInput = {
  baseId?: string | null;
  materialId?: string | null;
  indexId?: string | null;
  coatingId?: string | null;
  colorId?: string | null;
  diameterId?: string | null;
  progressiveTypeId?: string | null;
};

export type SerializedStorefrontCardFilters = {
  baseId: string | null;
  materialId: string | null;
  indexId: string | null;
  coatingId: string | null;
  colorId: string | null;
  diameterId: string | null;
  progressiveTypeId: string | null;
};

export type SerializedStorefrontCard = {
  id: string;
  familyId: string;
  familyCode: string;
  familyName: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  filters: SerializedStorefrontCardFilters;
  filterLabels: Record<string, string>;
  filterSummary: string;
  productCount: number;
  createdAt: string;
  updatedAt: string;
};

export type StorefrontMembershipItem = {
  productId: string;
  baseCode: string;
  isActive: boolean;
  variantCount: number;
  familyCode: string;
  familyName: string;
  summary: string;
  coatingName: string | null;
  source: StorefrontMembershipSource;
};

export type StorefrontPinCandidate = {
  productId: string;
  baseCode: string;
  isActive: boolean;
  variantCount: number;
  familyCode: string;
  familyName: string;
  summary: string;
  coatingName: string | null;
};

export type StorefrontFamilyRow = {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
  cardCount: number;
};

export type StorefrontCoatingFacet = {
  coatingId: string;
  coatingCode: string;
  name: string;
  productCount: number;
};

const CARD_INCLUDE = {
  family: { select: { id: true, code: true, name: true, sortOrder: true } },
  base: { select: { id: true, name: true, code: true } },
  material: { select: { id: true, name: true, code: true } },
  index: { select: { id: true, name: true, value: true } },
  coating: { select: { id: true, name: true, code: true } },
  color: { select: { id: true, name: true, code: true } },
  diameter: { select: { id: true, name: true, code: true } },
  progressiveType: { select: { id: true, name: true, code: true } },
} satisfies Prisma.StorefrontCardInclude;

const PRODUCT_INCLUDE = {
  family: { select: { code: true, name: true } },
  base: { select: { name: true } },
  material: { select: { name: true } },
  index: { select: { value: true } },
  coating: { select: { id: true, name: true, code: true } },
  color: { select: { name: true } },
  diameter: { select: { name: true } },
  progressiveType: { select: { name: true } },
  _count: { select: { variants: true } },
} satisfies Prisma.LensProductInclude;

type CardWithRelations = Prisma.StorefrontCardGetPayload<{
  include: typeof CARD_INCLUDE;
}>;

type ProductWithRelations = Prisma.LensProductGetPayload<{
  include: typeof PRODUCT_INCLUDE;
}>;

type ResolveMembershipOpts = {
  q?: string;
  includeExcluded?: boolean;
  /** When false (default for shop), only active parents. */
  includeInactiveProducts?: boolean;
  /** When true, inactive cards cannot be resolved (public / shop). */
  requireActiveCard?: boolean;
};

const FILTER_FIELD_META: Array<{
  key: keyof StorefrontFilterInput;
  label: string;
  relation: keyof CardWithRelations;
}> = [
  { key: "baseId", label: "Base", relation: "base" },
  { key: "materialId", label: "Material", relation: "material" },
  { key: "indexId", label: "Index", relation: "index" },
  { key: "coatingId", label: "Coating", relation: "coating" },
  { key: "colorId", label: "Color", relation: "color" },
  { key: "diameterId", label: "Diameter", relation: "diameter" },
  {
    key: "progressiveTypeId",
    label: "Progressive type",
    relation: "progressiveType",
  },
];

function isPrismaUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "P2002"
  );
}

function trimOrNull(value: string | null | undefined): string | null {
  if (value === undefined) return null;
  const t = (value ?? "").trim();
  return t.length ? t : null;
}

function buildProductSummary(product: ProductWithRelations): string {
  const parts = [
    product.base.name,
    product.material?.name,
    product.index?.value != null
      ? Number(product.index.value).toFixed(2)
      : null,
    product.coating?.name,
    product.color?.name,
    product.diameter?.name,
    product.progressiveType?.name,
  ].filter(Boolean);
  return parts.join(" · ");
}

function cardFiltersFromRow(card: CardWithRelations): SerializedStorefrontCardFilters {
  return {
    baseId: card.baseId,
    materialId: card.materialId,
    indexId: card.indexId,
    coatingId: card.coatingId,
    colorId: card.colorId,
    diameterId: card.diameterId,
    progressiveTypeId: card.progressiveTypeId,
  };
}

function buildFilterLabels(card: CardWithRelations): Record<string, string> {
  const labels: Record<string, string> = {};
  for (const { key, label, relation } of FILTER_FIELD_META) {
    if (!card[key]) continue;
    const rel = card[relation];
    if (!rel || typeof rel !== "object") continue;
    if ("value" in rel && rel.value != null) {
      labels[key] = `${label}: ${Number(rel.value).toFixed(2)}`;
    } else if ("name" in rel && typeof rel.name === "string") {
      labels[key] = `${label}: ${rel.name}`;
    }
  }
  return labels;
}

function buildFilterSummary(card: CardWithRelations): string {
  const parts = Object.values(buildFilterLabels(card));
  return parts.length ? parts.join(" · ") : "All products in family";
}

function buildProductFilterWhere(
  card: Pick<
    CardWithRelations,
  | "familyId"
  | "baseId"
  | "materialId"
  | "indexId"
  | "coatingId"
  | "colorId"
  | "diameterId"
  | "progressiveTypeId"
  >
): Prisma.LensProductWhereInput {
  const where: Prisma.LensProductWhereInput = { familyId: card.familyId };
  if (card.baseId) where.baseId = card.baseId;
  if (card.materialId) where.materialId = card.materialId;
  if (card.indexId) where.indexId = card.indexId;
  if (card.coatingId) where.coatingId = card.coatingId;
  if (card.colorId) where.colorId = card.colorId;
  if (card.diameterId) where.diameterId = card.diameterId;
  if (card.progressiveTypeId) {
    where.progressiveTypeId = card.progressiveTypeId;
  }
  return where;
}

function productSearchWhere(q: string): Prisma.LensProductWhereInput {
  const term = q.trim();
  if (!term) return {};
  return {
    OR: [
      { baseCode: { contains: term, mode: "insensitive" } },
      { base: { name: { contains: term, mode: "insensitive" } } },
      { material: { name: { contains: term, mode: "insensitive" } } },
      { coating: { name: { contains: term, mode: "insensitive" } } },
      { color: { name: { contains: term, mode: "insensitive" } } },
    ],
  };
}

function serializeMembershipItem(
  product: ProductWithRelations,
  source: StorefrontMembershipSource
): StorefrontMembershipItem {
  return {
    productId: product.id,
    baseCode: product.baseCode,
    isActive: product.isActive,
    variantCount: product._count.variants,
    familyCode: product.family.code,
    familyName: product.family.name,
    summary: buildProductSummary(product),
    coatingName: product.coating?.name ?? null,
    source,
  };
}

async function validateFilterFks(filters: StorefrontFilterInput): Promise<void> {
  const entries: Array<
    [keyof StorefrontFilterInput, keyof typeof prisma, string]
  > = [
    ["baseId", "lensBase", "Base"],
    ["materialId", "lensMaterial", "Material"],
    ["indexId", "lensIndex", "Index"],
    ["coatingId", "lensCoating", "Coating"],
    ["colorId", "lensColor", "Color"],
    ["diameterId", "lensDiameter", "Diameter"],
    ["progressiveTypeId", "lensProgressiveType", "Progressive type"],
  ];

  await Promise.all(
    entries.map(async ([field, model, label]) => {
      const id = filters[field];
      if (!id) return;
      const delegate = prisma[model] as {
        findUnique: (args: { where: { id: string } }) => Promise<unknown>;
      };
      const row = await delegate.findUnique({ where: { id } });
      if (!row) {
        throw new StorefrontCatalogError(
          `${label} not found for filter.`,
          400,
          "INVALID_FILTER"
        );
      }
    })
  );
}

function filterInputToPrismaData(
  filters?: StorefrontFilterInput
): Prisma.StorefrontCardUncheckedUpdateInput {
  if (!filters) return {};
  const data: Prisma.StorefrontCardUncheckedUpdateInput = {};
  if ("baseId" in filters) data.baseId = filters.baseId ?? null;
  if ("materialId" in filters) data.materialId = filters.materialId ?? null;
  if ("indexId" in filters) data.indexId = filters.indexId ?? null;
  if ("coatingId" in filters) data.coatingId = filters.coatingId ?? null;
  if ("colorId" in filters) data.colorId = filters.colorId ?? null;
  if ("diameterId" in filters) data.diameterId = filters.diameterId ?? null;
  if ("progressiveTypeId" in filters) {
    data.progressiveTypeId = filters.progressiveTypeId ?? null;
  }
  return data;
}

async function getCardRecord(id: string): Promise<CardWithRelations> {
  const card = await prisma.storefrontCard.findUnique({
    where: { id },
    include: CARD_INCLUDE,
  });
  if (!card) {
    throw new StorefrontCatalogError("Storefront card not found.", 404, "NOT_FOUND");
  }
  return card;
}

function serializeCardRow(
  card: CardWithRelations,
  productCount: number
): SerializedStorefrontCard {
  return {
    id: card.id,
    familyId: card.familyId,
    familyCode: card.family.code,
    familyName: card.family.name,
    name: card.name,
    description: card.description,
    sortOrder: card.sortOrder,
    isActive: card.isActive,
    filters: cardFiltersFromRow(card),
    filterLabels: buildFilterLabels(card),
    filterSummary: buildFilterSummary(card),
    productCount,
    createdAt: card.createdAt.toISOString(),
    updatedAt: card.updatedAt.toISOString(),
  };
}

async function serializeCard(
  card: CardWithRelations,
  productCountOpts?: {
    includeInactiveProducts?: boolean;
  }
): Promise<SerializedStorefrontCard> {
  const productCount = await countVisibleMembers(card.id, {
    includeInactiveProducts: productCountOpts?.includeInactiveProducts ?? false,
  });
  return serializeCardRow(card, productCount);
}

async function resolveFamilyId(opts: {
  familyId?: string;
  familyCode?: string;
}): Promise<string | undefined> {
  if (opts.familyId?.trim()) return opts.familyId.trim();
  const raw = opts.familyCode?.trim();
  if (!raw) return undefined;
  const code = normalizeFamilyCode(raw);
  if (!code) {
    throw new StorefrontCatalogError("Invalid family code.", 400, "INVALID_FAMILY");
  }
  const family = await prisma.lensFamily.findFirst({
    where: { code },
    select: { id: true },
  });
  if (!family) {
    throw new StorefrontCatalogError("Lens family not found.", 404, "NOT_FOUND");
  }
  return family.id;
}

async function loadCardOverrideSets(cardId: string) {
  const overrides = await prisma.storefrontCardProductOverride.findMany({
    where: { storefrontCardId: cardId },
    select: { lensProductId: true, kind: true },
  });

  const pinIds = new Set(
    overrides
      .filter((o) => o.kind === StorefrontCardOverrideKind.PIN)
      .map((o) => o.lensProductId)
  );
  const excludeIds = new Set(
    overrides
      .filter((o) => o.kind === StorefrontCardOverrideKind.EXCLUDE)
      .map((o) => o.lensProductId)
  );

  return { pinIds, excludeIds };
}

async function buildVisibleProductIdSet(
  card: CardWithRelations,
  opts: {
    includeInactiveProducts?: boolean;
    q?: string;
  }
): Promise<{ visibleIds: Set<string>; pinIds: Set<string> }> {
  const { pinIds, excludeIds } = await loadCardOverrideSets(card.id);

  const matchedRows = await prisma.lensProduct.findMany({
    where: {
      ...buildProductFilterWhere(card),
      ...(opts.includeInactiveProducts ? {} : { isActive: true }),
      ...productSearchWhere(opts.q ?? ""),
    },
    select: { id: true },
  });

  const visibleIds = new Set<string>();
  for (const row of matchedRows) {
    if (!excludeIds.has(row.id)) visibleIds.add(row.id);
  }
  for (const id of pinIds) {
    if (!excludeIds.has(id)) visibleIds.add(id);
  }

  return { visibleIds, pinIds };
}

async function fetchVisibleProducts(
  card: CardWithRelations,
  opts: ResolveMembershipOpts
): Promise<{
  products: ProductWithRelations[];
  pinIds: Set<string>;
  visibleIds: Set<string>;
  excludeIds: Set<string>;
}> {
  const { pinIds, excludeIds } = await loadCardOverrideSets(card.id);
  const { visibleIds, pinIds: pins } = await buildVisibleProductIdSet(card, opts);

  const products =
    visibleIds.size === 0
      ? []
      : await prisma.lensProduct.findMany({
          where: {
            id: { in: [...visibleIds] },
            ...(opts.includeInactiveProducts ? {} : { isActive: true }),
            ...productSearchWhere(opts.q ?? ""),
          },
          include: PRODUCT_INCLUDE,
          orderBy: [{ baseCode: "asc" }],
        });

  return { products, pinIds: pins, visibleIds, excludeIds };
}

/**
 * visible = (parents matching card filters) ∪ PIN − EXCLUDE
 */
export async function resolveStorefrontMembership(
  cardId: string,
  opts: ResolveMembershipOpts = {}
) {
  const card = await getCardRecord(cardId);

  if (opts.requireActiveCard && !card.isActive) {
    throw new StorefrontCatalogError(
      "Storefront card is not active.",
      404,
      "NOT_FOUND"
    );
  }

  const { products, pinIds, visibleIds, excludeIds } =
    await fetchVisibleProducts(card, opts);

  const productById = new Map(products.map((p) => [p.id, p]));

  const items: StorefrontMembershipItem[] = [];
  for (const id of visibleIds) {
    const product = productById.get(id);
    if (!product) continue;
    const source: StorefrontMembershipSource = pinIds.has(id) ? "pinned" : "matched";
    items.push(serializeMembershipItem(product, source));
  }

  items.sort((a, b) => a.baseCode.localeCompare(b.baseCode));

  let excluded: StorefrontMembershipItem[] | undefined;
  if (opts.includeExcluded && excludeIds.size > 0) {
    const excludedProducts = await prisma.lensProduct.findMany({
      where: {
        id: { in: [...excludeIds] },
        familyId: card.familyId,
        ...productSearchWhere(opts.q ?? ""),
      },
      include: PRODUCT_INCLUDE,
      orderBy: [{ baseCode: "asc" }],
    });
    excluded = excludedProducts.map((p) =>
      serializeMembershipItem(p, "excluded")
    );
  }

  const productCount =
    opts.q != null && opts.q.trim() !== ""
      ? items.length
      : await countVisibleMembers(cardId, {
          includeInactiveProducts: opts.includeInactiveProducts,
        });

  const serializedCard = serializeCardRow(card, productCount);

  return { card: serializedCard, items, excluded };
}

export async function countVisibleMembers(
  cardId: string,
  opts?: { includeInactiveProducts?: boolean }
): Promise<number> {
  const card = await getCardRecord(cardId);
  const { visibleIds } = await buildVisibleProductIdSet(card, {
    includeInactiveProducts: opts?.includeInactiveProducts ?? false,
  });

  if (visibleIds.size === 0) return 0;

  return prisma.lensProduct.count({
    where: {
      id: { in: [...visibleIds] },
      ...(opts?.includeInactiveProducts ? {} : { isActive: true }),
    },
  });
}

export async function listStorefrontFamilies(): Promise<StorefrontFamilyRow[]> {
  const families = await prisma.lensFamily.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      code: true,
      name: true,
      sortOrder: true,
      _count: { select: { storefrontCards: true } },
    },
  });

  return families.map((f) => ({
    id: f.id,
    code: f.code,
    name: f.name,
    sortOrder: f.sortOrder,
    cardCount: f._count.storefrontCards,
  }));
}

export async function listStorefrontCards(opts: {
  familyId?: string;
  familyCode?: string;
  includeInactive?: boolean;
}): Promise<SerializedStorefrontCard[]> {
  const familyId = await resolveFamilyId({
    familyId: opts.familyId,
    familyCode: opts.familyCode,
  });

  const where: Prisma.StorefrontCardWhereInput = {};
  if (familyId) where.familyId = familyId;
  if (opts.includeInactive === false) where.isActive = true;

  const cards = await prisma.storefrontCard.findMany({
    where,
    include: CARD_INCLUDE,
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  return Promise.all(
    cards.map((card) =>
      serializeCard(card, { includeInactiveProducts: opts.includeInactive })
    )
  );
}

export async function createStorefrontCard(input: {
  familyId: string;
  name: string;
  description?: string | null;
  sortOrder?: number;
  filters?: StorefrontFilterInput;
}): Promise<SerializedStorefrontCard> {
  const familyId = input.familyId?.trim();
  const name = input.name?.trim();
  if (!familyId) {
    throw new StorefrontCatalogError("familyId is required.", 400, "VALIDATION");
  }
  if (!name) {
    throw new StorefrontCatalogError("Card name is required.", 400, "VALIDATION");
  }

  const family = await prisma.lensFamily.findUnique({
    where: { id: familyId },
    select: { id: true },
  });
  if (!family) {
    throw new StorefrontCatalogError("Lens family not found.", 404, "NOT_FOUND");
  }

  if (input.filters) await validateFilterFks(input.filters);

  try {
    const created = await prisma.storefrontCard.create({
      data: {
        familyId,
        name,
        description: trimOrNull(input.description ?? null),
        sortOrder: input.sortOrder ?? 0,
        ...filterInputToPrismaData(input.filters),
      },
      include: CARD_INCLUDE,
    });
    return serializeCard(created);
  } catch (err) {
    if (isPrismaUniqueViolation(err)) {
      throw new StorefrontCatalogError(
        "A card with this name already exists in the family.",
        409,
        "DUPLICATE_NAME"
      );
    }
    throw err;
  }
}

export async function updateStorefrontCard(
  id: string,
  patch: {
    name?: string;
    description?: string | null;
    sortOrder?: number;
    isActive?: boolean;
    filters?: StorefrontFilterInput;
  }
): Promise<SerializedStorefrontCard> {
  await getCardRecord(id);

  const data: Prisma.StorefrontCardUncheckedUpdateInput = {};
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) {
      throw new StorefrontCatalogError("Card name cannot be empty.", 400, "VALIDATION");
    }
    data.name = name;
  }
  if (patch.description !== undefined) {
    data.description = trimOrNull(patch.description);
  }
  if (patch.sortOrder !== undefined) data.sortOrder = patch.sortOrder;
  if (patch.isActive !== undefined) data.isActive = patch.isActive;
  if (patch.filters) {
    await validateFilterFks(patch.filters);
    Object.assign(data, filterInputToPrismaData(patch.filters));
  }

  try {
    const updated = await prisma.storefrontCard.update({
      where: { id },
      data,
      include: CARD_INCLUDE,
    });
    return serializeCard(updated, { includeInactiveProducts: true });
  } catch (err) {
    if (isPrismaUniqueViolation(err)) {
      throw new StorefrontCatalogError(
        "A card with this name already exists in the family.",
        409,
        "DUPLICATE_NAME"
      );
    }
    throw err;
  }
}

export async function deleteStorefrontCard(id: string): Promise<{
  deleted: boolean;
  hidden: boolean;
  item?: SerializedStorefrontCard;
}> {
  const card = await getCardRecord(id);
  const visibleCount = await countVisibleMembers(id, {
    includeInactiveProducts: true,
  });

  if (visibleCount > 0) {
    const hidden =
      card.isActive === false
        ? card
        : await prisma.storefrontCard.update({
            where: { id },
            data: { isActive: false },
            include: CARD_INCLUDE,
          });
    return {
      deleted: false,
      hidden: true,
      item: await serializeCard(hidden, { includeInactiveProducts: true }),
    };
  }

  await prisma.storefrontCard.delete({ where: { id } });
  return { deleted: true, hidden: false };
}

export async function getStorefrontCard(
  id: string
): Promise<SerializedStorefrontCard> {
  const card = await getCardRecord(id);
  return serializeCard(card, { includeInactiveProducts: true });
}

export async function upsertStorefrontOverride(input: {
  cardId: string;
  lensProductId: string;
  kind: StorefrontCardOverrideKind;
}): Promise<void> {
  const cardId = input.cardId.trim();
  const lensProductId = input.lensProductId.trim();
  if (!cardId || !lensProductId) {
    throw new StorefrontCatalogError(
      "cardId and lensProductId are required.",
      400,
      "VALIDATION"
    );
  }
  if (
    input.kind !== StorefrontCardOverrideKind.PIN &&
    input.kind !== StorefrontCardOverrideKind.EXCLUDE
  ) {
    throw new StorefrontCatalogError("Invalid override kind.", 400, "VALIDATION");
  }

  const card = await getCardRecord(cardId);
  const product = await prisma.lensProduct.findUnique({
    where: { id: lensProductId },
    select: { id: true, familyId: true, isActive: true },
  });
  if (!product) {
    throw new StorefrontCatalogError("Lens product not found.", 404, "NOT_FOUND");
  }
  if (product.familyId !== card.familyId) {
    throw new StorefrontCatalogError(
      "Product must belong to the card family.",
      400,
      "FAMILY_MISMATCH"
    );
  }
  if (input.kind === StorefrontCardOverrideKind.PIN && !product.isActive) {
    throw new StorefrontCatalogError(
      "Only active products can be pinned.",
      400,
      "INACTIVE_PRODUCT"
    );
  }

  await prisma.storefrontCardProductOverride.upsert({
    where: {
      storefrontCardId_lensProductId: {
        storefrontCardId: cardId,
        lensProductId,
      },
    },
    create: {
      storefrontCardId: cardId,
      lensProductId,
      kind: input.kind,
    },
    update: { kind: input.kind },
  });
}

export async function clearStorefrontOverride(
  cardId: string,
  productId: string
): Promise<{ cleared: boolean }> {
  const result = await prisma.storefrontCardProductOverride.deleteMany({
    where: {
      storefrontCardId: cardId,
      lensProductId: productId,
    },
  });
  if (result.count === 0) {
    throw new StorefrontCatalogError("Override not found.", 404, "NOT_FOUND");
  }
  return { cleared: true };
}

export async function listPinCandidates(opts: {
  familyId: string;
  cardId: string;
  q?: string;
  limit?: number;
}): Promise<StorefrontPinCandidate[]> {
  const familyId = opts.familyId.trim();
  const cardId = opts.cardId.trim();
  if (!familyId || !cardId) {
    throw new StorefrontCatalogError(
      "familyId and cardId are required.",
      400,
      "VALIDATION"
    );
  }

  const card = await getCardRecord(cardId);
  if (card.familyId !== familyId) {
    throw new StorefrontCatalogError(
      "Card does not belong to the specified family.",
      400,
      "FAMILY_MISMATCH"
    );
  }

  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);

  const products = await prisma.lensProduct.findMany({
    where: {
      familyId,
      isActive: true,
      ...productSearchWhere(opts.q ?? ""),
    },
    include: PRODUCT_INCLUDE,
    orderBy: [{ baseCode: "asc" }],
    take: limit,
  });

  return products.map((p) => ({
    productId: p.id,
    baseCode: p.baseCode,
    isActive: p.isActive,
    variantCount: p._count.variants,
    familyCode: p.family.code,
    familyName: p.family.name,
    summary: buildProductSummary(p),
    coatingName: p.coating?.name ?? null,
  }));
}

export async function listPublicStorefrontCards(
  familyRaw: string
): Promise<SerializedStorefrontCard[]> {
  const code = normalizeFamilyCode(familyRaw);
  if (!code) {
    throw new StorefrontCatalogError("Invalid family.", 400, "INVALID_FAMILY");
  }

  const family = await prisma.lensFamily.findFirst({
    where: { code, isActive: true },
    select: { id: true },
  });
  if (!family) {
    throw new StorefrontCatalogError("Lens family not found.", 404, "NOT_FOUND");
  }

  return listStorefrontCards({
    familyId: family.id,
    includeInactive: false,
  });
}

/** Shop Level 3 row — same membership as admin, shaped for customer browse. */
export type StorefrontShopProduct = {
  id: string;
  productId: string;
  name: string;
  summary: string;
  baseCode: string;
  coating: string | null;
  coatingName: string | null;
  variantCount: number;
  familyCode: string;
  familyName: string;
  source: StorefrontMembershipSource;
};

export async function listPublicStorefrontProducts(cardId: string): Promise<{
  items: StorefrontShopProduct[];
}> {
  const { items } = await resolveStorefrontMembership(cardId, {
    requireActiveCard: true,
    includeInactiveProducts: false,
  });
  return {
    items: items.map((row) => ({
      id: row.productId,
      productId: row.productId,
      name: row.summary || row.baseCode,
      summary: row.summary,
      baseCode: row.baseCode,
      coating: row.coatingName,
      coatingName: row.coatingName,
      variantCount: row.variantCount,
      familyCode: row.familyCode,
      familyName: row.familyName,
      source: row.source,
    })),
  };
}

export async function listPublicStorefrontFacets(
  cardId: string
): Promise<{ facets: StorefrontCoatingFacet[] }> {
  const { items } = await resolveStorefrontMembership(cardId, {
    requireActiveCard: true,
    includeInactiveProducts: false,
  });

  if (items.length === 0) return { facets: [] };

  const products = await prisma.lensProduct.findMany({
    where: { id: { in: items.map((i) => i.productId) } },
    select: {
      coating: { select: { id: true, code: true, name: true } },
    },
  });

  const byCoating = new Map<string, StorefrontCoatingFacet>();
  for (const row of products) {
    const coating = row.coating;
    if (!coating) continue;
    const existing = byCoating.get(coating.id);
    if (existing) {
      existing.productCount += 1;
    } else {
      byCoating.set(coating.id, {
        coatingId: coating.id,
        coatingCode: coating.code,
        name: coating.name,
        productCount: 1,
      });
    }
  }

  const facets = [...byCoating.values()].sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  return { facets };
}