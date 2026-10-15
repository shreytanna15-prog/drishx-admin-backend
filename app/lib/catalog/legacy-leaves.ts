/**
 * RW-09 legacy lens discovery (DB reads) + re-exports of pure overlap helpers.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import {
  buildCatalogIdentityKey,
  type CatalogLensFamily,
  type CatalogProductIdentityInput,
} from "./product-identity";
import { lensRowToBounds } from "./range-math";
import type { LegacyLensLeaf, LegacyProductGroup } from "./legacy-leaves-types";

export type { LegacyLensLeaf, LegacyProductGroup } from "./legacy-leaves-types";
export {
  findLegacyOverlaps,
  type LegacyOverlapHit,
} from "./legacy-overlap-pure";

function num(v: Prisma.Decimal | number | null | undefined): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function identityFromRow(
  family: CatalogLensFamily,
  row: {
    category: string | null;
    brand: string;
    item?: string | null;
    index?: Prisma.Decimal | number | null;
    coating: string;
    type?: string | null;
  }
): string | null {
  try {
    const input: CatalogProductIdentityInput = {
      lensFamily: family,
      category: row.category,
      brand: row.brand,
      item: row.item ?? null,
      index: num(row.index ?? null),
      coating: row.coating,
      progressiveType: row.type ?? null,
    };
    return buildCatalogIdentityKey(input);
  } catch {
    return null;
  }
}

function mapSv(
  row: Awaited<ReturnType<typeof prisma.singleVisionLens.findMany>>[number]
): LegacyLensLeaf | null {
  const identityKey = identityFromRow("SINGLE_VISION", row);
  if (!identityKey) return null;
  const leaf: LegacyLensLeaf = {
    id: row.id,
    lensFamily: "SINGLE_VISION",
    category: row.category,
    brand: row.brand,
    item: row.item,
    index: num(row.index),
    coating: row.coating,
    progressiveType: null,
    sph: num(row.sph),
    sphStartRange: num(row.sphStartRange),
    cyl: num(row.cyl),
    cylStartRange: num(row.cylStartRange),
    crossPower: num(row.crossPower),
    add: null,
    axis: null,
    eye: null,
    price: Number(row.price),
    costPrice: num(row.costPrice),
    quantity: row.quantity,
    isDisabled: row.isDisabled,
    identityKey,
    bounds: null,
  };
  leaf.bounds = lensRowToBounds(leaf);
  return leaf;
}

function mapKt(
  row: Awaited<ReturnType<typeof prisma.kryptokLens.findMany>>[number]
): LegacyLensLeaf | null {
  if (!row.brand?.trim() || !row.coating?.trim()) return null;
  const identityKey = identityFromRow("KRYPTOK", {
    category: row.category,
    brand: row.brand,
    item: row.item,
    coating: row.coating,
  });
  if (!identityKey) return null;
  const leaf: LegacyLensLeaf = {
    id: row.id,
    lensFamily: "KRYPTOK",
    category: row.category,
    brand: row.brand,
    item: row.item,
    index: null,
    coating: row.coating,
    progressiveType: null,
    sph: num(row.sph),
    sphStartRange: num(row.sphStartRange),
    cyl: num(row.cyl),
    cylStartRange: num(row.cylStartRange),
    crossPower: num(row.crossPower),
    add: num(row.add),
    axis: row.axis,
    eye: null,
    price: Number(row.price),
    costPrice: num(row.costPrice),
    quantity: row.quantity,
    isDisabled: row.isDisabled,
    identityKey,
    bounds: null,
  };
  leaf.bounds = lensRowToBounds(leaf);
  return leaf;
}

function mapPg(
  row: Awaited<ReturnType<typeof prisma.progressiveLens.findMany>>[number]
): LegacyLensLeaf | null {
  const identityKey = identityFromRow("PROGRESSIVE", {
    category: row.category,
    brand: row.brand,
    item: row.item,
    index: row.index,
    coating: row.coating,
    type: row.type,
  });
  if (!identityKey) return null;
  const leaf: LegacyLensLeaf = {
    id: row.id,
    lensFamily: "PROGRESSIVE",
    category: row.category,
    brand: row.brand,
    item: row.item,
    index: num(row.index),
    coating: row.coating,
    progressiveType: row.type,
    sph: num(row.sph),
    sphStartRange: num(row.sphStartRange),
    cyl: num(row.cyl),
    cylStartRange: num(row.cylStartRange),
    crossPower: null,
    add: num(row.add),
    axis: row.axis,
    eye: row.eye,
    price: Number(row.price),
    costPrice: num(row.costPrice),
    quantity: row.quantity,
    isDisabled: row.isDisabled,
    identityKey,
    bounds: null,
  };
  leaf.bounds = lensRowToBounds(leaf);
  return leaf;
}

export async function findLegacyLeavesByIdentity(
  identity: CatalogProductIdentityInput
): Promise<LegacyLensLeaf[]> {
  const identityKey = buildCatalogIdentityKey(identity);
  const family = identity.lensFamily;

  if (family === "SINGLE_VISION") {
    const rows = await prisma.singleVisionLens.findMany({
      where: {
        brand: { equals: identity.brand.trim(), mode: "insensitive" },
        coating: { equals: identity.coating.trim(), mode: "insensitive" },
        index: identity.index ?? undefined,
        ...(identity.category?.trim()
          ? { category: { equals: identity.category.trim(), mode: "insensitive" } }
          : {}),
        ...(identity.item?.trim()
          ? { item: { equals: identity.item.trim(), mode: "insensitive" } }
          : { OR: [{ item: null }, { item: "" }] }),
      },
      take: 5000,
    });
    return rows.map(mapSv).filter((r): r is LegacyLensLeaf => r?.identityKey === identityKey);
  }

  if (family === "KRYPTOK") {
    const rows = await prisma.kryptokLens.findMany({
      where: {
        brand: { equals: identity.brand.trim(), mode: "insensitive" },
        coating: { equals: identity.coating.trim(), mode: "insensitive" },
        ...(identity.category?.trim()
          ? { category: { equals: identity.category.trim(), mode: "insensitive" } }
          : {}),
      },
      take: 5000,
    });
    return rows.map(mapKt).filter((r): r is LegacyLensLeaf => r?.identityKey === identityKey);
  }

  const rows = await prisma.progressiveLens.findMany({
    where: {
      brand: { equals: identity.brand.trim(), mode: "insensitive" },
      coating: { equals: identity.coating.trim(), mode: "insensitive" },
      item: identity.item?.trim() || undefined,
      type: identity.progressiveType?.trim() || undefined,
      index: identity.index ?? undefined,
      ...(identity.category?.trim()
        ? { category: { equals: identity.category.trim(), mode: "insensitive" } }
        : {}),
    },
    take: 5000,
  });
  return rows.map(mapPg).filter((r): r is LegacyLensLeaf => r?.identityKey === identityKey);
}

/** Group all SV/KT/PG leaves by identity key (for dry-run backfill / discovery). */
export async function discoverLegacyProductGroups(options?: {
  takePerFamily?: number;
}): Promise<LegacyProductGroup[]> {
  const take = options?.takePerFamily ?? 20000;
  const [sv, kt, pg] = await Promise.all([
    prisma.singleVisionLens.findMany({ take }),
    prisma.kryptokLens.findMany({ take }),
    prisma.progressiveLens.findMany({ take }),
  ]);

  const byKey = new Map<string, LegacyProductGroup>();
  const push = (leaf: LegacyLensLeaf | null) => {
    if (!leaf) return;
    const existing = byKey.get(leaf.identityKey);
    if (existing) {
      existing.leaves.push(leaf);
      existing.leafCount = existing.leaves.length;
      return;
    }
    byKey.set(leaf.identityKey, {
      identityKey: leaf.identityKey,
      lensFamily: leaf.lensFamily,
      category: leaf.category,
      brand: leaf.brand,
      item: leaf.item,
      index: leaf.index,
      coating: leaf.coating,
      progressiveType: leaf.progressiveType,
      leafCount: 1,
      leaves: [leaf],
    });
  };

  for (const r of sv) push(mapSv(r));
  for (const r of kt) push(mapKt(r));
  for (const r of pg) push(mapPg(r));

  return [...byKey.values()].sort((a, b) =>
    a.identityKey.localeCompare(b.identityKey)
  );
}
