import { NextRequest, NextResponse } from "next/server";
import { getSession } from "../../lib/session-auth";
import { requireStaffPermission } from "../../lib/staff-access";
import { prisma } from "../../lib/prisma";
import {
  dedupeKryptokLenses,
  dedupeProgressiveLenses,
  dedupeSingleVisionLenses,
} from "../../lib/resolve-lens-stock";
import {
  applyCompoundNoPlano,
  computeSelectableRangesForLensGroups,
  computeSelectableRangesForLenses,
  kryptokProductKey,
  progressiveProductKey,
  type SelectableRange,
} from "../../lib/lens-power-range";
import { Eye, Prisma } from "@prisma/client";
import {
  buildKryptokLensFreeTextOr,
  buildKryptokWholesaleItemWhere,
} from "../../lib/kryptok-wholesale-catalog";
import {
  buildProgressiveWholesaleItemWhere,
  resolveProgressiveWholesaleItem,
} from "../../lib/progressive-wholesale-catalog";
import {
  buildSingleVisionWholesaleItemWhere,
  resolveSingleVisionWholesaleItem,
} from "../../lib/single-vision-wholesale-catalog";
import {
  buildNumericSearchClauses,
  parseLensSearchTerm,
  toSearchNumber,
} from "../../lib/lens-search";
import {
  buildWholesaleItemWhere,
  getShopTypesToFetch,
  resolveWholesaleShopSearch,
} from "../../lib/wholesale-shop-search";
import { isCrossProductSearchTerm, hasCrossPower } from "../../lib/cross-product";
import { mapKryptokLensFields } from "../../lib/kryptok-lens-map";
import { attachLensTypeImageUrls } from "../../lib/lens-catalog-images";
import {
  buildPowerShapeWhere,
  parsePowerShapeFilter,
  powerShapeNullabilityForType,
  type PowerShapeFilter,
} from "../../lib/lens-power-shape-filter";
import {
  buildNearOrRangePowerWhere,
  CATALOG_POWER_MAX_DISTANCE,
  compareCatalogPowerScores,
  resolvePowerMatchMeta,
  scoreCatalogPowerMatch,
  type PowerMatchMeta,
} from "../../lib/catalog-power-search";
import type { SphCylPower } from "../../lib/power-distance";

type UnifiedLensType = "KRYPTOK" | "PROGRESSIVE" | "SINGLE_VISION";

type UnifiedLens = {
  id: string;
  lensType: UnifiedLensType;
  costPrice: number | null;
  price: number;
  sph: number | null;
  sphStartRange: number | null;
  cyl: number | null;
  cylStartRange: number | null;
  crossPower: number | null;
  axis: number | null;
  add: number | null;
  eye: string | null;
  quantity: number;
  createdAt: Date;
  brand: string | null;
  item: string | null;
  coating: string | null;
  category?: string | null;
  index?: number | null;
  selectableRange?: SelectableRange | null;
};

const TYPE_MAP: Record<string, UnifiedLensType | "ALL"> = {
  all: "ALL",
  kryptok: "KRYPTOK",
  progressive: "PROGRESSIVE",
  "single-vision": "SINGLE_VISION",
  singlevision: "SINGLE_VISION",
};

function buildTextFilter(search: string): Prisma.StringFilter {
  return { contains: search, mode: "insensitive" };
}

function buildKryptokWhere(search: string): Prisma.KryptokLensWhereInput {
  if (!search) return {};

  const parsed = parseLensSearchTerm(search);
  const orConditions: Prisma.KryptokLensWhereInput[] = [
    ...buildNumericSearchClauses<Prisma.KryptokLensWhereInput>(parsed, {
      sph: true,
      cyl: true,
      crossPower: true,
      add: true,
      price: true,
      axis: true,
    }),
  ];

  if (parsed.remainingText) {
    orConditions.push(...buildKryptokLensFreeTextOr(parsed.remainingText));
  }

  return orConditions.length > 0 ? { OR: orConditions } : {};
}

