import { prisma } from "./prisma";
import {
  isSameSphCylPower,
  powerDistance as sharedPowerDistance,
  toPowerNumber,
} from "./power-distance";
import {
  dedupeKryptokLenses,
  dedupeProgressiveLenses,
  dedupeSingleVisionLenses,
} from "./resolve-lens-stock";

/** Prisma rows use Decimal for sph/cyl; callers may also pass plain numbers. */
export type RelatedLensCandidate = {
  id: string;
  sph: unknown;
  cyl?: unknown | null;
};

function normalizeSph(sph: unknown): number {
  return Number(sph);
}

function normalizeCyl(cyl: unknown | null | undefined): number | null {
  return toPowerNumber(cyl);
}

function powerDistance(
  a: RelatedLensCandidate,
  b: RelatedLensCandidate
): number {
  return sharedPowerDistance(
    { sph: normalizeSph(a.sph), cyl: normalizeCyl(a.cyl) },
    { sph: normalizeSph(b.sph), cyl: normalizeCyl(b.cyl) }
  );
}

export function isSameLensPower(
  a: RelatedLensCandidate,
  b: RelatedLensCandidate
): boolean {
  return isSameSphCylPower(
    { sph: normalizeSph(a.sph), cyl: normalizeCyl(a.cyl) },
    { sph: normalizeSph(b.sph), cyl: normalizeCyl(b.cyl) }
  );
}

function hasDifferentPower(
  a: RelatedLensCandidate,
  b: RelatedLensCandidate
): boolean {
  return !isSameLensPower(a, b);
}

/** Pick up to `limit` lenses with different SPH/CYL than the current row (never the same power). */
export function pickRelatedLenses<T extends RelatedLensCandidate>(
  candidates: T[],
  current: RelatedLensCandidate,
  limit = 5
): T[] {
  const others = candidates.filter(
    (row) => row.id !== current.id && hasDifferentPower(row, current)
  );
  if (others.length === 0) {
    return [];
  }

  const seenPower = new Set<string>();
  const picked: T[] = [];

  for (const row of [...others].sort(
    (a, b) => powerDistance(a, current) - powerDistance(b, current)
  )) {
    const key = `${normalizeSph(row.sph)}|${normalizeCyl(row.cyl) ?? ""}`;
    if (seenPower.has(key)) {
      continue;
    }
    seenPower.add(key);
    picked.push(row);
    if (picked.length >= limit) {
      break;
    }
  }

  return picked;
}

export async function findKryptokSiblings(lensId: string) {
  const lens = await prisma.kryptokLens.findUnique({ where: { id: lensId } });
  if (!lens) {
    return { lens: null, siblings: [] as Awaited<ReturnType<typeof prisma.kryptokLens.findMany>> };
  }

  const siblings = dedupeKryptokLenses(
    await prisma.kryptokLens.findMany({
      where: {
        category: lens.category,
        brand: lens.brand,
        coating: lens.coating,
        isDisabled: false,
      },
      orderBy: { createdAt: "desc" },
    })
  );

  return { lens, siblings };
}

export async function findProgressiveSiblings(lensId: string) {
  const lens = await prisma.progressiveLens.findUnique({ where: { id: lensId } });
  if (!lens) {
    return { lens: null, siblings: [] as Awaited<ReturnType<typeof prisma.progressiveLens.findMany>> };
  }

  const siblings = dedupeProgressiveLenses(
    await prisma.progressiveLens.findMany({
      where: {
        category: lens.category,
        brand: lens.brand,
        item: lens.item,
        coating: lens.coating,
        index: lens.index,
        type: lens.type,
        isDisabled: false,
      },
      orderBy: { createdAt: "desc" },
    })
  );

  return { lens, siblings };
}

export async function findSingleVisionSiblings(lensId: string) {
  const lens = await prisma.singleVisionLens.findUnique({ where: { id: lensId } });
  if (!lens) {
    return { lens: null, siblings: [] as Awaited<ReturnType<typeof prisma.singleVisionLens.findMany>> };
  }

  const siblings = dedupeSingleVisionLenses(
    await prisma.singleVisionLens.findMany({
      where: {
        category: lens.category,
        brand: lens.brand,
        item: lens.item,
        coating: lens.coating,
        index: lens.index,
        isDisabled: false,
      },
      orderBy: { createdAt: "desc" },
    })
  );

  return { lens, siblings };
}

export async function findKryptokFallback(brand: string | null | undefined, excludeIds: string[]) {
  if (!brand) {
    return [];
  }
  return dedupeKryptokLenses(
    await prisma.kryptokLens.findMany({
      where: {
        brand,
        id: { notIn: excludeIds },
        isDisabled: false,
      },
      orderBy: { createdAt: "desc" },
      take: 40,
    })
  );
}

export async function findProgressiveFallback(brand: string, excludeIds: string[]) {
  return dedupeProgressiveLenses(
    await prisma.progressiveLens.findMany({
      where: {
        brand,
        id: { notIn: excludeIds },
        isDisabled: false,
      },
      orderBy: { createdAt: "desc" },
      take: 40,
    })
  );
}

export async function findSingleVisionFallback(brand: string, excludeIds: string[]) {
  return dedupeSingleVisionLenses(
    await prisma.singleVisionLens.findMany({
      where: {
        brand,
        id: { notIn: excludeIds },
        isDisabled: false,
      },
      orderBy: { createdAt: "desc" },
      take: 40,
    })
  );
}
