import {
  AlternateAvailability,
  AlternateSuggestionStatus,
  CartLineType,
  LensType,
  type Order,
  type OrderPowerVersion,
} from "@prisma/client";
import { getAlternatePowerSettings } from "./alternate-power-settings";
import { getAvailableQuantity } from "./order-inventory";
import { prisma } from "./prisma";
import {
  findKryptokSiblings,
  findProgressiveSiblings,
  findSingleVisionSiblings,
  isSameLensPower,
} from "./related-lenses";

export type AlternateCandidate = {
  lensId: string;
  lensType: LensType;
  sph: number;
  cyl: number | null;
  axis: number | null;
  add: number | null;
  eye: string | null;
  quantity: number;
  distanceScore: number;
  availability: AlternateAvailability;
  etaDays: number | null;
  matchKind: "SAME_PRODUCT" | "SIMILAR_PRODUCT";
};

function toNum(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function powerDistance(
  a: { sph: number; cyl: number | null },
  b: { sph: number; cyl: number | null }
): number {
  return Math.abs(a.sph - b.sph) + Math.abs((a.cyl ?? 0) - (b.cyl ?? 0));
}

function withinConfiguredDelta(
  sph: number,
  cyl: number | null,
  current: { sph: number; cyl: number | null },
  maxSphDelta: number,
  maxCylDelta: number
): boolean {
  const sphDelta = Math.abs(sph - current.sph);
  const cylDelta = Math.abs((cyl ?? 0) - (current.cyl ?? 0));
  return sphDelta <= maxSphDelta + 1e-9 && cylDelta <= maxCylDelta + 1e-9;
}

type SiblingRow = {
  id: string;
  sph: unknown;
  cyl?: unknown | null;
  axis?: unknown | null;
  add?: unknown | null;
  eye?: unknown | null;
  quantity: number;
  brand?: string | null;
  item?: string | null;
  coating?: string | null;
  index?: unknown;
  category?: string | null;
};

async function loadSameProductSiblings(
  lensType: LensType,
  lensId: string
): Promise<SiblingRow[]> {
  if (lensType === LensType.SINGLE_VISION) {
    const { siblings } = await findSingleVisionSiblings(lensId);
    return siblings;
  }
  if (lensType === LensType.KRYPTOK) {
    const { siblings } = await findKryptokSiblings(lensId);
    return siblings;
  }
  if (lensType === LensType.PROGRESSIVE) {
    const { siblings } = await findProgressiveSiblings(lensId);
    return siblings;
  }
  return [];
}

/** Similar products: same brand (+ category when known). Used only if same product has no other powers. */
async function loadSimilarProductRows(
  lensType: LensType,
  lensId: string,
  excludeIds: string[]
): Promise<SiblingRow[]> {
  if (lensType === LensType.SINGLE_VISION) {
    const lens = await prisma.singleVisionLens.findUnique({ where: { id: lensId } });
    if (!lens) return [];
    return prisma.singleVisionLens.findMany({
      where: {
        brand: lens.brand,
        ...(lens.category ? { category: lens.category } : {}),
        id: { notIn: excludeIds.length ? excludeIds : [lensId] },
      },
      orderBy: { createdAt: "desc" },
      take: 400,
    });
  }
  if (lensType === LensType.KRYPTOK) {
    const lens = await prisma.kryptokLens.findUnique({ where: { id: lensId } });
    if (!lens) return [];
    return prisma.kryptokLens.findMany({
      where: {
        brand: lens.brand,
        ...(lens.category ? { category: lens.category } : {}),
        id: { notIn: excludeIds.length ? excludeIds : [lensId] },
      },
      orderBy: { createdAt: "desc" },
      take: 400,
    });
  }
  if (lensType === LensType.PROGRESSIVE) {
    const lens = await prisma.progressiveLens.findUnique({ where: { id: lensId } });
    if (!lens) return [];
    return prisma.progressiveLens.findMany({
      where: {
        brand: lens.brand,
        ...(lens.category ? { category: lens.category } : {}),
        id: { notIn: excludeIds.length ? excludeIds : [lensId] },
      },
      orderBy: { createdAt: "desc" },
      take: 400,
    });
  }
  return [];
}

function sortCandidates(
  candidates: AlternateCandidate[],
  preferWarehouse: boolean
): AlternateCandidate[] {
  return [...candidates].sort((a, b) => {
    const kindRank = (k: AlternateCandidate["matchKind"]) =>
      k === "SAME_PRODUCT" ? 0 : 1;
    const byKind = kindRank(a.matchKind) - kindRank(b.matchKind);
    if (byKind !== 0) return byKind;

    // Distance first within preferred/fill pools so nearest powers win.
    const byDistance = a.distanceScore - b.distanceScore;
    if (Math.abs(byDistance) > 1e-9) return byDistance;

    if (preferWarehouse) {
      const stockRank = (availability: AlternateAvailability) => {
        if (availability === AlternateAvailability.WAREHOUSE) return 0;
        if (availability === AlternateAvailability.OUT_OF_STOCK) return 1;
        return 2;
      };
      return stockRank(a.availability) - stockRank(b.availability);
    }
    return 0;
  });
}

/**
 * Map catalog rows to candidates.
 * Stock never gates visibility — qty only sets WAREHOUSE vs OUT_OF_STOCK.
 */
async function toCandidates(
  rows: SiblingRow[],
  input: {
    lensType: LensType;
    lensId: string;
    quantity: number;
    current: { sph: number; cyl: number | null };
    eye: string | null;
    matchKind: AlternateCandidate["matchKind"];
    seenPowers: Set<string>;
    /** When set, drop candidates beyond this combined distance. */
    maxDistanceScore?: number | null;
  }
): Promise<AlternateCandidate[]> {
  const out: AlternateCandidate[] = [];

  for (const row of rows) {
    const sph = toNum(row.sph);
    if (sph === null) continue;
    const cyl = toNum(row.cyl ?? null);

    if (
      isSameLensPower(
        { id: row.id, sph, cyl },
        { id: input.lensId, sph: input.current.sph, cyl: input.current.cyl }
      )
    ) {
      continue;
    }

    const distanceScore = powerDistance({ sph, cyl }, input.current);
    if (
      input.maxDistanceScore != null &&
      distanceScore > input.maxDistanceScore + 1e-9
    ) {
      continue;
    }

    const powerKey = `${sph}|${cyl ?? ""}`;
    if (input.seenPowers.has(powerKey)) continue;
    input.seenPowers.add(powerKey);

    const available = await getAvailableQuantity(
      input.lensType,
      row.id,
      Number(row.quantity)
    );
    const inStock = available >= input.quantity;

    out.push({
      lensId: row.id,
      lensType: input.lensType,
      sph,
      cyl,
      axis: toNum(row.axis ?? null) !== null ? Math.round(toNum(row.axis)!) : null,
      add: toNum(row.add ?? null),
      eye:
        typeof row.eye === "string" && row.eye.trim()
          ? row.eye.trim()
          : input.eye,
      quantity: Number(row.quantity),
      distanceScore,
      availability: inStock
        ? AlternateAvailability.WAREHOUSE
        : AlternateAvailability.OUT_OF_STOCK,
      etaDays: null,
      matchKind: input.matchKind,
    });
  }

  return out;
}

/**
 * Same product preferred (±delta), then nearest same-product fill under hardMaxDistanceScore.
 * Similar product only if same product has no other powers.
 * Zero / low stock still appears as OUT_OF_STOCK.
 */
export async function findWarehouseAlternateCandidates(
  order: Pick<Order, "lensType" | "quantity"> & {
    sph?: unknown;
    cyl?: unknown | null;
    axis?: unknown | null;
    add?: unknown | null;
    eye?: string | null;
  },
  lensId: string
): Promise<AlternateCandidate[]> {
  const settings = await getAlternatePowerSettings();
  const currentSph = toNum(order.sph);
  if (currentSph === null) return [];

  const current = {
    sph: currentSph,
    cyl: toNum(order.cyl),
  };

  const sameProductRows = await loadSameProductSiblings(order.lensType, lensId);
  const hasOtherSameProductPower = sameProductRows.some((row) => {
    const sph = toNum(row.sph);
    if (sph === null) return false;
    const cyl = toNum(row.cyl ?? null);
    return !isSameLensPower(
      { id: row.id, sph, cyl },
      { id: lensId, sph: current.sph, cyl: current.cyl }
    );
  });

  const sourceRows = hasOtherSameProductPower
    ? sameProductRows
    : await loadSimilarProductRows(order.lensType, lensId, [
        lensId,
        ...sameProductRows.map((r) => r.id),
      ]);
  const matchKind: AlternateCandidate["matchKind"] = hasOtherSameProductPower
    ? "SAME_PRODUCT"
    : "SIMILAR_PRODUCT";

  const seenPowers = new Set<string>();
  const allUnderHardMax = await toCandidates(sourceRows, {
    lensType: order.lensType,
    lensId,
    quantity: order.quantity,
    current,
    eye: order.eye ?? null,
    matchKind,
    seenPowers,
    maxDistanceScore: settings.hardMaxDistanceScore,
  });

  const preferred = allUnderHardMax.filter((c) =>
    withinConfiguredDelta(
      c.sph,
      c.cyl,
      current,
      settings.maxSphDelta,
      settings.maxCylDelta
    )
  );
  const preferredKeys = new Set(preferred.map((c) => `${c.sph}|${c.cyl ?? ""}`));
  const fill = allUnderHardMax.filter(
    (c) => !preferredKeys.has(`${c.sph}|${c.cyl ?? ""}`)
  );

  const rankedPreferred = sortCandidates(preferred, settings.preferWarehouse);
  const rankedFill = sortCandidates(fill, settings.preferWarehouse);
  const merged = [...rankedPreferred, ...rankedFill];

  // When preferWarehouse, re-rank within preferred band: warehouse first, then by distance.
  if (settings.preferWarehouse && rankedPreferred.length > 0) {
    const stockThenDistance = (list: AlternateCandidate[]) =>
      [...list].sort((a, b) => {
        const rank = (av: AlternateAvailability) =>
          av === AlternateAvailability.WAREHOUSE ? 0 : 1;
        const byStock = rank(a.availability) - rank(b.availability);
        if (byStock !== 0) return byStock;
        return a.distanceScore - b.distanceScore;
      });
    return [
      ...stockThenDistance(rankedPreferred),
      ...stockThenDistance(rankedFill),
    ].slice(0, settings.maxSuggestions);
  }

  return merged.slice(0, settings.maxSuggestions);
}

export type SupplierProcurableInput = {
  lensId: string;
  etaDays?: number | null;
  sph?: number;
  cyl?: number | null;
};

/**
 * Persist warehouse suggestions (+ optional staff-confirmed supplier options) for an NA version.
 */
export async function createAlternateSuggestionsForVersion(input: {
  order: Order;
  version: OrderPowerVersion;
  lensId: string;
  supplierOptions?: SupplierProcurableInput[];
}) {
  const settings = await getAlternatePowerSettings();
  const referenceOrder = {
    ...input.order,
    sph: input.version.sph ?? input.order.sph,
    cyl: input.version.cyl ?? input.order.cyl,
    axis: input.version.axis ?? input.order.axis,
    add: input.version.add ?? input.order.add,
    eye: input.version.eye ?? input.order.eye,
  };
  const warehouse = await findWarehouseAlternateCandidates(
    referenceOrder,
    input.lensId
  );

  await prisma.alternatePowerSuggestion.updateMany({
    where: {
      orderId: input.order.id,
      status: AlternateSuggestionStatus.PENDING,
    },
    data: { status: AlternateSuggestionStatus.EXPIRED },
  });

  const rows: Array<{
    orderId: string;
    forVersionId: string;
    sph: number;
    cyl: number | null;
    axis: number | null;
    add: number | null;
    eye: string | null;
    lensType: LensType;
    lensId: string;
    availability: AlternateAvailability;
    etaDays: number | null;
    distanceScore: number;
  }> = warehouse.map((c) => ({
    orderId: input.order.id,
    forVersionId: input.version.id,
    sph: c.sph,
    cyl: c.cyl,
    axis: c.axis,
    add: c.add,
    eye: c.eye,
    lensType: c.lensType,
    lensId: c.lensId,
    availability: c.availability,
    etaDays: null,
    distanceScore: c.distanceScore,
  }));

  const currentSph = toNum(input.version.sph) ?? toNum(input.order.sph);
  const currentCyl = toNum(input.version.cyl) ?? toNum(input.order.cyl);
  const seen = new Set(rows.map((r) => r.lensId));
  const current = {
    sph: currentSph ?? 0,
    cyl: currentCyl,
  };

  for (const opt of input.supplierOptions ?? []) {
    if (!opt.lensId || seen.has(opt.lensId)) continue;

    let lens: SiblingRow | null =
      (await loadSameProductSiblings(input.order.lensType, input.lensId)).find(
        (s) => s.id === opt.lensId
      ) ?? null;

    if (!lens) {
      const similar = await loadSimilarProductRows(input.order.lensType, input.lensId, [
        input.lensId,
      ]);
      lens = similar.find((s) => s.id === opt.lensId) ?? null;
    }
    if (!lens) {
      if (input.order.lensType === LensType.SINGLE_VISION) {
        lens = await prisma.singleVisionLens.findUnique({ where: { id: opt.lensId } });
      } else if (input.order.lensType === LensType.KRYPTOK) {
        lens = await prisma.kryptokLens.findUnique({ where: { id: opt.lensId } });
      } else if (input.order.lensType === LensType.PROGRESSIVE) {
        lens = await prisma.progressiveLens.findUnique({ where: { id: opt.lensId } });
      }
    }
    if (!lens) continue;

    const sph = opt.sph ?? toNum(lens.sph);
    if (sph === null || currentSph === null) continue;
    const cyl = opt.cyl !== undefined ? opt.cyl : toNum(lens.cyl ?? null);

    if (
      isSameLensPower(
        { id: opt.lensId, sph, cyl },
        { id: input.lensId, sph: currentSph, cyl: currentCyl }
      )
    ) {
      continue;
    }

    const distanceScore = powerDistance({ sph, cyl }, current);
    if (distanceScore > settings.hardMaxDistanceScore + 1e-9) {
      continue;
    }

    seen.add(opt.lensId);
    rows.push({
      orderId: input.order.id,
      forVersionId: input.version.id,
      sph,
      cyl,
      axis: toNum(lens.axis ?? null) !== null ? Math.round(toNum(lens.axis)!) : null,
      add: toNum(lens.add ?? null),
      eye:
        typeof lens.eye === "string" && lens.eye.trim()
          ? lens.eye.trim()
          : input.order.eye ?? null,
      lensType: input.order.lensType,
      lensId: opt.lensId,
      availability: AlternateAvailability.SUPPLIER,
      etaDays:
        opt.etaDays !== undefined &&
        opt.etaDays !== null &&
        Number.isFinite(Number(opt.etaDays))
          ? Math.max(0, Math.floor(Number(opt.etaDays)))
          : 2,
      distanceScore,
    });
  }

  rows.sort((a, b) => {
    const rank = (availability: AlternateAvailability) => {
      if (availability === AlternateAvailability.WAREHOUSE) return 0;
      if (availability === AlternateAvailability.SUPPLIER) return 1;
      if (availability === AlternateAvailability.OUT_OF_STOCK) return 2;
      return 3;
    };
    if (settings.preferWarehouse) {
      const byAvailability = rank(a.availability) - rank(b.availability);
      if (byAvailability !== 0) return byAvailability;
    }
    return a.distanceScore - b.distanceScore;
  });

  const limited = rows.slice(0, settings.maxSuggestions);
  if (limited.length === 0) {
    return [];
  }

  await prisma.alternatePowerSuggestion.createMany({
    data: limited,
  });

  return prisma.alternatePowerSuggestion.findMany({
    where: {
      orderId: input.order.id,
      forVersionId: input.version.id,
      status: AlternateSuggestionStatus.PENDING,
    },
    orderBy: [{ availability: "asc" }, { distanceScore: "asc" }],
  });
}

export function assertRetailOrder(order: Pick<Order, "lineType">): void {
  if (order.lineType !== CartLineType.RETAIL) {
    throw new Error("Smart Alternate Power applies to retail orders only.");
  }
}