function buildProgressiveWhere(search: string): Prisma.ProgressiveLensWhereInput {
  if (!search) return {};

  const parsed = parseLensSearchTerm(search);
  const normalized = search.trim().toLowerCase();
  const orConditions: Prisma.ProgressiveLensWhereInput[] = [
    ...buildNumericSearchClauses<Prisma.ProgressiveLensWhereInput>(parsed, {
      sph: true,
      cyl: true,
      add: true,
      price: true,
      axis: true,
    }),
  ];

  if (!parsed.sphCylPair && (normalized === "left" || normalized === "right")) {
    orConditions.push({ eye: normalized.toUpperCase() as Eye });
  }

  if (parsed.remainingText) {
    orConditions.push(
      { brand: buildTextFilter(parsed.remainingText) },
      { category: buildTextFilter(parsed.remainingText) },
      { item: buildTextFilter(parsed.remainingText) },
      { coating: buildTextFilter(parsed.remainingText) },
      { type: buildTextFilter(parsed.remainingText) }
    );
  }

  return orConditions.length > 0 ? { OR: orConditions } : {};
}

function buildSingleVisionWhere(search: string): Prisma.SingleVisionLensWhereInput {
  if (!search) return {};

  const parsed = parseLensSearchTerm(search);
  const orConditions: Prisma.SingleVisionLensWhereInput[] = [
    ...buildNumericSearchClauses<Prisma.SingleVisionLensWhereInput>(parsed, {
      sph: true,
      cyl: true,
      crossPower: true,
      price: true,
    }),
  ];

  if (parsed.remainingText) {
    const text = parsed.remainingText;
    const indexNumber = toSearchNumber(text);
    orConditions.push(
      { brand: buildTextFilter(text) },
      { category: buildTextFilter(text) },
      { item: buildTextFilter(text) },
      { coating: buildTextFilter(text) }
    );
    if (indexNumber !== null) {
      orConditions.push({ index: indexNumber });
    }
  }

  return orConditions.length > 0 ? { OR: orConditions } : {};
}

function mapKryptok(
  item: Awaited<ReturnType<typeof prisma.kryptokLens.findMany>>[number],
  selectableRange?: SelectableRange | null
): UnifiedLens {
  const mapped = mapKryptokLensFields(item);
  return {
    ...mapped,
    lensType: "KRYPTOK",
    createdAt: item.createdAt,
    selectableRange: selectableRange ?? null,
  };
}

function mapProgressive(
  item: Awaited<ReturnType<typeof prisma.progressiveLens.findMany>>[number],
  selectableRange?: SelectableRange | null
): UnifiedLens {
  return {
    id: item.id,
    lensType: "PROGRESSIVE",
    costPrice: item.costPrice !== null ? Number(item.costPrice) : null,
    price: Number(item.price),
    sph: Number(item.sph),
    sphStartRange:
      item.sphStartRange !== null && item.sphStartRange !== undefined
        ? Number(item.sphStartRange)
        : null,
    cyl: item.cyl !== null ? Number(item.cyl) : null,
    cylStartRange:
      item.cylStartRange !== null && item.cylStartRange !== undefined
        ? Number(item.cylStartRange)
        : null,
    crossPower: null,
    axis: item.axis,
    add: Number(item.add),
    eye: item.eye,
    quantity: item.quantity,
    createdAt: item.createdAt,
    brand: item.brand,
    item:
      resolveProgressiveWholesaleItem(item.category, item.item, item.type) ?? item.item,
    coating: item.coating,
    category: item.category,
    selectableRange: selectableRange ?? null,
  };
}

function mapSingleVision(
  item: Awaited<ReturnType<typeof prisma.singleVisionLens.findMany>>[number],
  selectableRange?: SelectableRange | null
): UnifiedLens {
  return {
    id: item.id,
    lensType: "SINGLE_VISION",
    costPrice: item.costPrice !== null ? Number(item.costPrice) : null,
    price: Number(item.price),
    sph: item.sph !== null ? Number(item.sph) : null,
    sphStartRange:
      item.sphStartRange !== null && item.sphStartRange !== undefined
        ? Number(item.sphStartRange)
        : null,
    cyl: item.cyl !== null ? Number(item.cyl) : null,
    cylStartRange:
      item.cylStartRange !== null && item.cylStartRange !== undefined
        ? Number(item.cylStartRange)
        : null,
    crossPower: item.crossPower !== null ? Number(item.crossPower) : null,
    axis: null,
    add: null,
    eye: null,
    quantity: item.quantity,
    createdAt: item.createdAt,
    brand: item.brand,
    item:
      resolveSingleVisionWholesaleItem(
        item.category,
        item.brand,
        item.item,
        Number(item.index),
        item.coating
      ) ?? item.item,
    coating: item.coating,
    category: item.category,
    index: Number(item.index),
    selectableRange: selectableRange ?? null,
  };
}

