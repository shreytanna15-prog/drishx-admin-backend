/**
 * Stock S2 — controlled catalog stock adjustments.
 * Posts on-hand via CatalogStockAdjustment + StockMovement + audit.
 * Never free-edits quantity. Rejects negative available.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import {
  type AuditActor,
  type AuditRequestContext,
  AuditAction,
  AuditModule,
  diffFields,
  recordAuditEvent,
} from "@/app/lib/audit";
import {
  assessCatalogStockAdjustment,
  CATALOG_STOCK_ADJUSTMENT_REASON_LABELS,
  isCatalogStockAdjustmentReason,
  type CatalogStockAdjustmentReasonCode,
} from "@/app/lib/catalog/catalog-stock-adjustment-core";
import {
  assertCatalogPowersNotFrozen,
  CatalogStockFreezeError,
} from "@/app/lib/catalog/catalog-stock-freeze";
import {
  encodeStockLeafKey,
  normalizeStockPower,
} from "@/app/lib/catalog/lens-product-stock-core";

export {
  assessCatalogStockAdjustment,
  CATALOG_STOCK_ADJUSTMENT_REASON_LABELS,
  CATALOG_STOCK_ADJUSTMENT_REASONS,
  computeAvailableQty,
  isCatalogStockAdjustmentReason,
  type CatalogStockAdjustmentReasonCode,
} from "@/app/lib/catalog/catalog-stock-adjustment-core";

export class CatalogStockAdjustmentError extends Error {
  status: number;
  code: string;
  details?: Record<string, unknown>;
  constructor(
    message: string,
    status = 400,
    code = "STOCK_ADJUSTMENT_ERROR",
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "CatalogStockAdjustmentError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const powerInclude = {
  lensProductVariant: {
    include: {
      product: {
        include: {
          family: true,
          base: true,
          material: true,
          coating: true,
          color: true,
        },
      },
      addition: true,
      axisRef: true,
    },
  },
} as const;

function dec(value: number): Prisma.Decimal {
  return new Prisma.Decimal(normalizeStockPower(value).toFixed(2));
}

function num(value: Prisma.Decimal | number): number {
  return typeof value === "number" ? value : Number(value.toString());
}

async function nextAdjustmentPublicId(
  tx: Prisma.TransactionClient
): Promise<string> {
  const year = String(new Date().getFullYear());
  const seqId = `CSA:${year}`;
  const existing = await tx.invoiceSequence.findUnique({ where: { id: seqId } });
  if (!existing) {
    await tx.invoiceSequence.create({
      data: {
        id: seqId,
        financialYear: year,
        prefix: "CSA",
        nextValue: 2,
      },
    });
    return `CSA-${year}-000001`;
  }
  const n = existing.nextValue;
  await tx.invoiceSequence.update({
    where: { id: seqId },
    data: { nextValue: n + 1 },
  });
  return `CSA-${year}-${String(n).padStart(6, "0")}`;
}

function serializePowerLeaf(row: {
  id: string;
  lensProductVariantId: string;
  sph: Prisma.Decimal;
  cyl: Prisma.Decimal;
  quantity: number;
  blockedQty: number;
  minStock: number;
  targetStock: number;
  updatedAt: Date;
  lensProductVariant: {
    skuCode: string;
    name: string;
    axis: number | null;
    eye: string | null;
    addition: { value: Prisma.Decimal | null; name: string } | null;
    product: {
      id: string;
      family: { name: string; code: string };
      base: { name: string; code: string };
      material: { name: string; code: string } | null;
      coating: { name: string; code: string } | null;
      color: { name: string; code: string } | null;
    };
  };
}) {
  const sph = num(row.sph);
  const cyl = num(row.cyl);
  const reservedQty = 0; // until order cutover binds to catalog leaves
  const available = row.quantity - reservedQty - row.blockedQty;
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
    minStock: row.minStock,
    targetStock: row.targetStock,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export type CatalogStockPowerDto = ReturnType<typeof serializePowerLeaf>;

function serializeAdjustment(row: {
  id: string;
  publicId: string;
  lensProductPowerId: string;
  qtyBefore: number;
  countedQty: number;
  qtyDelta: number;
  qtyAfter: number;
  reasonCode: string;
  reasonText: string | null;
  status: string;
  submittedById: string;
  approvedById: string | null;
  createdAt: Date;
  lensProductPower?: Parameters<typeof serializePowerLeaf>[0];
}) {
  return {
    id: row.id,
    publicId: row.publicId,
    lensProductPowerId: row.lensProductPowerId,
    qtyBefore: row.qtyBefore,
    countedQty: row.countedQty,
    qtyDelta: row.qtyDelta,
    qtyAfter: row.qtyAfter,
    reasonCode: row.reasonCode,
    reasonLabel:
      CATALOG_STOCK_ADJUSTMENT_REASON_LABELS[
        row.reasonCode as CatalogStockAdjustmentReasonCode
      ] ?? row.reasonCode,
    reasonText: row.reasonText,
    status: row.status,
    submittedById: row.submittedById,
    approvedById: row.approvedById,
    createdAt: row.createdAt.toISOString(),
    leaf: row.lensProductPower
      ? serializePowerLeaf(row.lensProductPower)
      : null,
  };
}

export type CatalogStockAdjustmentDto = ReturnType<typeof serializeAdjustment>;

/** Resolve leaf by id, or upsert by variantId+sph+cyl (lazy create at 0). */
export async function resolveCatalogStockPower(input: {
  powerId?: string | null;
  variantId?: string | null;
  sph?: number | null;
  cyl?: number | null;
}): Promise<CatalogStockPowerDto> {
  if (input.powerId?.trim()) {
    const row = await prisma.lensProductPower.findUnique({
      where: { id: input.powerId.trim() },
      include: powerInclude,
    });
    if (!row) {
      throw new CatalogStockAdjustmentError(
        "Stock leaf not found.",
        404,
        "POWER_NOT_FOUND"
      );
    }
    return serializePowerLeaf(row);
  }

  const variantId = String(input.variantId ?? "").trim();
  if (!variantId || input.sph == null || input.cyl == null) {
    throw new CatalogStockAdjustmentError(
      "Provide powerId, or variantId + sph + cyl.",
      400,
      "VALIDATION"
    );
  }

  const variant = await prisma.lensProductVariant.findUnique({
    where: { id: variantId },
    select: { id: true },
  });
  if (!variant) {
    throw new CatalogStockAdjustmentError(
      "Variant not found.",
      404,
      "VARIANT_NOT_FOUND"
    );
  }

  const sph = normalizeStockPower(Number(input.sph));
  const cyl = normalizeStockPower(Number(input.cyl));

  const existing = await prisma.lensProductPower.findUnique({
    where: {
      lensProductVariantId_sph_cyl: {
        lensProductVariantId: variantId,
        sph: dec(sph),
        cyl: dec(cyl),
      },
    },
    include: powerInclude,
  });
  if (existing) return serializePowerLeaf(existing);

  const created = await prisma.lensProductPower.create({
    data: {
      lensProductVariantId: variantId,
      sph: dec(sph),
      cyl: dec(cyl),
      quantity: 0,
      blockedQty: 0,
      minStock: 0,
      targetStock: 0,
    },
    include: powerInclude,
  });
  return serializePowerLeaf(created);
}

