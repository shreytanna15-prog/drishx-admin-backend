import { LensType } from "@prisma/client";
import { prisma } from "./prisma";
import {
  formatLensLabel,
  formatLensPower,
  isProcurementLensType,
  orderLensIdField,
  PROCUREMENT_LENS_TYPES,
} from "./procurement-rules";
import type { Prisma } from "@prisma/client";

export type DbClient = Prisma.TransactionClient | typeof prisma;

export {
  formatLensLabel,
  formatLensPower,
  isProcurementLensType,
  orderLensIdField,
  PROCUREMENT_LENS_TYPES,
};

export type LensDescriptor = {
  id: string;
  lensType: LensType;
  quantity: number;
  brand: string | null;
  item: string | null;
  coating: string | null;
  sph: number | null;
  cyl: number | null;
  crossPower: number | null;
  axis: number | null;
  add: number | null;
  eye: string | null;
  costPrice: number | null;
  price: number | null;
  isDisabled: boolean;
};

function num(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

type RawLensRow = {
  id: string;
  quantity: number;
  brand?: string | null;
  item?: string | null;
  coating?: string | null;
  sph?: unknown;
  cyl?: unknown;
  crossPower?: unknown;
  axis?: number | null;
  add?: unknown;
  eye?: string | null;
  costPrice?: unknown;
  price?: unknown;
  isDisabled?: boolean;
};

function toDescriptor(lensType: LensType, row: RawLensRow): LensDescriptor {
  return {
    id: row.id,
    lensType,
    quantity: row.quantity,
    brand: row.brand ?? null,
    item: row.item ?? null,
    coating: row.coating ?? null,
    sph: num(row.sph),
    cyl: num(row.cyl),
    crossPower: num(row.crossPower),
    axis: row.axis ?? null,
    add: num(row.add),
    eye: row.eye ?? null,
    costPrice: num(row.costPrice),
    price: num(row.price),
    isDisabled: row.isDisabled ?? false,
  };
}

/** Read a lens row from any of the six catalog tables. */
export async function readLensDescriptor(
  client: DbClient,
  lensType: LensType,
  lensId: string
): Promise<LensDescriptor | null> {
  const row = await readLensRow(client, lensType, lensId);
  return row ? toDescriptor(lensType, row) : null;
}

export async function readLensRow(
  client: DbClient,
  lensType: LensType,
  lensId: string
): Promise<RawLensRow | null> {
  switch (lensType) {
    case LensType.SINGLE_VISION:
      return client.singleVisionLens.findUnique({ where: { id: lensId } });
    case LensType.KRYPTOK:
      return client.kryptokLens.findUnique({ where: { id: lensId } });
    case LensType.PROGRESSIVE:
      return client.progressiveLens.findUnique({ where: { id: lensId } });
    case LensType.ORI_VISION:
      return client.oriVisionLens.findUnique({ where: { id: lensId } });
    case LensType.MAGNUS:
      return client.magnusLens.findUnique({ where: { id: lensId } });
    case LensType.BIFOCAL:
      return client.bifocalLens.findUnique({ where: { id: lensId } });
    default:
      return null;
  }
}