async function fetchSingleVision(
  where: Prisma.SingleVisionLensWhereInput,
  take?: number
): Promise<UnifiedLens[]> {
  const rows = dedupeSingleVisionLenses(
    await prisma.singleVisionLens.findMany({
      where,
      orderBy: { createdAt: "desc" },
      ...(take ? { take } : {}),
    })
  );
  return rows.map((row) => mapSingleVision(row));
}

function uniqueByJsonKey<T>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    const key = JSON.stringify(row);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(row);
  }
  return out;
}

async function attachSelectableRangesToPage(items: UnifiedLens[]): Promise<UnifiedLens[]> {
  if (items.length === 0) {
    return items;
  }

  const rangeById = new Map<string, SelectableRange>();
  const pageIds = new Set(items.map((item) => item.id));

  const singleVisionItems = items.filter((item) => item.lensType === "SINGLE_VISION");
  if (singleVisionItems.length > 0) {
    const productFilters = uniqueByJsonKey(
      singleVisionItems.map((lens) => ({
        category: lens.category ?? null,
        brand: lens.brand ?? "",
        item: lens.item ?? null,
        index: lens.index ?? 0,
        coating: lens.coating ?? "",
      }))
    );
    const siblings = dedupeSingleVisionLenses(
      await prisma.singleVisionLens.findMany({
        where: { OR: productFilters },
      })
    );
    for (const [id, range] of computeSelectableRangesForLenses(siblings)) {
      if (pageIds.has(id)) {
        rangeById.set(id, range);
      }
    }
  }

  const kryptokItems = items.filter((item) => item.lensType === "KRYPTOK");
  if (kryptokItems.length > 0) {
    const productFilters = uniqueByJsonKey(
      kryptokItems.map((lens) => ({
        category: lens.category ?? null,
        brand: lens.brand ?? null,
        coating: lens.coating ?? null,
      }))
    );
    const siblings = dedupeKryptokLenses(
      await prisma.kryptokLens.findMany({
        where: { OR: productFilters },
      })
    );
    const kryptokRanges = computeSelectableRangesForLensGroups(siblings, kryptokProductKey);
    for (const lens of siblings) {
      if (!pageIds.has(lens.id)) {
        continue;
      }
      const range = kryptokRanges.get(lens.id);
      if (range) {
        rangeById.set(lens.id, applyCompoundNoPlano(lens, range));
      }
    }
  }

  const progressiveItems = items.filter((item) => item.lensType === "PROGRESSIVE");
  if (progressiveItems.length > 0) {
    const pageLenses = await prisma.progressiveLens.findMany({
      where: { id: { in: progressiveItems.map((item) => item.id) } },
      select: {
        id: true,
        category: true,
        brand: true,
        item: true,
        index: true,
        type: true,
        coating: true,
      },
    });
    const productFilters = uniqueByJsonKey(
      pageLenses.map((lens) => ({
        category: lens.category,
        brand: lens.brand,
        item: lens.item,
        index: lens.index,
        type: lens.type,
        coating: lens.coating,
      }))
    );
    const siblings = dedupeProgressiveLenses(
      await prisma.progressiveLens.findMany({
        where: { OR: productFilters },
      })
    );
    const progressiveRanges = computeSelectableRangesForLensGroups(siblings, progressiveProductKey);
    for (const lens of siblings) {
      if (!pageIds.has(lens.id)) {
        continue;
      }
      const range = progressiveRanges.get(lens.id);
      if (range) {
        rangeById.set(lens.id, applyCompoundNoPlano(lens, range));
      }
    }
  }

  return items.map((item) =>
    rangeById.has(item.id)
      ? { ...item, selectableRange: rangeById.get(item.id) ?? null }
      : item
  );
}

function mergeWhere<T extends Record<string, unknown>>(base: T, extra: Record<string, unknown> | null): T {
  if (!extra) {
    return base;
  }
  const keys = Object.keys(base);
  if (keys.length === 0) {
    return extra as T;
  }
  return { AND: [base, extra] } as unknown as T;
}

