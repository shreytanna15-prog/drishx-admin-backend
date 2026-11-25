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
  catalogNewRequestQuantity,
  catalogUnallocatedRequestQuantity,
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

type CatalogReorderInput = {
  powerId: string;
  actor?: AuditActor;
  request?: AuditRequestContext | null;
  client?: DbClient;
};

export async function runCatalogReorderCheck(
  input: CatalogReorderInput
): Promise<CatalogReorderCheckResult> {
  return input.client && input.client !== prisma
    ? runCatalogReorderCheckLocked(input, input.client)
    : prisma.$transaction(
        (tx) => runCatalogReorderCheckLocked(input, tx),
        { maxWait: 10_000, timeout: 20_000 }
      );
}

async function runCatalogReorderCheckLocked(
  input: CatalogReorderInput,
  db: DbClient
): Promise<CatalogReorderCheckResult> {
  // Serialize checks for this leaf so simultaneous Run reorder clicks cannot
  // each see the same uncovered shortage and create duplicate requests.
  const locked = await db.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "LensProductPower" WHERE "id" = ${input.powerId} FOR UPDATE`;
  if (!locked.length) {
    return { outcome: "not_needed", position: null, reason: "Stock leaf not found." };
  }
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
  const unallocated = catalogUnallocatedRequestQuantity(existing);
  const toRaise = catalogNewRequestQuantity(required, existing);
  if (existing.length > 0 && toRaise === 0) {
    return {
      outcome: "suppressed_existing",
      position,
      request: { id: existing[0]!.id, publicId: existing[0]!.publicId },
      reason: `${existing.length} open request(s) already cover this leaf (${unallocated} units unallocated).`,
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
    `Required ${required}, existing unallocated ${unallocated}, new ${toRaise}`,
    `Leaf ${position.skuCode} ${position.sph.toFixed(2)}/${position.cyl.toFixed(2)}`,
  ].join(" | ");

  const leafSupplier = await db.lensProductPower.findUnique({
    where: { id: position.id },
    select: { preferredSupplierId: true },
  });

  const created = await db.procurementRequest.create({
    data: {
      publicId: await nextProcurementRequestPublicId(db),
      lensType: (position.legacyLensType as LensType | null) ?? null,
      lensId: position.legacyLensId,
      lensProductPowerId: position.id,
      supplierId: leafSupplier?.preferredSupplierId ?? null,
      source: ProcurementRequestSource.MINIMUM_STOCK_THRESHOLD,
      status: ProcurementRequestStatus.OPEN,
      priority,
      requiredQuantity: toRaise,
      requestedQuantity: toRaise,
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
      required: String(toRaise),
    },
    activityMessage: `Catalog reorder ${created.publicId} — ${position.skuCode} (+${toRaise})`,
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
      client: input?.client,
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
