/**
 * Stock S3 — post accepted PO receipt qty onto a catalog stock leaf.
 * Freeze-guarded; writes LensProductPower.quantity + StockMovement + audit.
 * Default: no dual-write to legacy lens tables.
 */

import { Prisma, type LensType } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import {
  type AuditActor,
  type AuditRequestContext,
  AuditAction,
  AuditModule,
  recordAuditEvent,
  singleChange,
  systemActor,
} from "@/app/lib/audit";
import { assertCatalogPowersNotFrozen } from "@/app/lib/catalog/catalog-stock-freeze";

type DbClient = Prisma.TransactionClient | typeof prisma;

export class CatalogStockReceiveError extends Error {
  status: number;
  code: string;
  details?: Record<string, unknown>;
  constructor(
    message: string,
    status = 400,
    code = "CATALOG_STOCK_RECEIVE_ERROR",
    details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "CatalogStockReceiveError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function receiveCatalogStockLine(input: {
  lensProductPowerId: string;
  quantityAdded: number;
  /** When set, updates leaf legacy cost bridge only if dualWriteLegacy — unused by default. */
  costPrice?: number | null;
  actorUserId: string;
  referenceId?: string | null;
  /** Default false — do not bump SingleVisionLens / etc. */
  dualWriteLegacy?: boolean;
  client?: DbClient;
}): Promise<{
  powerId: string;
  quantityBefore: number;
  quantityAfter: number;
  legacyLensType: LensType | null;
  legacyLensId: string | null;
}> {
  if (!Number.isInteger(input.quantityAdded) || input.quantityAdded <= 0) {
    throw new CatalogStockReceiveError(
      "quantityAdded must be a positive whole number.",
      400,
      "INVALID_QTY"
    );
  }

  const db = input.client ?? prisma;
  const powerId = input.lensProductPowerId.trim();
  if (!powerId) {
    throw new CatalogStockReceiveError(
      "lensProductPowerId is required.",
      400,
      "POWER_REQUIRED"
    );
  }

  await assertCatalogPowersNotFrozen([powerId], { client: db });

  const leaf = await db.lensProductPower.findUnique({
    where: { id: powerId },
    select: {
      id: true,
      quantity: true,
      legacyLensType: true,
      legacyLensId: true,
      lensProductVariantId: true,
      sph: true,
      cyl: true,
    },
  });
  if (!leaf) {
    throw new CatalogStockReceiveError(
      "Catalog stock leaf not found.",
      404,
      "POWER_NOT_FOUND"
    );
  }

  const quantityBefore = leaf.quantity;
  const quantityAfter = quantityBefore + input.quantityAdded;

  await db.lensProductPower.update({
    where: { id: leaf.id },
    data: { quantity: quantityAfter },
  });

  await db.stockMovement.create({
    data: {
      lensProductPowerId: leaf.id,
      lensType: leaf.legacyLensType,
      lensId: leaf.legacyLensId,
      movementType: "RECEIVED",
      quantityDelta: input.quantityAdded,
      quantityBefore,
      quantityAfter,
      sourceType: "PROCUREMENT",
      referenceId: input.referenceId ?? null,
      actorUserId: input.actorUserId,
    },
  });

  await recordAuditEvent(db, {
    action: AuditAction.STOCK_RECEIVED,
    module: AuditModule.INVENTORY,
    entityType: "LensProductPower",
    entityId: leaf.id,
    actor: {
      actorType: "HUMAN",
      actorUserId: input.actorUserId,
      actorName: null,
    } satisfies AuditActor,
    request: null as AuditRequestContext | null,
    changes: singleChange("quantity", quantityBefore, quantityAfter),
    context: {
      lensProductPowerId: leaf.id,
      quantityDelta: input.quantityAdded,
      referenceId: input.referenceId ?? null,
    },
    activityMessage: `Catalog stock received +${input.quantityAdded} (${quantityBefore} → ${quantityAfter})`,
  });

  // Dual-write intentionally omitted unless callers opt in (default no).
  void input.dualWriteLegacy;
  void input.costPrice;
  void systemActor;

  return {
    powerId: leaf.id,
    quantityBefore,
    quantityAfter,
    legacyLensType: leaf.legacyLensType,
    legacyLensId: leaf.legacyLensId,
  };
}
