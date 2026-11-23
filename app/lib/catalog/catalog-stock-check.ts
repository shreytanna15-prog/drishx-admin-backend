/**
 * Stock S2b — physical stock check sessions.
 * Freezes leaves while OPEN/SUBMITTED; Employee never sees system qty.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import {
  type AuditActor,
  type AuditRequestContext,
  AuditAction,
  AuditModule,
  recordAuditEvent,
} from "@/app/lib/audit";
import { createCatalogStockAdjustment } from "@/app/lib/catalog/catalog-stock-adjustment";
import {
  canAdminVerifyStockCheck,
  canEmployeeEditStockCheck,
  effectiveCountedQty,
  stripSystemQtyFromCheckLine,
} from "@/app/lib/catalog/catalog-stock-check-core";
import { findFrozenCatalogPowerIds } from "@/app/lib/catalog/catalog-stock-freeze";
import {
  encodeStockLeafKey,
  normalizeStockPower,
} from "@/app/lib/catalog/lens-product-stock-core";

export {
  canAdminVerifyStockCheck,
  canEmployeeEditStockCheck,
  effectiveCountedQty,
  stripSystemQtyFromCheckLine,
} from "@/app/lib/catalog/catalog-stock-check-core";

export class CatalogStockCheckError extends Error {
  status: number;
  code: string;
  details?: Record<string, unknown>;
  constructor(
    message: string,
    status = 400,
    code = "STOCK_CHECK_ERROR",
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "CatalogStockCheckError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const powerInclude = {
  lensProductVariant: {
    select: {
      id: true,
      skuCode: true,
      name: true,
      axis: true,
      eye: true,
      productId: true,
      addition: { select: { value: true } },
      product: { select: { id: true, family: { select: { name: true } } } },
    },
  },
} as const;

const sessionInclude = {
  lines: {
    include: { lensProductPower: { include: powerInclude } },
    orderBy: { createdAt: "asc" as const },
  },
} as const;

function num(value: Prisma.Decimal | number): number {
  return typeof value === "number" ? value : Number(value.toString());
}

async function nextCheckPublicId(tx: Prisma.TransactionClient): Promise<string> {
  const year = String(new Date().getFullYear());
  const seqId = `CSC:${year}`;
  const existing = await tx.invoiceSequence.findUnique({ where: { id: seqId } });
  if (!existing) {
    await tx.invoiceSequence.create({
      data: { id: seqId, financialYear: year, prefix: "CSC", nextValue: 2 },
    });
    return `CSC-${year}-000001`;
  }
  const n = existing.nextValue;
  await tx.invoiceSequence.update({
    where: { id: seqId },
    data: { nextValue: n + 1 },
  });
  return `CSC-${year}-${String(n).padStart(6, "0")}`;
}

function serializeLine(
  line: {
    id: string;
    lensProductPowerId: string;
    systemQtyAtStart: number;
    countedQty: number | null;
    verifiedCountedQty: number | null;
    adjustmentId: string | null;
    notes: string | null;
    lensProductPower: {
      sph: Prisma.Decimal;
      cyl: Prisma.Decimal;
      quantity: number;
      blockedQty: number;
      lensProductVariant: {
        id: string;
        skuCode: string;
        name: string;
        axis: number | null;
        eye: string | null;
        productId: string;
        addition: { value: Prisma.Decimal | null } | null;
        product: { id: string; family: { name: string } };
      };
    };
  },
  opts: { includeSystemQty: boolean }
) {
  const sph = num(line.lensProductPower.sph);
  const cyl = num(line.lensProductPower.cyl);
  const counted = effectiveCountedQty(line);
  const base = {
    id: line.id,
    powerId: line.lensProductPowerId,
    variantId: line.lensProductPower.lensProductVariant.id,
    productId: line.lensProductPower.lensProductVariant.productId,
    skuCode: line.lensProductPower.lensProductVariant.skuCode,
    name: line.lensProductPower.lensProductVariant.name,
    family: line.lensProductPower.lensProductVariant.product.family.name,
    sph,
    cyl,
    axis: line.lensProductPower.lensProductVariant.axis,
    eye: line.lensProductPower.lensProductVariant.eye,
    addition:
      line.lensProductPower.lensProductVariant.addition?.value != null
        ? Number(line.lensProductPower.lensProductVariant.addition.value)
        : null,
    leafKey: encodeStockLeafKey(
      line.lensProductPower.lensProductVariant.id,
      sph,
      cyl
    ),
    countedQty: line.countedQty,
    verifiedCountedQty: line.verifiedCountedQty,
    effectiveCountedQty: counted,
    adjustmentId: line.adjustmentId,
    notes: line.notes,
  };

  if (!opts.includeSystemQty) {
    return stripSystemQtyFromCheckLine({
      ...base,
      systemQtyAtStart: line.systemQtyAtStart,
      onHand: line.lensProductPower.quantity,
      blockedQty: line.lensProductPower.blockedQty,
      available: line.lensProductPower.quantity - line.lensProductPower.blockedQty,
      delta:
        counted != null ? counted - line.systemQtyAtStart : null,
    });
  }

  return {
    ...base,
    systemQtyAtStart: line.systemQtyAtStart,
    onHand: line.lensProductPower.quantity,
    blockedQty: line.lensProductPower.blockedQty,
    available: line.lensProductPower.quantity - line.lensProductPower.blockedQty,
    delta: counted != null ? counted - line.systemQtyAtStart : null,
  };
}

function serializeSession(
  row: {
    id: string;
    publicId: string;
    productId: string | null;
    status: string;
    notes: string | null;
    startedById: string;
    submittedById: string | null;
    verifiedById: string | null;
    cancelledById: string | null;
    startedAt: Date;
    submittedAt: Date | null;
    verifiedAt: Date | null;
    cancelledAt: Date | null;
    createdAt: Date;
    lines: Parameters<typeof serializeLine>[0][];
  },
  opts: { includeSystemQty: boolean }
) {
  return {
    id: row.id,
    publicId: row.publicId,
    productId: row.productId,
    status: row.status,
    notes: row.notes,
    startedById: row.startedById,
    submittedById: row.submittedById,
    verifiedById: row.verifiedById,
    cancelledById: row.cancelledById,
    startedAt: row.startedAt.toISOString(),
    submittedAt: row.submittedAt?.toISOString() ?? null,
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
    cancelledAt: row.cancelledAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    lineCount: row.lines.length,
    countedLineCount: row.lines.filter((l) => l.countedQty != null).length,
    lines: row.lines.map((l) => serializeLine(l, opts)),
  };
}

export type CatalogStockCheckSessionDto = ReturnType<typeof serializeSession>;

async function loadSession(id: string) {
  const row = await prisma.catalogStockCheckSession.findUnique({
    where: { id },
    include: sessionInclude,
  });
  if (!row) {
    throw new CatalogStockCheckError("Stock check session not found.", 404, "NOT_FOUND");
  }
  return row;
}

export async function getCatalogStockCheckSession(
  id: string,
  opts: { includeSystemQty: boolean }
): Promise<CatalogStockCheckSessionDto> {
  const row = await loadSession(id);
  return serializeSession(row, opts);
}

export async function listCatalogStockCheckSessions(params: {
  status?: string;
  page?: number;
  limit?: number;
}): Promise<{
  items: CatalogStockCheckSessionDto[];
  page: number;
  limit: number;
  hasMore: boolean;
  total: number;
}> {
  const page = Math.max(1, params.page ?? 1);
  const limit = Math.min(100, Math.max(1, params.limit ?? 20));
  const where: Prisma.CatalogStockCheckSessionWhereInput = {};
  if (params.status) where.status = params.status as never;

  const [total, rows] = await Promise.all([
    prisma.catalogStockCheckSession.count({ where }),
    prisma.catalogStockCheckSession.findMany({
      where,
      include: sessionInclude,
      orderBy: { startedAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return {
    items: rows.map((r) => serializeSession(r, { includeSystemQty: true })),
    page,
    limit,
    hasMore: page * limit < total,
    total,
  };
}

export async function startCatalogStockCheck(input: {
  productId?: string | null;
  powerIds?: string[] | null;
  notes?: string | null;
  actor: AuditActor;
  request?: AuditRequestContext | null;
}): Promise<CatalogStockCheckSessionDto> {
  const actorUserId = input.actor.actorUserId;
  if (!actorUserId) {
    throw new CatalogStockCheckError("Actor required.", 400, "ACTOR_REQUIRED");
  }

  let powerIds = (input.powerIds ?? [])
    .map((id) => String(id).trim())
    .filter(Boolean);

  if (input.productId?.trim()) {
    const productId = input.productId.trim();
    const product = await prisma.lensProduct.findUnique({
      where: { id: productId },
      select: { id: true },
    });
    if (!product) {
      throw new CatalogStockCheckError("Product not found.", 404, "PRODUCT_NOT_FOUND");
    }
    const leaves = await prisma.lensProductPower.findMany({
      where: { lensProductVariant: { productId } },
      select: { id: true },
    });
    powerIds = [...new Set([...powerIds, ...leaves.map((l) => l.id)])];
  }

  powerIds = [...new Set(powerIds)];
  if (powerIds.length === 0) {
    throw new CatalogStockCheckError(
      "Select at least one stock leaf, or a product that already has leaves (save thresholds first).",
      400,
      "NO_LEAVES"
    );
  }

  const powers = await prisma.lensProductPower.findMany({
    where: { id: { in: powerIds } },
    select: { id: true, quantity: true },
  });
  if (powers.length !== powerIds.length) {
    throw new CatalogStockCheckError(
      "One or more stock leaves were not found.",
      404,
      "POWER_NOT_FOUND"
    );
  }

  const alreadyFrozen = await findFrozenCatalogPowerIds(powerIds);
  if (alreadyFrozen.length > 0) {
    throw new CatalogStockCheckError(
      "One or more leaves are already frozen by another open stock check.",
      409,
      "ALREADY_FROZEN",
      { powerIds: alreadyFrozen }
    );
  }

  const session = await prisma.$transaction(async (tx) => {
    const publicId = await nextCheckPublicId(tx);
    const created = await tx.catalogStockCheckSession.create({
      data: {
        publicId,
        productId: input.productId?.trim() || null,
        status: "OPEN",
        notes: input.notes?.trim() || null,
        startedById: actorUserId,
        lines: {
          create: powers.map((p) => ({
            lensProductPowerId: p.id,
            systemQtyAtStart: p.quantity,
          })),
        },
      },
      include: sessionInclude,
    });

    await recordAuditEvent(tx, {
      action: AuditAction.STOCK_CHECK_STARTED,
      module: AuditModule.INVENTORY,
      entityType: "CatalogStockCheckSession",
      entityId: created.id,
      actor: input.actor,
      request: input.request ?? null,
      context: {
        publicId: created.publicId,
        productId: created.productId,
        lineCount: created.lines.length,
      },
      activityMessage: `Stock check ${created.publicId} started (${created.lines.length} leaves frozen)`,
    });

    return created;
  });

  return serializeSession(session, { includeSystemQty: true });
}

export async function saveCatalogStockCheckCounts(input: {
  sessionId: string;
  lines: Array<{
    powerId: string;
    countedQty: number;
    notes?: string | null;
  }>;
  /** When true (Admin), also write verifiedCountedQty. */
  asAdmin?: boolean;
  actor: AuditActor;
}): Promise<CatalogStockCheckSessionDto> {
  if (!Array.isArray(input.lines) || input.lines.length === 0) {
    throw new CatalogStockCheckError("lines must be a non-empty array.", 400, "VALIDATION");
  }

  const session = await loadSession(input.sessionId);
  if (!canEmployeeEditStockCheck(session.status) && !input.asAdmin) {
    throw new CatalogStockCheckError(
      `Cannot edit counts while session is ${session.status}.`,
      409,
      "STATUS_LOCKED"
    );
  }
  if (session.status === "VERIFIED" || session.status === "CANCELLED") {
    throw new CatalogStockCheckError(
      `Session is ${session.status} and cannot be edited.`,
      409,
      "STATUS_LOCKED"
    );
  }

  const byPower = new Map(session.lines.map((l) => [l.lensProductPowerId, l]));

  await prisma.$transaction(async (tx) => {
    for (const row of input.lines) {
      const powerId = String(row.powerId ?? "").trim();
      const line = byPower.get(powerId);
      if (!line) {
        throw new CatalogStockCheckError(
          `Power ${powerId} is not part of this session.`,
          400,
          "LINE_NOT_IN_SESSION"
        );
      }
      const countedQty = Number(row.countedQty);
      if (!Number.isSafeInteger(countedQty) || countedQty < 0 || countedQty > 1_000_000) {
        throw new CatalogStockCheckError(
          "countedQty must be a whole number ≥ 0.",
          400,
          "INVALID_COUNTED",
          { powerId }
        );
      }
      await tx.catalogStockCheckLine.update({
        where: { id: line.id },
        data: {
          countedQty,
          ...(input.asAdmin ? { verifiedCountedQty: countedQty } : {}),
          notes: row.notes?.trim() || null,
        },
      });
    }
  });

  return getCatalogStockCheckSession(input.sessionId, {
    includeSystemQty: Boolean(input.asAdmin),
  });
}