export async function listCatalogStockPowers(params: {
  q?: string;
  productId?: string;
  page?: number;
  limit?: number;
}): Promise<{
  items: CatalogStockPowerDto[];
  page: number;
  limit: number;
  hasMore: boolean;
  total: number;
}> {
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(100, Math.max(1, params.limit ?? 20));
  const q = params.q?.trim();

  const where: Prisma.LensProductPowerWhereInput = {};
  if (params.productId) {
    where.lensProductVariant = { productId: params.productId };
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

  const [total, rows] = await Promise.all([
    prisma.lensProductPower.count({ where }),
    prisma.lensProductPower.findMany({
      where,
      include: powerInclude,
      orderBy: [{ updatedAt: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return {
    items: rows.map(serializePowerLeaf),
    page,
    limit,
    hasMore: page * limit < total,
    total,
  };
}

export async function listCatalogStockAdjustments(params: {
  page?: number;
  limit?: number;
  powerId?: string;
  q?: string;
}): Promise<{
  items: CatalogStockAdjustmentDto[];
  page: number;
  limit: number;
  hasMore: boolean;
  total: number;
}> {
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(100, Math.max(1, params.limit ?? 20));
  const where: Prisma.CatalogStockAdjustmentWhereInput = {};
  if (params.powerId) where.lensProductPowerId = params.powerId;
  const q = params.q?.trim();
  if (q) {
    where.OR = [
      { publicId: { contains: q, mode: "insensitive" } },
      { reasonCode: { contains: q, mode: "insensitive" } },
      { reasonText: { contains: q, mode: "insensitive" } },
      {
        lensProductPower: {
          lensProductVariant: {
            skuCode: { contains: q, mode: "insensitive" },
          },
        },
      },
    ];
  }

  const [total, rows] = await Promise.all([
    prisma.catalogStockAdjustment.count({ where }),
    prisma.catalogStockAdjustment.findMany({
      where,
      include: { lensProductPower: { include: powerInclude } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return {
    items: rows.map(serializeAdjustment),
    page,
    limit,
    hasMore: page * limit < total,
    total,
  };
}

export async function createCatalogStockAdjustment(input: {
  powerId?: string | null;
  variantId?: string | null;
  sph?: number | null;
  cyl?: number | null;
  countedQty: number;
  reasonCode: string;
  reasonText?: string | null;
  actor: AuditActor;
  request?: AuditRequestContext | null;
  /**
   * When verifying a stock-check session, allow posting against leaves frozen
   * by that session only.
   */
  allowFrozenSessionId?: string | null;
  /** Optional tx client when nested inside another transaction (e.g. verify). */
  client?: Prisma.TransactionClient;
}): Promise<CatalogStockAdjustmentDto> {
  if (!isCatalogStockAdjustmentReason(input.reasonCode)) {
    throw new CatalogStockAdjustmentError(
      `Invalid reasonCode. Use one of: physical_mismatch, damaged, counting_error, wrong_entry, other.`,
      400,
      "INVALID_REASON"
    );
  }
  if (input.reasonCode === "other" && !String(input.reasonText ?? "").trim()) {
    throw new CatalogStockAdjustmentError(
      "reasonText is required when reasonCode is other.",
      400,
      "REASON_TEXT_REQUIRED"
    );
  }

  const leaf = await resolveCatalogStockPower({
    powerId: input.powerId,
    variantId: input.variantId,
    sph: input.sph,
    cyl: input.cyl,
  });

  const assessed = assessCatalogStockAdjustment({
    qtyBefore: leaf.onHand,
    countedQty: input.countedQty,
    blockedQty: leaf.blockedQty,
    reservedQty: leaf.reservedQty,
  });
  if (!assessed.ok) {
    throw new CatalogStockAdjustmentError(
      assessed.message,
      409,
      assessed.code,
      { powerId: leaf.id, onHand: leaf.onHand, blockedQty: leaf.blockedQty }
    );
  }

  if (assessed.qtyDelta === 0) {
    throw new CatalogStockAdjustmentError(
      "Counted quantity matches current on-hand — nothing to adjust.",
      400,
      "NO_CHANGE"
    );
  }

  const actorUserId = input.actor.actorUserId;
  if (!actorUserId) {
    throw new CatalogStockAdjustmentError(
      "Actor user id is required for stock adjustments.",
      400,
      "ACTOR_REQUIRED"
    );
  }

  const run = async (tx: Prisma.TransactionClient) => {
    try {
      await assertCatalogPowersNotFrozen([leaf.id], {
        exceptSessionId: input.allowFrozenSessionId,
        client: tx,
      });
    } catch (err) {
      if (err instanceof CatalogStockFreezeError) {
        throw new CatalogStockAdjustmentError(
          err.message,
          err.status,
          err.code,
          err.details
        );
      }
      throw err;
    }

    // Re-read inside txn to avoid race.
    const fresh = await tx.lensProductPower.findUnique({
      where: { id: leaf.id },
      include: powerInclude,
    });
    if (!fresh) {
      throw new CatalogStockAdjustmentError(
        "Stock leaf not found.",
        404,
        "POWER_NOT_FOUND"
      );
    }

    const reassess = assessCatalogStockAdjustment({
      qtyBefore: fresh.quantity,
      countedQty: input.countedQty,
      blockedQty: fresh.blockedQty,
      reservedQty: 0,
    });
    if (!reassess.ok) {
      throw new CatalogStockAdjustmentError(
        reassess.message,
        409,
        reassess.code
      );
    }
    if (reassess.qtyDelta === 0) {
      throw new CatalogStockAdjustmentError(
        "Counted quantity matches current on-hand — nothing to adjust.",
        400,
        "NO_CHANGE"
      );
    }

    const publicId = await nextAdjustmentPublicId(tx);
    const adjustment = await tx.catalogStockAdjustment.create({
      data: {
        publicId,
        lensProductPowerId: fresh.id,
        qtyBefore: reassess.qtyBefore,
        countedQty: reassess.countedQty,
        qtyDelta: reassess.qtyDelta,
        qtyAfter: reassess.qtyAfter,
        reasonCode: input.reasonCode,
        reasonText: input.reasonText?.trim() || null,
        status: "APPLIED",
        submittedById: actorUserId,
        approvedById: actorUserId,
      },
      include: { lensProductPower: { include: powerInclude } },
    });

    await tx.lensProductPower.update({
      where: { id: fresh.id },
      data: { quantity: reassess.qtyAfter },
    });

    await tx.stockMovement.create({
      data: {
        lensProductPowerId: fresh.id,
        lensType: fresh.legacyLensType,
        lensId: fresh.legacyLensId,
        movementType: "ADJUSTED",
        quantityDelta: reassess.qtyDelta,
        quantityBefore: reassess.qtyBefore,
        quantityAfter: reassess.qtyAfter,
        sourceType: "CatalogStockAdjustment",
        referenceId: adjustment.publicId,
        actorUserId,
        reasonCode: input.reasonCode,
        reasonText: input.reasonText?.trim() || null,
      },
    });

    await recordAuditEvent(tx, {
      action: AuditAction.STOCK_ADJUSTED,
      module: AuditModule.INVENTORY,
      entityType: "CatalogStockAdjustment",
      entityId: adjustment.id,
      actor: input.actor,
      request: input.request ?? null,
      changes: diffFields(
        { quantity: reassess.qtyBefore },
        { quantity: reassess.qtyAfter },
        ["quantity"]
      ),
      context: {
        publicId: adjustment.publicId,
        powerId: fresh.id,
        skuCode: fresh.lensProductVariant.skuCode,
        sph: num(fresh.sph),
        cyl: num(fresh.cyl),
        qtyDelta: reassess.qtyDelta,
        reasonCode: input.reasonCode,
      },
      activityMessage: `Stock adjusted ${adjustment.publicId} — ${fresh.lensProductVariant.skuCode} ${num(fresh.sph).toFixed(2)}/${num(fresh.cyl).toFixed(2)} (${reassess.qtyBefore} → ${reassess.qtyAfter})`,
      reasonCode: input.reasonCode,
      reasonText: input.reasonText?.trim() || null,
    });

    return adjustment;
  };

  const result = input.client
    ? await run(input.client)
    : await prisma.$transaction(async (tx) => run(tx), {
        // Remote pooler + audit/ledger writes often exceed Prisma's 5s default.
        maxWait: 10_000,
        timeout: 60_000,
      });

  return serializeAdjustment(result);
}
