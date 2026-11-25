/**
 * Stock S5 — catalog stock movement ledger.
 */

import { Prisma, type StockMovementType } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";

const movementInclude = {
  lensProductPower: {
    select: {
      id: true,
      sph: true,
      cyl: true,
      lensProductVariant: {
        select: {
          skuCode: true,
          name: true,
          productId: true,
          product: {
            select: { id: true, family: { select: { name: true } } },
          },
        },
      },
    },
  },
} as const;

function num(value: Prisma.Decimal | number | null | undefined): number | null {
  if (value == null) return null;
  return typeof value === "number" ? value : Number(value.toString());
}

export type CatalogStockTransactionDto = {
  id: string;
  lensProductPowerId: string | null;
  lensType: string | null;
  lensId: string | null;
  movementType: string;
  quantityDelta: number;
  quantityBefore: number;
  quantityAfter: number;
  sourceType: string | null;
  referenceId: string | null;
  orderId: string | null;
  actorUserId: string | null;
  reasonCode: string | null;
  reasonText: string | null;
  notes: string | null;
  createdAt: string;
  skuCode: string | null;
  productId: string | null;
  family: string | null;
  sph: number | null;
  cyl: number | null;
};

export async function listCatalogStockTransactions(params: {
  q?: string;
  powerId?: string;
  productId?: string;
  movementType?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}): Promise<{
  items: CatalogStockTransactionDto[];
  page: number;
  limit: number;
  hasMore: boolean;
  total: number;
}> {
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(100, Math.max(1, params.limit ?? 30));

  const where: Prisma.StockMovementWhereInput = {
    OR: [{ lensProductPowerId: { not: null } }],
  };

  if (params.powerId) {
    where.lensProductPowerId = params.powerId;
    delete where.OR;
  }
  if (params.productId) {
    where.lensProductPower = {
      lensProductVariant: { productId: params.productId },
    };
    delete where.OR;
  }
  const q = params.q?.trim();
  if (q) {
    where.OR = [
      { lensProductPowerId: { contains: q, mode: "insensitive" } },
      {
        lensProductPower: {
          lensProductVariant: {
            OR: [
              { skuCode: { contains: q, mode: "insensitive" } },
              { name: { contains: q, mode: "insensitive" } },
            ],
          },
        },
      },
    ];
  }
  if (params.movementType) {
    where.movementType = params.movementType as StockMovementType;
  }
  if (params.from || params.to) {
    where.createdAt = {};
    if (params.from) {
      const d = new Date(params.from);
      if (!Number.isNaN(d.getTime())) where.createdAt.gte = d;
    }
    if (params.to) {
      const d = new Date(`${params.to}T00:00:00Z`);
      if (!Number.isNaN(d.getTime())) {
        d.setUTCDate(d.getUTCDate() + 1);
        where.createdAt.lt = d;
      }
    }
  }

  const [total, rows] = await Promise.all([
    prisma.stockMovement.count({ where }),
    prisma.stockMovement.findMany({
      where,
      include: movementInclude,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return {
    items: rows.map((row) => ({
      id: row.id,
      lensProductPowerId: row.lensProductPowerId,
      lensType: row.lensType,
      lensId: row.lensId,
      movementType: row.movementType,
      quantityDelta: row.quantityDelta,
      quantityBefore: row.quantityBefore,
      quantityAfter: row.quantityAfter,
      sourceType: row.sourceType,
      referenceId: row.referenceId,
      orderId: row.orderId,
      actorUserId: row.actorUserId,
      reasonCode: row.reasonCode,
      reasonText: row.reasonText,
      notes: row.notes,
      createdAt: row.createdAt.toISOString(),
      skuCode: row.lensProductPower?.lensProductVariant.skuCode ?? null,
      productId:
        row.lensProductPower?.lensProductVariant.productId ??
        row.lensProductPower?.lensProductVariant.product.id ??
        null,
      family:
        row.lensProductPower?.lensProductVariant.product.family.name ?? null,
      sph: num(row.lensProductPower?.sph),
      cyl: num(row.lensProductPower?.cyl),
    })),
    page,
    limit,
    hasMore: page * limit < total,
    total,
  };
}