export async function submitCatalogStockCheck(input: {
  sessionId: string;
  actor: AuditActor;
  request?: AuditRequestContext | null;
}): Promise<CatalogStockCheckSessionDto> {
  const actorUserId = input.actor.actorUserId;
  if (!actorUserId) {
    throw new CatalogStockCheckError("Actor required.", 400, "ACTOR_REQUIRED");
  }

  const session = await loadSession(input.sessionId);
  if (session.status !== "OPEN") {
    throw new CatalogStockCheckError(
      `Only OPEN sessions can be submitted (current: ${session.status}).`,
      409,
      "STATUS_LOCKED"
    );
  }

  const missing = session.lines.filter((l) => l.countedQty == null);
  if (missing.length > 0) {
    throw new CatalogStockCheckError(
      `Enter counted qty for all leaves before submit (${missing.length} remaining).`,
      400,
      "COUNTS_INCOMPLETE",
      { missingPowerIds: missing.map((m) => m.lensProductPowerId) }
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.catalogStockCheckSession.update({
      where: { id: session.id },
      data: {
        status: "SUBMITTED",
        submittedById: actorUserId,
        submittedAt: new Date(),
      },
      include: sessionInclude,
    });
    await recordAuditEvent(tx, {
      action: AuditAction.STOCK_CHECK_SUBMITTED,
      module: AuditModule.INVENTORY,
      entityType: "CatalogStockCheckSession",
      entityId: row.id,
      actor: input.actor,
      request: input.request ?? null,
      context: { publicId: row.publicId, lineCount: row.lines.length },
      activityMessage: `Stock check ${row.publicId} submitted for verify`,
    });
    return row;
  });

  return serializeSession(updated, { includeSystemQty: true });
}

