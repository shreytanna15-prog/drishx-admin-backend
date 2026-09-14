import { prisma } from "./prisma";
import { LensType } from "@prisma/client";

type SingleVisionRow = Awaited<ReturnType<typeof prisma.singleVisionLens.findFirst>>;
type KryptokRow = Awaited<ReturnType<typeof prisma.kryptokLens.findFirst>>;
type ProgressiveRow = Awaited<ReturnType<typeof prisma.progressiveLens.findFirst>>;

export type ResolvedLens = SingleVisionRow | KryptokRow | ProgressiveRow;

/** Pick a row with enough stock when duplicate catalog rows share the same product. */
export async function resolveLensForOrder(
  lensType: LensType,
  quantity: number,
  lensId?: string | null
): Promise<ResolvedLens | null> {
  if (lensType === LensType.SINGLE_VISION) {
    return resolveSingleVision(quantity, lensId);
  }
  if (lensType === LensType.KRYPTOK) {
    return resolveKryptok(quantity, lensId);
  }
  if (lensType === LensType.PROGRESSIVE) {
    return resolveProgressive(quantity, lensId);
  }
  return null;
}

async function resolveSingleVision(quantity: number, lensId?: string | null): Promise<SingleVisionRow> {
  let lens = lensId
    ? await prisma.singleVisionLens.findUnique({ where: { id: lensId } })
    : null;

  if (!lens) {
    return null;
  }

  if (lens.quantity >= quantity) {
    return lens;
  }

  const sibling = await prisma.singleVisionLens.findFirst({
    where: {
      category: lens.category,
      brand: lens.brand,
      item: lens.item,
      coating: lens.coating,
      index: lens.index,
      sph: lens.sph,
      cyl: lens.cyl,
      crossPower: lens.crossPower,
      quantity: { gte: quantity },
    },
    orderBy: [{ quantity: "desc" }, { createdAt: "desc" }],
  });

  return sibling ?? lens;
}

async function resolveKryptok(quantity: number, lensId?: string | null): Promise<KryptokRow> {
  let lens = lensId ? await prisma.kryptokLens.findUnique({ where: { id: lensId } }) : null;
  if (!lens) return null;
  if (lens.quantity >= quantity) return lens;

  const sibling = await prisma.kryptokLens.findFirst({
    where: {
      category: lens.category,
      brand: lens.brand,
      coating: lens.coating,
      sph: lens.sph,
      cyl: lens.cyl,
      axis: lens.axis,
      add: lens.add,
      quantity: { gte: quantity },
    },
    orderBy: [{ quantity: "desc" }, { createdAt: "desc" }],
  });

  return sibling ?? lens;
}

async function resolveProgressive(quantity: number, lensId?: string | null): Promise<ProgressiveRow> {
  let lens = lensId ? await prisma.progressiveLens.findUnique({ where: { id: lensId } }) : null;
  if (!lens) return null;
  if (lens.quantity >= quantity) return lens;

  const sibling = await prisma.progressiveLens.findFirst({
    where: {
      category: lens.category,
      item: lens.item,
      brand: lens.brand,
      type: lens.type,
      coating: lens.coating,
      index: lens.index,
      sph: lens.sph,
      cyl: lens.cyl,
      axis: lens.axis,
      add: lens.add,
      eye: lens.eye,
      quantity: { gte: quantity },
    },
    orderBy: [{ quantity: "desc" }, { createdAt: "desc" }],
  });

  return sibling ?? lens;
}

export function dedupeSingleVisionLenses<T extends {
  id: string;
  category: string | null;
  brand: string;
  item: string | null;
  index: unknown;
  coating: string;
  sph: unknown;
  cyl: unknown | null;
  crossPower?: unknown | null;
  quantity: number;
  createdAt: Date;
}>(rows: T[]): T[] {
  const byKey = new Map<string, T>();

  for (const row of rows) {
    const key = [
      row.category ?? "",
      row.brand,
      row.item ?? "",
      Number(row.index),
      row.coating,
      row.crossPower === null || row.crossPower === undefined ? "" : Number(row.crossPower),
      row.sph === null || row.sph === undefined ? "" : Number(row.sph),
      row.cyl === null || row.cyl === undefined ? "" : Number(row.cyl),
    ].join("|");

    const existing = byKey.get(key);
    if (!existing || row.quantity > existing.quantity) {
      byKey.set(key, row);
    } else if (row.quantity === existing.quantity && row.createdAt > existing.createdAt) {
      byKey.set(key, row);
    }
  }

  return Array.from(byKey.values());
}

export function dedupeKryptokLenses<T extends {
  id: string;
  category: string | null;
  brand: string | null;
  coating: string | null;
  sph: unknown;
  cyl: unknown | null;
  axis: number | null;
  add: unknown;
  quantity: number;
  createdAt: Date;
}>(rows: T[]): T[] {
  const byKey = new Map<string, T>();

  for (const row of rows) {
    const key = [
      row.category ?? "",
      row.brand ?? "",
      row.coating ?? "",
      Number(row.sph),
      row.cyl === null || row.cyl === undefined ? "" : Number(row.cyl),
      row.axis ?? "",
      Number(row.add),
    ].join("|");

    const existing = byKey.get(key);
    if (!existing || row.quantity > existing.quantity) {
      byKey.set(key, row);
    }
  }

  return Array.from(byKey.values());
}

export function dedupeProgressiveLenses<T extends {
  id: string;
  category: string | null;
  item: string;
  brand: string;
  type: string;
  coating: string;
  index: unknown;
  sph: unknown;
  cyl: unknown | null;
  axis: number | null;
  add: unknown;
  eye: string;
  quantity: number;
  createdAt: Date;
}>(rows: T[]): T[] {
  const byKey = new Map<string, T>();

  for (const row of rows) {
    const key = [
      row.category ?? "",
      row.item,
      row.brand,
      row.type,
      row.coating,
      Number(row.index),
      Number(row.sph),
      row.cyl === null || row.cyl === undefined ? "" : Number(row.cyl),
      row.axis ?? "",
      Number(row.add),
      row.eye,
    ].join("|");

    const existing = byKey.get(key);
    if (!existing || row.quantity > existing.quantity) {
      byKey.set(key, row);
    }
  }

  return Array.from(byKey.values());
}
