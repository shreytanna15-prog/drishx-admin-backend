import { prisma } from "./prisma";
import { isHardcoatGradeCoating } from "./lens-power-shape-filter";
import { intersectCoatingsWithManagedLabels } from "./coating-filter-intersect";
import type { CatalogLensType } from "./catalog-product-lines";
import {
  CATALOG_LENS_TYPES,
  isCatalogLensType,
} from "./catalog-product-lines";

export type { CatalogLensType };
export { CATALOG_LENS_TYPES, isCatalogLensType };
export { intersectCoatingsWithManagedLabels };

export type CoatingFilterLabelRecord = {
  id: string;
  lensType: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type CoatingCount = { coating: string; count: number };

function normalizeCoatings(
  rows: Array<{ coating: string | null; count: number }>
): string[] {
  const byKey = new Map<string, CoatingCount>();

  for (const row of rows) {
    const raw = row.coating?.trim() ?? "";
    if (!raw || isHardcoatGradeCoating(raw)) continue;
    const key = raw.toLowerCase();
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { coating: raw, count: row.count });
      continue;
    }
    existing.count += row.count;
    if (row.count > existing.count - row.count) {
      existing.coating = raw;
    }
  }

  return Array.from(byKey.values())
    .map((entry) => entry.coating)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

/** Distinct color/surface coatings currently present on SKUs for a lens type. */
export async function loadDistinctProductCoatings(
  type: CatalogLensType
): Promise<string[]> {
  if (type === "single-vision") {
    const groups = await prisma.singleVisionLens.groupBy({
      by: ["coating"],
      _count: { _all: true },
    });
    return normalizeCoatings(
      groups.map((g) => ({ coating: g.coating, count: g._count._all }))
    );
  }

  if (type === "progressive") {
    const groups = await prisma.progressiveLens.groupBy({
      by: ["coating"],
      _count: { _all: true },
    });
    return normalizeCoatings(
      groups.map((g) => ({ coating: g.coating, count: g._count._all }))
    );
  }

  const groups = await prisma.kryptokLens.groupBy({
    by: ["coating"],
    where: { coating: { not: null } },
    _count: { _all: true },
  });
  return normalizeCoatings(
    groups.map((g) => ({ coating: g.coating, count: g._count._all }))
  );
}

/** Count SKUs whose coating matches the label name (case-insensitive). */
export async function countProductsForCoating(
  type: CatalogLensType,
  coatingName: string
): Promise<number> {
  const trimmed = coatingName.trim();
  if (!trimmed) return 0;

  const coatingWhere = {
    equals: trimmed,
    mode: "insensitive" as const,
  };

  if (type === "single-vision") {
    return prisma.singleVisionLens.count({
      where: { coating: coatingWhere },
    });
  }
  if (type === "progressive") {
    return prisma.progressiveLens.count({
      where: { coating: coatingWhere },
    });
  }
  return prisma.kryptokLens.count({
    where: { coating: coatingWhere },
  });
}