export async function cancelCatalogStockCheck(input: {
  sessionId: string;
  actor: AuditActor;
  request?: AuditRequestContext | null;
}): Promise<CatalogStockCheckSessionDto> {
  const actorUserId = input.actor.actorUserId;
  if (!actorUserId) {
    throw new CatalogStockCheckError("Actor required.", 400, "ACTOR_REQUIRED");
  }

  const session = await loadSession(input.sessionId);
  if (session.status === "VERIFIED" || session.status === "CANCELLED") {
    throw new CatalogStockCheckError(
      `Session is already ${session.status}.`,
      409,
      "STATUS_LOCKED"
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.catalogStockCheckSession.update({
      where: { id: session.id },
      data: {
        status: "CANCELLED",
        cancelledById: actorUserId,
        cancelledAt: new Date(),
      },
      include: sessionInclude,
    });
    await recordAuditEvent(tx, {
      action: AuditAction.STOCK_CHECK_CANCELLED,
      module: AuditModule.INVENTORY,
      entityType: "CatalogStockCheckSession",
      entityId: row.id,
      actor: input.actor,
      request: input.request ?? null,
      context: { publicId: row.publicId },
      activityMessage: `Stock check ${row.publicId} cancelled — freeze lifted`,
    });
    return row;
  });

  return serializeSession(updated, { includeSystemQty: true });
}

