/**
 * Stock S4 — Run reorder against catalog stock leaves (LensProductPower rules).
 */

import {
  LensType,
  Prisma,
  ProcurementPriority,
  ProcurementRequestSource,
  ProcurementRequestStatus,
} from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import {
  AuditAction,
  AuditModule,
  systemActor,
  type AuditActor,
  type AuditRequestContext,
  recordAuditEvent,
} from "@/app/lib/audit";
import {
  deriveReorderPriority,
} from "@/app/lib/procurement-rules";
import { openPurchaseOrderSuppression } from "@/app/lib/purchase-order-math";
import { PROCUREMENT_REQUEST_STATUSES_OPEN } from "@/app/lib/procurement-rules";
import { nextProcurementRequestPublicId } from "@/app/lib/procurement-requests";
import {
  calculateCatalogRequiredQuantity,
  shouldRaiseCatalogReorder,
} from "@/app/lib/catalog/catalog-stock-position-core";
import {
  getCatalogStockPosition,
  type CatalogStockPositionDto,
} from "@/app/lib/catalog/catalog-stock-position";

type DbClient = Prisma.TransactionClient | typeof prisma;

export class CatalogReorderError extends Error {
  status: number;
  code: string;
  constructor(message: string, status = 400, code = "CATALOG_REORDER_ERROR") {
    super(message);
    this.name = "CatalogReorderError";
    this.status = status;
    this.code = code;
  }
}

export type CatalogReorderCheckResult =
  | {
      outcome: "created";
      request: { id: string; publicId: string; requestedQuantity: number };
      position: CatalogStockPositionDto;
    }
  | {
      outcome: "suppressed_open_po";
      position: CatalogStockPositionDto;
      purchaseOrder: { id: string; publicId: string; status: string };
      reason: string;
    }
  | {
      outcome: "suppressed_existing";
      position: CatalogStockPositionDto;
      request: { id: string; publicId: string };
      reason: string;
    }
  | {
      outcome: "not_needed";
      position: CatalogStockPositionDto | null;
      reason: string;
    };

export async function runCatalogReorderCheck(input: {
  powerId: string;
  actor?: AuditActor;
  request?: AuditRequestContext | null;
  client?: DbClient;
}): Promise<CatalogReorderCheckResult> {
  const db = input.client ?? prisma;
  const position = await getCatalogStockPosition(input.powerId, db);
  if (!position) {
    return { outcome: "not_needed", position: null, reason: "Stock leaf not found." };
  }

  if (position.openPo) {
    const reason =
      openPurchaseOrderSuppression(position.openPo) ??
      `Purchase order ${position.openPo.publicId} is still open for this leaf.`;
    return {
      outcome: "suppressed_open_po",
      position,
      purchaseOrder: position.openPo,
      reason,
    };
  }

  const gate = shouldRaiseCatalogReorder({
    available: position.available,
    minStock: position.minStock,
    targetStock: position.targetStock,
    openPoExists: false,
  });
  if (!gate.raise) {
    return { outcome: "not_needed", position, reason: gate.reason };
  }

  const required = calculateCatalogRequiredQuantity({
    available: position.available,
    targetStock: position.targetStock,
    incoming: position.incoming,
    unreservedShortage: 0,
    moq: null,
  });
  if (required <= 0) {
    return {
      outcome: "not_needed",
      position,
      reason: `Incoming ${position.incoming} already covers the target of ${position.targetStock}.`,
    };
  }

  const existing = await db.procurementRequest.findMany({
    where: {
      lensProductPowerId: position.id,
      status: {
        in: [...PROCUREMENT_REQUEST_STATUSES_OPEN] as ProcurementRequestStatus[],
      },
    },
    orderBy: { createdAt: "asc" },
  });
  const coveredTotal = position.available + position.incoming;
  if (existing.length > 0 && coveredTotal >= position.targetStock) {
    return {
      outcome: "suppressed_existing",
      position,
      request: { id: existing[0]!.id, publicId: existing[0]!.publicId },
      reason: `${existing.length} open request(s) already cover this leaf.`,
    };
  }

  const priority = deriveReorderPriority(
    position.available,
    position.minStock
  ) as ProcurementPriority;
  const triggerReason = [
    "MINIMUM_STOCK_THRESHOLD",
    `Available ${position.available} <= threshold ${position.minStock}`,
    `Target ${position.targetStock}, incoming ${position.incoming}`,
    `Required ${required}`,
    `Leaf ${position.skuCode} ${position.sph.toFixed(2)}/${position.cyl.toFixed(2)}`,
  ].join(" | ");

  const created = await db.procurementRequest.create({
    data: {
      publicId: await nextProcurementRequestPublicId(prisma),
      lensType: (position.legacyLensType as LensType | null) ?? null,
      lensId: position.legacyLensId,
      lensProductPowerId: position.id,
      source: ProcurementRequestSource.MINIMUM_STOCK_THRESHOLD,
      status: ProcurementRequestStatus.OPEN,
      priority,
      requiredQuantity: required,
      requestedQuantity: required,
      stockAtTrigger: position.onHand,
      availableAtTrigger: position.available,
      incomingAtTrigger: position.incoming,
      minStockAtTrigger: position.minStock,
      targetStockAtTrigger: position.targetStock,
      triggerReason,
      createdById:
        input.actor && "actorUserId" in input.actor && input.actor.actorUserId
          ? input.actor.actorUserId
          : null,
    },
  });

  await recordAuditEvent(db, {
    action: AuditAction.PROCUREMENT_REQUEST_AUTO_TRIGGERED,
    module: AuditModule.INVENTORY,
    entityType: "ProcurementRequest",
    entityId: created.id,
    actor: input.actor ?? systemActor(),
    request: input.request ?? null,
    context: {
      publicId: created.publicId,
      lensProductPowerId: position.id,
      available: String(position.available),
      minStock: String(position.minStock),
      targetStock: String(position.targetStock),
      required: String(required),
    },
    activityMessage: `Catalog reorder ${created.publicId} — ${position.skuCode} (+${required})`,
  });

  return {
    outcome: "created",
    request: {
      id: created.id,
      publicId: created.publicId,
      requestedQuantity: created.requestedQuantity,
    },
    position,
  };
}