function buildItemWhere(
  type: UnifiedLensType,
  itemName: string
): Prisma.KryptokLensWhereInput | Prisma.ProgressiveLensWhereInput | Prisma.SingleVisionLensWhereInput {
  const trimmed = itemName.trim();
  if (type === "KRYPTOK") {
    return buildKryptokWholesaleItemWhere(trimmed);
  }
  if (type === "PROGRESSIVE") {
    return buildProgressiveWholesaleItemWhere(trimmed);
  }
  if (type === "SINGLE_VISION") {
    return buildSingleVisionWholesaleItemWhere(trimmed);
  }
  return { item: trimmed };
}

export type LensSortOption =
  | "newest"
  | "price_asc"
  | "price_desc"
  | "stock_first"
  | "sph_asc";

const LENS_SORT_VALUES = new Set<LensSortOption>([
  "newest",
  "price_asc",
  "price_desc",
  "stock_first",
  "sph_asc",
]);

function parseLensSort(raw: string | null): LensSortOption | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase() as LensSortOption;
  return LENS_SORT_VALUES.has(value) ? value : null;
}

function isCustomLensSort(sort: LensSortOption | null | undefined): boolean {
  return Boolean(sort) && sort !== "newest";
}

type FetchUnifiedOptions = {
  offset?: number;
  limit?: number;
  sort?: LensSortOption;
};

function compareNullableNumber(
  a: number | null | undefined,
  b: number | null | undefined,
  direction: 1 | -1
): number {
  const aMissing = a === null || a === undefined || !Number.isFinite(Number(a));
  const bMissing = b === null || b === undefined || !Number.isFinite(Number(b));
  if (aMissing && bMissing) return 0;
  if (aMissing) return 1;
  if (bMissing) return -1;
  return (Number(a) - Number(b)) * direction;
}

function compareUnifiedLenses(
  a: UnifiedLens,
  b: UnifiedLens,
  sort: LensSortOption | null
): number {
  switch (sort) {
    case "price_asc":
      return (
        compareNullableNumber(a.price, b.price, 1) ||
        b.createdAt.getTime() - a.createdAt.getTime()
      );
    case "price_desc":
      return (
        compareNullableNumber(a.price, b.price, -1) ||
        b.createdAt.getTime() - a.createdAt.getTime()
      );
    case "stock_first": {
      const aInStock = Number(a.quantity) > 0 ? 0 : 1;
      const bInStock = Number(b.quantity) > 0 ? 0 : 1;
      return (
        aInStock - bInStock ||
        compareNullableNumber(a.price, b.price, 1) ||
        b.createdAt.getTime() - a.createdAt.getTime()
      );
    }
    case "sph_asc":
      return (
        compareNullableNumber(a.sph, b.sph, 1) ||
        compareNullableNumber(a.cyl, b.cyl, 1) ||
        compareNullableNumber(a.price, b.price, 1) ||
        b.createdAt.getTime() - a.createdAt.getTime()
      );
    case "newest":
    default:
      return b.createdAt.getTime() - a.createdAt.getTime();
  }
}

function buildCoatingWhere(coating?: string): { coating: { equals: string; mode: "insensitive" } } | null {
  const trimmed = coating?.trim() ?? "";
  if (!trimmed) return null;
  return { coating: { equals: trimmed, mode: "insensitive" } };
}