export async function verifyCatalogStockCheck(input: {
  sessionId: string;
  /** Optional per-line Admin overrides before apply. */
  lineOverrides?: Array<{ powerId: string; countedQty: number }>;
  actor: AuditActor;
  request?: AuditRequestContext | null;
}): Promise<CatalogStockCheckSessionDto> {
  const actorUserId = input.actor.actorUserId;
  if (!actorUserId) {
    throw new CatalogStockCheckError("Actor required.", 400, "ACTOR_REQUIRED");
  }

  const session = await loadSession(input.sessionId);
  if (!canAdminVerifyStockCheck(session.status)) {
    throw new CatalogStockCheckError(
      `Cannot verify session in status ${session.status}.`,
      409,
      "STATUS_LOCKED"
    );
  }

  if (input.lineOverrides?.length) {
    await saveCatalogStockCheckCounts({
      sessionId: session.id,
      lines: input.lineOverrides.map((o) => ({
        powerId: o.powerId,
        countedQty: o.countedQty,
      })),
      asAdmin: true,
      actor: input.actor,
    });
  }

  const fresh = await loadSession(input.sessionId);
  const incomplete = fresh.lines.filter(
    (l) => effectiveCountedQty(l) == null
  );
  if (incomplete.length > 0) {
    throw new CatalogStockCheckError(
      "All lines need a counted qty before verify.",
      400,
      "COUNTS_INCOMPLETE"
    );
  }

  await prisma.$transaction(async (tx) => {
    for (const line of fresh.lines) {
      const counted = effectiveCountedQty(line)!;
      // Snapshot system qty at start is the baseline for the count;
      // apply against live on-hand via adjustment (re-reads inside).
      if (counted === line.lensProductPower.quantity) {
        await tx.catalogStockCheckLine.update({
          where: { id: line.id },
          data: { verifiedCountedQty: counted },
        });
        continue;
      }

      const adjustment = await createCatalogStockAdjustment({
        powerId: line.lensProductPowerId,
        countedQty: counted,
        reasonCode: "counting_error",
        reasonText: `Stock check ${fresh.publicId}`,
        actor: input.actor,
        request: input.request,
        allowFrozenSessionId: fresh.id,
        client: tx,
      });

      await tx.catalogStockCheckLine.update({
        where: { id: line.id },
        data: {
          verifiedCountedQty: counted,
          adjustmentId: adjustment.id,
        },
      });
    }

    await tx.catalogStockCheckSession.update({
      where: { id: fresh.id },
      data: {
        status: "VERIFIED",
        verifiedById: actorUserId,
        verifiedAt: new Date(),
        // If still OPEN (admin verified without employee submit), mark submitted too.
        ...(fresh.status === "OPEN"
          ? {
              submittedById: fresh.submittedById ?? actorUserId,
              submittedAt: fresh.submittedAt ?? new Date(),
            }
          : {}),
      },
    });

    await recordAuditEvent(tx, {
      action: AuditAction.STOCK_CHECK_VERIFIED,
      module: AuditModule.INVENTORY,
      entityType: "CatalogStockCheckSession",
      entityId: fresh.id,
      actor: input.actor,
      request: input.request ?? null,
      context: {
        publicId: fresh.publicId,
        lineCount: fresh.lines.length,
      },
      activityMessage: `Stock check ${fresh.publicId} verified — freeze lifted`,
    });
  });

  return getCatalogStockCheckSession(input.sessionId, { includeSystemQty: true });
}

/** Resolve product leaves for starting a check (admin helper). */
export async function listPowersForStockCheckProduct(productId: string) {
  const leaves = await prisma.lensProductPower.findMany({
    where: { lensProductVariant: { productId } },
    include: powerInclude,
    orderBy: [{ sph: "asc" }, { cyl: "asc" }],
  });
  return leaves.map((p) => ({
    id: p.id,
    skuCode: p.lensProductVariant.skuCode,
    name: p.lensProductVariant.name,
    sph: normalizeStockPower(num(p.sph)),
    cyl: normalizeStockPower(num(p.cyl)),
    onHand: p.quantity,
    family: p.lensProductVariant.product.family.name,
  }));
}