export async function listCoatingFilterLabels(
  type: CatalogLensType,
  options?: { includeInactive?: boolean }
): Promise<CoatingFilterLabelRecord[]> {
  const includeInactive = options?.includeInactive ?? true;
  return prisma.coatingFilterLabel.findMany({
    where: {
      lensType: type,
      ...(includeInactive ? {} : { isActive: true }),
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

export async function listActiveCoatingFilterNames(
  type: CatalogLensType
): Promise<string[]> {
  const rows = await prisma.coatingFilterLabel.findMany({
    where: { lensType: type, isActive: true },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { name: true },
  });
  return rows.map((row) => row.name);
}

export async function getCoatingFilterLabelById(
  id: string
): Promise<CoatingFilterLabelRecord | null> {
  return prisma.coatingFilterLabel.findUnique({ where: { id } });
}

export type CreateCoatingFilterLabelInput = {
  lensType: CatalogLensType;
  name: string;
  description?: string | null;
  sortOrder?: number;
};

export async function createCoatingFilterLabel(
  input: CreateCoatingFilterLabelInput
): Promise<CoatingFilterLabelRecord> {
  const name = input.name.trim();
  if (!name) {
    throw new Error("Name is required.");
  }
  if (isHardcoatGradeCoating(name)) {
    throw new Error(
      "Hardcoat grades (HC, HMC, etc.) cannot be used as coating filter chips."
    );
  }

  return prisma.coatingFilterLabel.create({
    data: {
      lensType: input.lensType,
      name,
      description: input.description?.trim() || null,
      sortOrder: input.sortOrder ?? 999,
      isActive: true,
      isSystem: false,
    },
  });
}

export type UpdateCoatingFilterLabelInput = {
  name?: string;
  description?: string | null;
  sortOrder?: number;
  isActive?: boolean;
};

export async function updateCoatingFilterLabel(
  id: string,
  input: UpdateCoatingFilterLabelInput
): Promise<CoatingFilterLabelRecord> {
  const existing = await getCoatingFilterLabelById(id);
  if (!existing) {
    throw new Error("Coating filter not found.");
  }
  if (!isCatalogLensType(existing.lensType)) {
    throw new Error("Invalid lens type on coating filter.");
  }

  const data: {
    name?: string;
    description?: string | null;
    sortOrder?: number;
    isActive?: boolean;
  } = {};

  let renamedTo: string | null = null;

  if (input.name !== undefined) {
    const nextName = input.name.trim();
    if (!nextName) {
      throw new Error("Name is required.");
    }
    if (isHardcoatGradeCoating(nextName)) {
      throw new Error(
        "Hardcoat grades (HC, HMC, etc.) cannot be used as coating filter chips."
      );
    }
    if (nextName.toLowerCase() !== existing.name.toLowerCase()) {
      renamedTo = nextName;
      data.name = nextName;
    } else if (nextName !== existing.name) {
      // Case-only change: rewrite SKUs to canonical casing and update label.
      renamedTo = nextName;
      data.name = nextName;
    }
  }

  if (input.description !== undefined) {
    data.description = input.description?.trim() || null;
  }
  if (input.sortOrder !== undefined) {
    data.sortOrder = input.sortOrder;
  }
  if (input.isActive !== undefined) {
    data.isActive = input.isActive;
  }

  if (renamedTo) {
    return prisma.$transaction(async (tx) => {
      await rewriteSkuCoatingsWithClient(
        tx,
        existing.lensType as CatalogLensType,
        existing.name,
        renamedTo
      );
      return tx.coatingFilterLabel.update({
        where: { id },
        data,
      });
    });
  }

  return prisma.coatingFilterLabel.update({
    where: { id },
    data,
  });
}

type TxClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function rewriteSkuCoatingsWithClient(
  client: TxClient | typeof prisma,
  type: CatalogLensType,
  fromName: string,
  toName: string
): Promise<number> {
  const from = fromName.trim();
  const to = toName.trim();
  if (!from || !to) return 0;

  const where = {
    coating: { equals: from, mode: "insensitive" as const },
  };

  if (type === "single-vision") {
    const result = await client.singleVisionLens.updateMany({
      where,
      data: { coating: to },
    });
    return result.count;
  }
  if (type === "progressive") {
    const result = await client.progressiveLens.updateMany({
      where,
      data: { coating: to },
    });
    return result.count;
  }
  const result = await client.kryptokLens.updateMany({
    where,
    data: { coating: to },
  });
  return result.count;
}

/**
 * Soft-deactivate a label. Hard-delete only custom labels with zero SKU usage.
 */
export async function deactivateOrDeleteCoatingFilterLabel(
  id: string,
  productCount: number,
  forceHardDelete: boolean
): Promise<{
  mode: "deactivated" | "deleted";
  line: CoatingFilterLabelRecord;
}> {
  const existing = await getCoatingFilterLabelById(id);
  if (!existing) {
    throw new Error("Coating filter not found.");
  }

  if (forceHardDelete) {
    if (existing.isSystem) {
      throw new Error("System coating filters cannot be permanently deleted.");
    }
    if (productCount > 0) {
      throw new Error(
        "Cannot permanently delete a coating filter that still has products. Deactivate instead."
      );
    }
    await prisma.coatingFilterLabel.delete({ where: { id } });
    return { mode: "deleted", line: existing };
  }

  const line = await prisma.coatingFilterLabel.update({
    where: { id },
    data: { isActive: false },
  });
  return { mode: "deactivated", line };
}

/**
 * Merge source into target: rewrite SKUs, deactivate/delete source.
 */
export async function mergeCoatingFilterLabels(
  sourceId: string,
  targetId: string
): Promise<{
  target: CoatingFilterLabelRecord;
  source: CoatingFilterLabelRecord;
  rewrittenCount: number;
}> {
  if (sourceId === targetId) {
    throw new Error("Source and target must be different coating filters.");
  }

  const source = await getCoatingFilterLabelById(sourceId);
  const target = await getCoatingFilterLabelById(targetId);
  if (!source || !target) {
    throw new Error("Coating filter not found.");
  }
  if (source.lensType !== target.lensType) {
    throw new Error("Cannot merge coating filters across different lens types.");
  }
  if (!isCatalogLensType(source.lensType)) {
    throw new Error("Invalid lens type on coating filter.");
  }

  const rewrittenCount = await prisma.$transaction(async (tx) => {
    const count = await rewriteSkuCoatingsWithClient(
      tx,
      source.lensType as CatalogLensType,
      source.name,
      target.name
    );

    if (source.isSystem) {
      await tx.coatingFilterLabel.update({
        where: { id: source.id },
        data: { isActive: false },
      });
    } else {
      await tx.coatingFilterLabel.delete({ where: { id: source.id } });
    }

    return count;
  });

  const refreshedTarget = await getCoatingFilterLabelById(targetId);
  if (!refreshedTarget) {
    throw new Error("Coating filter not found.");
  }

  return {
    target: refreshedTarget,
    source,
    rewrittenCount,
  };
}

/**
 * Upsert missing distinct product coatings as managed labels (idempotent).
 * Does not overwrite admin sortOrder / isActive on existing rows.
 */
export async function syncCoatingFilterLabelsFromProducts(
  type: CatalogLensType
): Promise<{ created: number; skipped: number }> {
  const coatings = await loadDistinctProductCoatings(type);
  const existing = await prisma.coatingFilterLabel.findMany({
    where: { lensType: type },
    select: { id: true, name: true },
  });
  const existingKeys = new Set(
    existing.map((row) => row.name.trim().toLowerCase())
  );

  let created = 0;
  let skipped = 0;
  const currentMaxSort = (
    await prisma.coatingFilterLabel.aggregate({
      where: { lensType: type },
      _max: { sortOrder: true },
    })
  )._max.sortOrder;

  let nextSort = (currentMaxSort ?? -1) + 1;

  for (const name of coatings) {
    const key = name.toLowerCase();
    if (existingKeys.has(key)) {
      skipped += 1;
      continue;
    }
    await prisma.coatingFilterLabel.create({
      data: {
        lensType: type,
        name,
        sortOrder: nextSort,
        isSystem: true,
        isActive: true,
      },
    });
    existingKeys.add(key);
    nextSort += 1;
    created += 1;
  }

  return { created, skipped };
}

/**
 * Ensure at least the current product coatings exist as labels.
 * Safe to call from admin list endpoints.
 */
export async function ensureCoatingFilterLabelsSynced(
  type: CatalogLensType
): Promise<void> {
  try {
    await syncCoatingFilterLabelsFromProducts(type);
  } catch (error) {
    console.warn("ensureCoatingFilterLabelsSynced failed:", error);
  }
}