function buildFetchContext(
  type: UnifiedLensType | "ALL",
  search: string,
  itemName?: string,
  coating?: string,
  powerShape?: PowerShapeFilter | null
) {
  const wholesale = resolveWholesaleShopSearch(search, type);
  const isCrossSearch = isCrossProductSearchTerm(wholesale.remainingText);
  const searchTerm = isCrossSearch ? "" : wholesale.remainingText;
  const trimmedItem = itemName?.trim() ?? "";
  const typesToFetch = new Set(getShopTypesToFetch(type, wholesale));
  if (isCrossSearch) {
    typesToFetch.delete("PROGRESSIVE");
  }
  const crossPowerWhere = isCrossSearch ? { crossPower: { not: null } } : null;
  const coatingWhere = buildCoatingWhere(coating);
  // sph is required on KT/progressive and optional on SV — null checks must match schema
  const powerShapeWhereByType = {
    kryptok: buildPowerShapeWhere(
      powerShape,
      powerShapeNullabilityForType("kryptok")
    ),
    progressive: buildPowerShapeWhere(
      powerShape,
      powerShapeNullabilityForType("progressive")
    ),
    singleVision: buildPowerShapeWhere(
      powerShape,
      powerShapeNullabilityForType("single-vision")
    ),
  };

  const resolveItemWhere = (lensType: UnifiedLensType) => {
    if (trimmedItem) {
      return buildItemWhere(lensType, trimmedItem);
    }
    const wholesaleItem = wholesale.itemFilters[lensType];
    if (wholesaleItem) {
      return buildWholesaleItemWhere(lensType, wholesaleItem);
    }
    return null;
  };

  const withListFilters = (
    base: Record<string, unknown>,
    powerShapeWhere: Record<string, unknown> | null
  ) => mergeWhere(mergeWhere(base, coatingWhere), powerShapeWhere);

  return {
    isCrossSearch,
    typesToFetch,
    crossPowerWhere,
    resolveItemWhere,
    kryptokWhere: mergeWhere(
      withListFilters(
        mergeWhere(buildKryptokWhere(searchTerm), resolveItemWhere("KRYPTOK")) as Record<
          string,
          unknown
        >,
        powerShapeWhereByType.kryptok
      ),
      crossPowerWhere
    ),
    progressiveWhere: withListFilters(
      mergeWhere(buildProgressiveWhere(searchTerm), resolveItemWhere("PROGRESSIVE")) as Record<
        string,
        unknown
      >,
      powerShapeWhereByType.progressive
    ),
    singleVisionWhere: mergeWhere(
      withListFilters(
        mergeWhere(buildSingleVisionWhere(searchTerm), resolveItemWhere("SINGLE_VISION")) as Record<
          string,
          unknown
        >,
        powerShapeWhereByType.singleVision
      ),
      crossPowerWhere
    ),
  };
}

async function countUnifiedLenses(
  type: UnifiedLensType | "ALL",
  search: string,
  itemName?: string,
  coating?: string,
  powerShape?: PowerShapeFilter | null
): Promise<number> {
  const ctx = buildFetchContext(type, search, itemName, coating, powerShape);
  const tasks: Promise<number>[] = [];

  if (ctx.typesToFetch.has("KRYPTOK")) {
    tasks.push(prisma.kryptokLens.count({ where: ctx.kryptokWhere }));
  }
  if (ctx.typesToFetch.has("PROGRESSIVE")) {
    tasks.push(prisma.progressiveLens.count({ where: ctx.progressiveWhere }));
  }
  if (ctx.typesToFetch.has("SINGLE_VISION")) {
    tasks.push(prisma.singleVisionLens.count({ where: ctx.singleVisionWhere }));
  }

  const counts = await Promise.all(tasks);
  return counts.reduce((sum, count) => sum + count, 0);
}

/** SPH/CYL pair from a pure power search (e.g. -0.25/-0.25), else null. */
function extractSphCylSearchTarget(search: string): SphCylPower | null {
  const trimmed = search.trim();
  if (!trimmed) return null;
  const wholesale = resolveWholesaleShopSearch(trimmed, "ALL");
  const parsed = parseLensSearchTerm(wholesale.remainingText || trimmed);
  return parsed.sphCylPair;
}

function mergePowerCandidateWhere(
  base: Record<string, unknown>,
  nearWhere: Record<string, unknown>
): Record<string, unknown> {
  return mergeWhere(base, nearWhere) as Record<string, unknown>;
}

/**
 * When exact SPH/CYL stock is missing: find range-covering or nearest endpoint
 * powers within CATALOG_POWER_MAX_DISTANCE, ranked by distance.
 */
