/**
 * Stock S4 — discrepancy hold (blockedQty) on catalog leaves.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import {
  type AuditActor,
  type AuditRequestContext,
  AuditAction,
  AuditModule,
  recordAuditEvent,
  singleChange,
} from "@/app/lib/audit";
import { assertCatalogPowersNotFrozen } from "@/app/lib/catalog/catalog-stock-freeze";
import { getCatalogStockPosition } from "@/app/lib/catalog/catalog-stock-position";

type DbClient = Prisma.TransactionClient | typeof prisma;

export class CatalogStockBlockError extends Error {
  status: number;
  code: string;
  constructor(message: string, status = 400, code = "CATALOG_STOCK_BLOCK") {
    super(message);
    this.name = "CatalogStockBlockError";
    this.status = status;
    this.code = code;
  }
}

/**
 * Set absolute blockedQty on a leaf (discrepancy hold).
 * Does not change on-hand; available = onHand − reserved − blocked.
 */
export async function setCatalogPowerBlockedQty(input: {
  powerId: string;
  blockedQty: number;
  reasonText?: string | null;
  actor: AuditActor;
  request?: AuditRequestContext | null;
  client?: DbClient;
  /** Skip freeze guard when verifying a stock check for this session. */
  allowFrozenSessionId?: string | null;
}) {
  if (
    !Number.isInteger(input.blockedQty) ||
    input.blockedQty < 0 ||
    input.blockedQty > 1_000_000
  ) {
    throw new CatalogStockBlockError(
      "blockedQty must be a whole number ≥ 0.",
      400,
      "INVALID_BLOCKED"
    );
  }

  const db = input.client ?? prisma;
  await assertCatalogPowersNotFrozen([input.powerId], {
    exceptSessionId: input.allowFrozenSessionId,
    client: db,
  });

  const leaf = await db.lensProductPower.findUnique({
    where: { id: input.powerId },
    select: { id: true, quantity: true, blockedQty: true },
  });
  if (!leaf) {
    throw new CatalogStockBlockError("Stock leaf not found.", 404, "POWER_NOT_FOUND");
  }

  if (input.blockedQty > leaf.quantity) {
    throw new CatalogStockBlockError(
      `Blocked (${input.blockedQty}) cannot exceed on-hand (${leaf.quantity}).`,
      409,
      "BLOCKED_EXCEEDS_ON_HAND"
    );
  }

  if (input.blockedQty === leaf.blockedQty) {
    return getCatalogStockPosition(leaf.id, db);
  }

  const before = leaf.blockedQty;
  await db.lensProductPower.update({
    where: { id: leaf.id },
    data: { blockedQty: input.blockedQty },
  });

  await db.stockMovement.create({
    data: {
      lensProductPowerId: leaf.id,
      movementType: "ADJUSTED",
      quantityDelta: 0,
      quantityBefore: leaf.quantity,
      quantityAfter: leaf.quantity,
      sourceType: "CatalogBlockedQty",
      actorUserId: input.actor.actorUserId ?? null,
      reasonCode: "discrepancy_hold",
      reasonText: input.reasonText?.trim() || null,
      notes: `blockedQty ${before} → ${input.blockedQty}`,
    },
  });

  await recordAuditEvent(db, {
    action: AuditAction.STOCK_ADJUSTED,
    module: AuditModule.INVENTORY,
    entityType: "LensProductPower",
    entityId: leaf.id,
    actor: input.actor,
    request: input.request ?? null,
    changes: singleChange("blockedQty", before, input.blockedQty),
    context: {
      lensProductPowerId: leaf.id,
      reasonText: input.reasonText?.trim() || null,
    },
    activityMessage: `Catalog blocked qty ${before} → ${input.blockedQty}`,
  });

  return getCatalogStockPosition(leaf.id, db);
}

/**
 * Increment blockedQty by short qty (pick discrepancy bridge).
 * No-op when leaf missing or delta ≤ 0.
 */
export async function incrementCatalogBlockedByLegacyLens(input: {
  lensType: string;
  lensId: string;
  shortQty: number;
  actorUserId?: string | null;
  referenceId?: string | null;
  client?: DbClient;
}): Promise<{ powerId: string; blockedQty: number } | null> {
  if (!Number.isInteger(input.shortQty) || input.shortQty <= 0) return null;
  const db = input.client ?? prisma;

  const leaf = await db.lensProductPower.findFirst({
    where: {
      legacyLensType: input.lensType as never,
      legacyLensId: input.lensId,
    },
    select: { id: true, quantity: true, blockedQty: true },
  });
  if (!leaf) return null;

  const next = Math.min(leaf.quantity, leaf.blockedQty + input.shortQty);
  if (next === leaf.blockedQty) return { powerId: leaf.id, blockedQty: next };

  await db.lensProductPower.update({
    where: { id: leaf.id },
    data: { blockedQty: next },
  });

  await db.stockMovement.create({
    data: {
      lensProductPowerId: leaf.id,
      lensType: input.lensType as never,
      lensId: input.lensId,
      movementType: "ADJUSTED",
      quantityDelta: 0,
      quantityBefore: leaf.quantity,
      quantityAfter: leaf.quantity,
      sourceType: "PickDiscrepancy",
      referenceId: input.referenceId ?? null,
      actorUserId: input.actorUserId ?? null,
      reasonCode: "pick_short",
      notes: `blockedQty +${input.shortQty} (${leaf.blockedQty} → ${next})`,
    },
  });

  return { powerId: leaf.id, blockedQty: next };
}
