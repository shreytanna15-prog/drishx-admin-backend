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
  buildCatalogMatrix,
  toCatalogMatrixVariants,
} from "@/app/lib/catalog/catalog-matrix";
import { catalogAvailable } from "@/app/lib/catalog/catalog-stock-position-core";
import { encodeStockLeafKey } from "@/app/lib/catalog/lens-product-stock-core";
import { ACTIVE_RESERVATION_STATUSES } from "@/app/lib/order-inventory";

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

/** Derive the hold from open catalog orders; never count already-picked units twice. */
export async function getCatalogReservedForPowers(
  powerIds: string[],
  client: DbClient = prisma
): Promise<Map<string, number>> {
  const result = new Map(powerIds.map((id) => [id, 0]));
  if (powerIds.length === 0) return result;
  const orders = await client.order.findMany({
      where: { lensProductPowerId: { in: powerIds }, status: { in: ACTIVE_RESERVATION_STATUSES } },
      select: { lensProductPowerId: true, reservedQuantity: true, pickedQuantity: true },
    });
  const wholesaleLines = await client.wholesaleOrderLineItem.findMany({
      where: {
        lensProductPowerId: { in: powerIds },
        order: { status: { in: ACTIVE_RESERVATION_STATUSES } },
      },
      select: { lensProductPowerId: true, reservedQuantity: true },
    });
  for (const order of orders) {
    const id = order.lensProductPowerId!;
    result.set(id, (result.get(id) ?? 0) + Math.max(0, order.reservedQuantity - order.pickedQuantity));
  }
  for (const line of wholesaleLines) {
    const id = line.lensProductPowerId!;
    result.set(id, (result.get(id) ?? 0) + Math.max(0, line.reservedQuantity));
  }
  return result;
}

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
  openPo: CatalogOpenPoDto | null,
  reservedQty: number
): CatalogStockPositionDto {
  const sph = num(row.sph);
  const cyl = num(row.cyl);
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
  const [incomingMap, openMap, reservedMap] = await Promise.all([
    getCatalogIncomingForPowers([powerId], client),
    getCatalogOpenLocksForPowers([powerId], client),
    getCatalogReservedForPowers([powerId], client),
  ]);
  return serializePosition(
    row,
    incomingMap.get(powerId) ?? 0,
    openMap.get(powerId) ?? null,
    reservedMap.get(powerId) ?? 0
  );
}