async function fetchNearestPowerLenses(
  type: UnifiedLensType | "ALL",
  target: SphCylPower,
  itemName?: string,
  options: FetchUnifiedOptions = {},
  coating?: string,
  powerShape?: PowerShapeFilter | null
): Promise<{ items: UnifiedLens[]; total: number; powerMatch: PowerMatchMeta | null }> {
  // Empty search avoids exact sph/cyl equality filters; near/range OR is merged in.
  const ctx = buildFetchContext(type, "", itemName, coating, powerShape);
  const nearWhere = buildNearOrRangePowerWhere(target, CATALOG_POWER_MAX_DISTANCE);
  const offset = Math.max(0, options.offset ?? 0);
  const limit = options.limit;
  const sort = options.sort ?? null;

  const tasks: Promise<UnifiedLens[]>[] = [];

  if (ctx.typesToFetch.has("KRYPTOK")) {
    const where = mergePowerCandidateWhere(
      ctx.kryptokWhere as Record<string, unknown>,
      nearWhere
    );
    tasks.push(
      prisma.kryptokLens
        .findMany({
          where: where as Prisma.KryptokLensWhereInput,
          orderBy: { createdAt: "desc" },
          take: 2000,
        })
        .then((items) => dedupeKryptokLenses(items).map((item) => mapKryptok(item)))
    );
  }

  if (ctx.typesToFetch.has("PROGRESSIVE")) {
    const where = mergePowerCandidateWhere(
      ctx.progressiveWhere as Record<string, unknown>,
      nearWhere
    );
    tasks.push(
      prisma.progressiveLens
        .findMany({
          where: where as Prisma.ProgressiveLensWhereInput,
          orderBy: { createdAt: "desc" },
          take: 2000,
        })
        .then((items) =>
          dedupeProgressiveLenses(items).map((item) => mapProgressive(item))
        )
    );
  }

  if (ctx.typesToFetch.has("SINGLE_VISION")) {
    const where = mergePowerCandidateWhere(
      ctx.singleVisionWhere as Record<string, unknown>,
      nearWhere
    );
    tasks.push(fetchSingleVision(where as Prisma.SingleVisionLensWhereInput, 2000));
  }

  const groups = await Promise.all(tasks);
  const scored: Array<{ lens: UnifiedLens; score: NonNullable<ReturnType<typeof scoreCatalogPowerMatch>> }> =
    [];

  for (const lens of groups.flat()) {
    const score = scoreCatalogPowerMatch(
      {
        id: lens.id,
        sph: lens.sph,
        sphStartRange: lens.sphStartRange,
        cyl: lens.cyl,
        cylStartRange: lens.cylStartRange,
        crossPower: lens.crossPower,
        price: lens.price,
      },
      target,
      CATALOG_POWER_MAX_DISTANCE
    );
    if (score) {
      scored.push({ lens, score });
    }
  }

  scored.sort((a, b) => {
    const byPower = compareCatalogPowerScores(a.score, b.score);
    if (byPower !== 0) return byPower;
    return compareUnifiedLenses(a.lens, b.lens, sort);
  });

  const powerMatch = resolvePowerMatchMeta(
    scored.map((row) => row.score),
    target
  );
  const ranked = scored.map((row) => row.lens);
  const total = ranked.length;

  if (limit !== undefined) {
    return {
      items: ranked.slice(offset, offset + limit),
      total,
      powerMatch,
    };
  }

  return { items: ranked, total, powerMatch };
}

async function fetchUnifiedLenses(
  type: UnifiedLensType | "ALL",
  search: string,
  itemName?: string,
  options: FetchUnifiedOptions = {},
  coating?: string,
  powerShape?: PowerShapeFilter | null
): Promise<UnifiedLens[]> {
  const ctx = buildFetchContext(type, search, itemName, coating, powerShape);
  const offset = Math.max(0, options.offset ?? 0);
  const limit = options.limit;
  const sort = options.sort ?? null;
  const customSort = isCustomLensSort(sort);
  // Custom sort needs the full matching set for correct global order.
  // Newest/default keeps fetchCap for performance (already ordered by createdAt).
  const fetchCap =
    customSort || limit === undefined
      ? undefined
      : Math.min(Math.max((offset + limit) * 5, limit), 2000);
  const tasks: Promise<UnifiedLens[]>[] = [];

  if (ctx.typesToFetch.has("KRYPTOK")) {
    tasks.push(
      prisma.kryptokLens
        .findMany({
          where: ctx.kryptokWhere,
          orderBy: { createdAt: "desc" },
          ...(fetchCap ? { take: fetchCap } : {}),
        })
        .then((items) => dedupeKryptokLenses(items).map((item) => mapKryptok(item)))
    );
  }

  if (ctx.typesToFetch.has("PROGRESSIVE")) {
    tasks.push(
      prisma.progressiveLens
        .findMany({
          where: ctx.progressiveWhere,
          orderBy: { createdAt: "desc" },
          ...(fetchCap ? { take: fetchCap } : {}),
        })
        .then((items) => dedupeProgressiveLenses(items).map((item) => mapProgressive(item)))
    );
  }

  if (ctx.typesToFetch.has("SINGLE_VISION")) {
    tasks.push(fetchSingleVision(ctx.singleVisionWhere, fetchCap));
  }

  const groups = await Promise.all(tasks);
  let results = groups.flat().sort((a, b) => compareUnifiedLenses(a, b, sort));

  if (ctx.isCrossSearch) {
    results = results.filter(hasCrossPower);
  }

  if (limit !== undefined) {
    return results.slice(offset, offset + limit);
  }

  return results;
}

