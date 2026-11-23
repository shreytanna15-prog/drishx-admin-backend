/**
 * Stock S4 — catalog leaf stock position (available, incoming, open PO).
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import {
  OPEN_PO_STATUSES_FOR_INCOMING,
  openPoLineOutstanding,
} from "@/app/lib/purchase-order-math";
import {
  CATALOG_RESERVED_QTY_UNTIL_CUTOVER,
  catalogAvailable,
} from "@/app/lib/catalog/catalog-stock-position-core";
import { encodeStockLeafKey } from "@/app/lib/catalog/lens-product-stock-core";

type DbClient = Prisma.TransactionClient | typeof prisma;

const powerInclude = {
  lensProductVariant: {
    select: {
      id: true,
      skuCode: true,
      name: true,
      axis: true,
      eye: true,
      sellingPrice: true,
      addition: { select: { value: true } },
      product: {
        select: {
          id: true,
          family: { select: { name: true, code: true } },
          base: { select: { name: true } },
          material: { select: { name: true } },
          coating: { select: { name: true } },
          color: { select: { name: true } },
        },
      },
    },
  },
} as const;

function num(value: Prisma.Decimal | number): number {
  return typeof value === "number" ? value : Number(value.toString());
}

export type CatalogOpenPoDto = {
  id: string;
  publicId: string;
  status: string;
};

export type CatalogStockPositionDto = {
  id: string;
  leafKey: string;
  variantId: string;
  productId: string;
  skuCode: string;
  name: string;
  sph: number;
  cyl: number;
  axis: number | null;
  eye: string | null;
  addition: number | null;
  family: string;
  onHand: number;
  blockedQty: number;
  reservedQty: number;
  available: number;
  incoming: number;
  minStock: number;
  targetStock: number;
  openPo: CatalogOpenPoDto | null;
  legacyLensType: string | null;
  legacyLensId: string | null;
  updatedAt: string;
};

export async function getCatalogIncomingForPowers(
  powerIds: string[],
  client: DbClient = prisma
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  for (const id of powerIds) result.set(id, 0);
  if (powerIds.length === 0) return result;

  const lines = await client.purchaseOrderLine.findMany({
    where: {
      lensProductPowerId: { in: powerIds },
      purchaseOrder: {
        status: { in: [...OPEN_PO_STATUSES_FOR_INCOMING] },
      },
    },
    select: {
      lensProductPowerId: true,
      poQuantity: true,
      receivedQuantity: true,
      cancelledQuantity: true,
    },
  });

  for (const line of lines) {
    const id = line.lensProductPowerId;
    if (!id) continue;
    const outstanding = openPoLineOutstanding(line);
    result.set(id, (result.get(id) ?? 0) + outstanding);
  }
  return result;
}

export async function getCatalogOpenLocksForPowers(
  powerIds: string[],
  client: DbClient = prisma
): Promise<Map<string, CatalogOpenPoDto>> {
  const result = new Map<string, CatalogOpenPoDto>();
  if (powerIds.length === 0) return result;

  const locks = await client.openPurchaseOrderPower.findMany({
    where: { lensProductPowerId: { in: powerIds } },
    include: {
      purchaseOrder: { select: { id: true, publicId: true, status: true } },
    },
  });

  for (const lock of locks) {
    if (!lock.lensProductPowerId) continue;
    result.set(lock.lensProductPowerId, {
      id: lock.purchaseOrder.id,
      publicId: lock.purchaseOrder.publicId,
      status: lock.purchaseOrder.status,
    });
  }
  return result;
}

function serializePosition(
  row: {
    id: string;
    lensProductVariantId: string;
    sph: Prisma.Decimal;
    cyl: Prisma.Decimal;
    quantity: number;
    blockedQty: number;
    minStock: number;
    targetStock: number;
    legacyLensType: string | null;
    legacyLensId: string | null;
    updatedAt: Date;
    lensProductVariant: {
      skuCode: string;
      name: string;
      axis: number | null;
      eye: string | null;
      addition: { value: Prisma.Decimal | null } | null;
      product: {
        id: string;
        family: { name: string };
      };
    };
  },
  incoming: number,
  openPo: CatalogOpenPoDto | null
): CatalogStockPositionDto {
  const sph = num(row.sph);
  const cyl = num(row.cyl);
  const reservedQty = CATALOG_RESERVED_QTY_UNTIL_CUTOVER;
  const available = catalogAvailable({
    onHand: row.quantity,
    blockedQty: row.blockedQty,
    reservedQty,
  });
  return {
    id: row.id,
    leafKey: encodeStockLeafKey(row.lensProductVariantId, sph, cyl),
    variantId: row.lensProductVariantId,
    productId: row.lensProductVariant.product.id,
    skuCode: row.lensProductVariant.skuCode,
    name: row.lensProductVariant.name,
    sph,
    cyl,
    axis: row.lensProductVariant.axis,
    eye: row.lensProductVariant.eye,
    addition:
      row.lensProductVariant.addition?.value != null
        ? Number(row.lensProductVariant.addition.value)
        : null,
    family: row.lensProductVariant.product.family.name,
    onHand: row.quantity,
    blockedQty: row.blockedQty,
    reservedQty,
    available,
    incoming,
    minStock: row.minStock,
    targetStock: row.targetStock,
    openPo,
    legacyLensType: row.legacyLensType,
    legacyLensId: row.legacyLensId,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getCatalogStockPosition(
  powerId: string,
  client: DbClient = prisma
): Promise<CatalogStockPositionDto | null> {
  const row = await client.lensProductPower.findUnique({
    where: { id: powerId },
    include: powerInclude,
  });
  if (!row) return null;
  const [incomingMap, openMap] = await Promise.all([
    getCatalogIncomingForPowers([powerId], client),
    getCatalogOpenLocksForPowers([powerId], client),
  ]);
  return serializePosition(
    row,
    incomingMap.get(powerId) ?? 0,
    openMap.get(powerId) ?? null
  );
}

export async function listCatalogStockPositions(params: {
  q?: string;
  productId?: string;
  familyCode?: string;
  shortageOnly?: boolean;
  page?: number;
  limit?: number;
  client?: DbClient;
}): Promise<{
  items: CatalogStockPositionDto[];
  page: number;
  limit: number;
  hasMore: boolean;
  total: number;
}> {
  const db = params.client ?? prisma;
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(100, Math.max(1, params.limit ?? 20));
  const q = params.q?.trim();

  const where: Prisma.LensProductPowerWhereInput = {};
  if (params.productId || params.familyCode) {
    where.lensProductVariant = {
      ...(params.productId ? { productId: params.productId } : {}),
      ...(params.familyCode ? { product: { family: { code: params.familyCode } } } : {}),
    };
  }
  if (q) {
    where.OR = [
      { id: { contains: q, mode: "insensitive" } },
      {
        lensProductVariant: {
          OR: [
            { skuCode: { contains: q, mode: "insensitive" } },
            { name: { contains: q, mode: "insensitive" } },
          ],
        },
      },
    ];
  }

  // Shortage filter needs available — fetch a wider page then filter, or all matching.
  // For correctness with pagination, pull candidates then filter in memory for shortage.
  if (params.shortageOnly) {
    const candidates = await db.lensProductPower.findMany({
      where: {
        ...where,
        OR: [{ minStock: { gt: 0 } }, { targetStock: { gt: 0 } }],
      },
      include: powerInclude,
      orderBy: [{ updatedAt: "desc" }],
      take: 2000,
    });
    const ids = candidates.map((c) => c.id);
    const [incomingMap, openMap] = await Promise.all([
      getCatalogIncomingForPowers(ids, db),
      getCatalogOpenLocksForPowers(ids, db),
    ]);
    const all = candidates
      .map((row) =>
        serializePosition(
          row,
          incomingMap.get(row.id) ?? 0,
          openMap.get(row.id) ?? null
        )
      )
      .filter((p) => p.available <= p.minStock);
    const total = all.length;
    const items = all.slice((page - 1) * limit, page * limit);
    return {
      items,
      page,
      limit,
      hasMore: page * limit < total,
      total,
    };
  }

  const [total, rows] = await Promise.all([
    db.lensProductPower.count({ where }),
    db.lensProductPower.findMany({
      where,
      include: powerInclude,
      orderBy: [{ updatedAt: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);
  const ids = rows.map((r) => r.id);
  const [incomingMap, openMap] = await Promise.all([
    getCatalogIncomingForPowers(ids, db),
    getCatalogOpenLocksForPowers(ids, db),
  ]);

  return {
    items: rows.map((row) =>
      serializePosition(
        row,
        incomingMap.get(row.id) ?? 0,
        openMap.get(row.id) ?? null
      )
    ),
    page,
    limit,
    hasMore: page * limit < total,
    total,
  };
}

export async function getCatalogStockOverview(client: DbClient = prisma) {
  const rows = await client.lensProductPower.findMany({
    select: {
      id: true,
      quantity: true,
      blockedQty: true,
      minStock: true,
      targetStock: true,
      lensProductVariant: {
        select: {
          skuCode: true,
          name: true,
          product: { select: { id: true, family: { select: { name: true } } } },
        },
      },
    },
    take: 5000,
  });
  const ids = rows.map((r) => r.id);
  const [incomingMap, openMap] = await Promise.all([
    getCatalogIncomingForPowers(ids, client),
    getCatalogOpenLocksForPowers(ids, client),
  ]);

  let onHandSum = 0;
  let blockedSum = 0;
  let availableSum = 0;
  let shortageCount = 0;
  const shortages: Array<{
    id: string;
    skuCode: string;
    name: string;
    family: string;
    available: number;
    minStock: number;
    targetStock: number;
    incoming: number;
    openPoPublicId: string | null;
  }> = [];

  for (const row of rows) {
    const reservedQty = CATALOG_RESERVED_QTY_UNTIL_CUTOVER;
    const available = catalogAvailable({
      onHand: row.quantity,
      blockedQty: row.blockedQty,
      reservedQty,
    });
    onHandSum += row.quantity;
    blockedSum += row.blockedQty;
    availableSum += available;
    const incoming = incomingMap.get(row.id) ?? 0;
    const openPo = openMap.get(row.id) ?? null;
    if (
      (row.minStock > 0 || row.targetStock > 0) &&
      available <= row.minStock
    ) {
      shortageCount += 1;
      shortages.push({
        id: row.id,
        skuCode: row.lensProductVariant.skuCode,
        name: row.lensProductVariant.name,
        family: row.lensProductVariant.product.family.name,
        available,
        minStock: row.minStock,
        targetStock: row.targetStock,
        incoming,
        openPoPublicId: openPo?.publicId ?? null,
      });
    }
  }

  shortages.sort((a, b) => a.available - b.available);

  return {
    leafCount: rows.length,
    onHandSum,
    blockedSum,
    availableSum,
    reservedSum: 0,
    shortageCount,
    openPoLeafCount: openMap.size,
    topShortages: shortages.slice(0, 25),
  };
}