export async function listCatalogStockPositions(params: {
  q?: string;
  productId?: string;
  familyCode?: string;
  shortageOnly?: boolean;
  includeUnstocked?: boolean;
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
    const [incomingMap, openMap, reservedMap] = await Promise.all([
      getCatalogIncomingForPowers(ids, db),
      getCatalogOpenLocksForPowers(ids, db),
      getCatalogReservedForPowers(ids, db),
    ]);
    const all = candidates
      .map((row) =>
        serializePosition(
          row,
          incomingMap.get(row.id) ?? 0,
          openMap.get(row.id) ?? null,
          reservedMap.get(row.id) ?? 0
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
  const [incomingMap, openMap, reservedMap] = await Promise.all([
    getCatalogIncomingForPowers(ids, db),
    getCatalogOpenLocksForPowers(ids, db),
    getCatalogReservedForPowers(ids, db),
  ]);

  if (params.includeUnstocked) {
    const productWhere: Prisma.LensProductWhereInput = {
      isActive: true,
      ...(params.productId ? { id: params.productId } : {}),
      ...(params.familyCode ? { family: { code: params.familyCode } } : {}),
    };
    const products = await db.lensProduct.findMany({
      where: productWhere,
      orderBy: [{ createdAt: "desc" }],
      select: {
        id: true,
        family: {
          select: {
            code: true,
            name: true,
            supportsAdd: true,
            supportsAxis: true,
            supportsEye: true,
          },
        },
        variants: {
          where: {
            isActive: true,
            ...(q
              ? {
                  OR: [
                    { skuCode: { contains: q, mode: "insensitive" } },
                    { name: { contains: q, mode: "insensitive" } },
                  ],
                }
              : {}),
          },
          select: {
            id: true,
            skuCode: true,
            name: true,
            sphMin: true,
            sphMax: true,
            cylMin: true,
            cylMax: true,
            axis: true,
            eye: true,
            addition: { select: { value: true } },
          },
        },
      },
    });

    const variantIds = products.flatMap((p) => p.variants.map((v) => v.id));
    const existingRows =
      variantIds.length > 0
        ? await db.lensProductPower.findMany({
            where: { lensProductVariantId: { in: variantIds } },
            include: powerInclude,
          })
        : [];
    const existingIds = existingRows.map((r) => r.id);
    const [exIncoming, exOpen, exReserved] = await Promise.all([
      getCatalogIncomingForPowers(existingIds, db),
      getCatalogOpenLocksForPowers(existingIds, db),
      getCatalogReservedForPowers(existingIds, db),
    ]);
    const existingByKey = new Map<string, CatalogStockPositionDto>();
    for (const row of existingRows) {
      const dto = serializePosition(
        row,
        exIncoming.get(row.id) ?? 0,
        exOpen.get(row.id) ?? null,
        exReserved.get(row.id) ?? 0
      );
      existingByKey.set(dto.leafKey, dto);
    }

    const allVirtualAndReal: CatalogStockPositionDto[] = [];
    const seenKeys = new Set<string>();
    for (const p of products) {
      if (p.variants.length === 0) continue;
      const variantById = new Map(p.variants.map((v) => [v.id, v]));
      const matrix = buildCatalogMatrix(
        toCatalogMatrixVariants(
          p.variants.map((v) => ({
            id: v.id,
            sphMin: Number(v.sphMin),
            sphMax: Number(v.sphMax),
            cylMin: Number(v.cylMin),
            cylMax: Number(v.cylMax),
            axis: v.axis,
            eye: v.eye,
            addition:
              v.addition?.value != null
                ? { value: Number(v.addition.value) }
                : null,
          }))
        ),
        {
          supportsAdd: p.family.supportsAdd,
          supportsAxis: p.family.supportsAxis,
          supportsEye: p.family.supportsEye,
        },
        { familyLabel: p.family.name }
      );
      for (const sheet of matrix.sheets) {
        for (const r of sheet.rows) {
          for (const col of sheet.dataColumns) {
            const cell = r.cells[col.key];
            if (!cell || !cell.allowed || !cell.present || !cell.variantId) {
              continue;
            }
            const leafKey = encodeStockLeafKey(
              cell.variantId,
              cell.cellKey.sph,
              cell.cellKey.cyl
            );
            if (seenKeys.has(leafKey)) continue;
            seenKeys.add(leafKey);
            const real = existingByKey.get(leafKey);
            if (real) {
              allVirtualAndReal.push(real);
            } else {
              const v = variantById.get(cell.variantId);
              if (!v) continue;
              allVirtualAndReal.push({
                id: `virtual:${leafKey}`,
                leafKey,
                variantId: v.id,
                productId: p.id,
                skuCode: v.skuCode,
                name: v.name,
                sph: cell.cellKey.sph,
                cyl: cell.cellKey.cyl,
                axis: v.axis,
                eye: v.eye,
                addition:
                  v.addition?.value != null ? Number(v.addition.value) : null,
                family: p.family.name,
                onHand: 0,
                blockedQty: 0,
                reservedQty: 0,
                available: 0,
                incoming: 0,
                minStock: 0,
                targetStock: 0,
                openPo: null,
                legacyLensType: null,
                legacyLensId: null,
                updatedAt: "",
              });
            }
          }
        }
      }
    }

    const totalAll = allVirtualAndReal.length;
    const paged = allVirtualAndReal.slice((page - 1) * limit, page * limit);
    return {
      items: paged,
      page,
      limit,
      hasMore: page * limit < totalAll,
      total: totalAll,
    };
  }

  return {
    items: rows.map((row) =>
      serializePosition(
        row,
        incomingMap.get(row.id) ?? 0,
        openMap.get(row.id) ?? null,
        reservedMap.get(row.id) ?? 0
      )
    ),
    page,
    limit,
    hasMore: page * limit < total,
    total,
  };
}

export type CatalogStockProductCardDto = {
  productId: string;
  name: string;
  familyCode: string;
  familyName: string;
  baseName: string;
  materialName: string | null;
  indexValue: number | null;
  coatingName: string | null;
  colorName: string | null;
  variantCount: number;
  leafCount: number;
  totalOnHand: number;
  totalReserved: number;
  totalAvailable: number;
  totalBlocked: number;
  activeShortagesCount: number;
  openPoCount: number;
};

export async function getCatalogStockOverview(client: DbClient = prisma) {
  const [products, rows] = await Promise.all([
    client.lensProduct.findMany({
      where: { isActive: true },
      orderBy: [{ createdAt: "desc" }],
      select: {
        id: true,
        family: { select: { code: true, name: true } },
        base: { select: { name: true } },
        material: { select: { name: true } },
        index: { select: { value: true } },
        coating: { select: { name: true } },
        color: { select: { name: true } },
        _count: { select: { variants: { where: { isActive: true } } } },
      },
    }),
    client.lensProductPower.findMany({
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
      take: 10000,
    }),
  ]);
  const ids = rows.map((r) => r.id);
  const [incomingMap, openMap, reservedMap] = await Promise.all([
    getCatalogIncomingForPowers(ids, client),
    getCatalogOpenLocksForPowers(ids, client),
    getCatalogReservedForPowers(ids, client),
  ]);

  const cardMap = new Map<string, CatalogStockProductCardDto>();
  const productOpenPos = new Map<string, Set<string>>();
  for (const p of products) {
    const computedName = [
      p.family.name,
      p.base.name,
      p.material?.name,
      p.index?.value != null ? Number(p.index.value).toFixed(2) : null,
      p.coating?.name,
      p.color?.name,
    ]
      .filter(Boolean)
      .join(" · ");
    cardMap.set(p.id, {
      productId: p.id,
      name: computedName,
      familyCode: p.family.code,
      familyName: p.family.name,
      baseName: p.base.name,
      materialName: p.material?.name ?? null,
      indexValue: p.index?.value != null ? Number(p.index.value) : null,
      coatingName: p.coating?.name ?? null,
      colorName: p.color?.name ?? null,
      variantCount: p._count.variants,
      leafCount: 0,
      totalOnHand: 0,
      totalReserved: 0,
      totalAvailable: 0,
      totalBlocked: 0,
      activeShortagesCount: 0,
      openPoCount: 0,
    });
    productOpenPos.set(p.id, new Set());
  }

  let onHandSum = 0;
  let blockedSum = 0;
  let reservedSum = 0;
  let availableSum = 0;
  let shortageCount = 0;
  const shortages: Array<{
    id: string;
    productId: string;
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
    const productId = row.lensProductVariant.product.id;
    const reservedQty = reservedMap.get(row.id) ?? 0;
    const available = catalogAvailable({
      onHand: row.quantity,
      blockedQty: row.blockedQty,
      reservedQty,
    });
    onHandSum += row.quantity;
    blockedSum += row.blockedQty;
    reservedSum += reservedQty;
    availableSum += available;
    const incoming = incomingMap.get(row.id) ?? 0;
    const openPo = openMap.get(row.id) ?? null;
    const isShort =
      (row.minStock > 0 || row.targetStock > 0) && available <= row.minStock;

    const card = cardMap.get(productId);
    if (card) {
      card.leafCount += 1;
      card.totalOnHand += row.quantity;
      card.totalReserved += reservedQty;
      card.totalAvailable += available;
      card.totalBlocked += row.blockedQty;
      if (isShort) card.activeShortagesCount += 1;
      if (openPo) productOpenPos.get(productId)?.add(openPo.id);
    }

    if (isShort) {
      shortageCount += 1;
      shortages.push({
        id: row.id,
        productId,
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

  for (const [productId, poSet] of productOpenPos.entries()) {
    const card = cardMap.get(productId);
    if (card) card.openPoCount = poSet.size;
  }

  shortages.sort((a, b) => a.available - b.available);

  return {
    leafCount: rows.length,
    onHandSum,
    blockedSum,
    availableSum,
    reservedSum,
    shortageCount,
    openPoLeafCount: openMap.size,
    topShortages: shortages.slice(0, 25),
    productCards: Array.from(cardMap.values()),
  };
}