// GET /api/lenses
// Query params:
//   page (default 1), limit (default 21), type (all|kryptok|progressive|single-vision),
//   search, item, coating, powerShape (sph|cyl|compound), sort
// Legacy response (no params): { kryptok, progressive, singleVision }
export async function GET(req: NextRequest) {
  const session = getSession(req);
  if (session?.role === "EMPLOYEE") {
    const gate = await requireStaffPermission(session, "inventory.view");
    if ("error" in gate) return gate.error;
  }

  try {
    const { searchParams } = new URL(req.url);
    const hasPaginationParams =
      searchParams.has("page") ||
      searchParams.has("limit") ||
      searchParams.has("type") ||
      searchParams.has("search") ||
      searchParams.has("sort") ||
      searchParams.has("item") ||
      searchParams.has("coating") ||
      searchParams.has("powerShape");

    if (!hasPaginationParams) {
      const [kryptokLenses, progressiveLenses, singleVisionLenses] = await Promise.all([
        prisma.kryptokLens.findMany(),
        prisma.progressiveLens.findMany(),
        prisma.singleVisionLens.findMany(),
      ]);

      return NextResponse.json({
        kryptok: kryptokLenses,
        progressive: progressiveLenses,
        singleVision: singleVisionLenses,
      });
    }

    const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
    const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit") ?? "21") || 21));
    const typeParam = (searchParams.get("type") ?? "all").toLowerCase();
    const type = TYPE_MAP[typeParam] ?? "ALL";
    const search = searchParams.get("search") ?? "";
    const item = searchParams.get("item") ?? "";
    const coating = searchParams.get("coating")?.trim() || undefined;
    const powerShape = parsePowerShapeFilter(searchParams.get("powerShape"));
    const sort = parseLensSort(searchParams.get("sort"));

    const offset = (page - 1) * limit;
    const powerTarget = extractSphCylSearchTarget(search);
    let total: number;
    let pageItems: UnifiedLens[];
    let powerMatch: PowerMatchMeta | null = null;

    if (powerTarget) {
      const exactTotal = await countUnifiedLenses(
        type,
        search,
        item || undefined,
        coating,
        powerShape
      );

      if (exactTotal > 0) {
        total = exactTotal;
        pageItems = await fetchUnifiedLenses(
          type,
          search,
          item || undefined,
          { offset, limit, sort: sort ?? undefined },
          coating,
          powerShape
        );
        powerMatch = {
          mode: "exact",
          querySph: powerTarget.sph,
          queryCyl: powerTarget.cyl,
        };
      } else {
        const nearest = await fetchNearestPowerLenses(
          type,
          powerTarget,
          item || undefined,
          { offset, limit, sort: sort ?? undefined },
          coating,
          powerShape
        );
        total = nearest.total;
        pageItems = nearest.items;
        powerMatch = nearest.powerMatch;
      }
    } else {
      const [counted, fetched] = await Promise.all([
        countUnifiedLenses(type, search, item || undefined, coating, powerShape),
        fetchUnifiedLenses(
          type,
          search,
          item || undefined,
          { offset, limit, sort: sort ?? undefined },
          coating,
          powerShape
        ),
      ]);
      total = counted;
      pageItems = fetched;
    }

    const items = await attachLensTypeImageUrls(
      await attachSelectableRangesToPage(pageItems)
    );

    return NextResponse.json({
      items,
      total,
      page,
      limit,
      hasMore: offset + limit < total,
      ...(powerMatch ? { powerMatch } : {}),
    });
  } catch (error) {
    console.error("Error fetching lenses:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