/** Manual Run reorder across catalog leaves with threshold/target configured. */
export async function runCatalogReorderCheckAll(input?: {
  actor?: AuditActor;
  request?: AuditRequestContext | null;
  client?: DbClient;
  limit?: number;
}): Promise<{
  scanned: number;
  created: number;
  suppressed: number;
  notNeeded: number;
  results: Array<{
    powerId: string;
    skuCode: string;
    outcome: CatalogReorderCheckResult["outcome"];
    publicId?: string;
    reason?: string;
  }>;
}> {
  const db = input?.client ?? prisma;
  const limit = Math.min(Math.max(input?.limit ?? 2000, 1), 5000);

  const leaves = await db.lensProductPower.findMany({
    where: {
      OR: [{ minStock: { gt: 0 } }, { targetStock: { gt: 0 } }],
    },
    select: {
      id: true,
      lensProductVariant: { select: { skuCode: true } },
    },
    take: limit,
  });

  const results: Array<{
    powerId: string;
    skuCode: string;
    outcome: CatalogReorderCheckResult["outcome"];
    publicId?: string;
    reason?: string;
  }> = [];
  let created = 0;
  let suppressed = 0;
  let notNeeded = 0;

  for (const leaf of leaves) {
    const outcome = await runCatalogReorderCheck({
      powerId: leaf.id,
      actor: input?.actor,
      request: input?.request,
      client: db,
    });
    const skuCode = leaf.lensProductVariant.skuCode;
    if (outcome.outcome === "created") {
      created += 1;
      results.push({
        powerId: leaf.id,
        skuCode,
        outcome: "created",
        publicId: outcome.request.publicId,
      });
    } else if (
      outcome.outcome === "suppressed_open_po" ||
      outcome.outcome === "suppressed_existing"
    ) {
      suppressed += 1;
      results.push({
        powerId: leaf.id,
        skuCode,
        outcome: outcome.outcome,
        publicId:
          outcome.outcome === "suppressed_existing"
            ? outcome.request.publicId
            : outcome.purchaseOrder.publicId,
        reason: outcome.reason,
      });
    } else {
      notNeeded += 1;
      results.push({
        powerId: leaf.id,
        skuCode,
        outcome: "not_needed",
        reason: outcome.reason,
      });
    }
  }

  return {
    scanned: leaves.length,
    created,
    suppressed,
    notNeeded,
    results,
  };
}
