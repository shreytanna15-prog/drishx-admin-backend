import type { LensType, Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import {
  AuditAction,
  AuditModule,
  getLensQuantity,
  recordAuditEvent,
  recordStockMovement,
  singleChange,
  systemActor,
  type AuditRequestContext,
} from "./index";

type DbClient = Prisma.TransactionClient | typeof prisma;

export async function logStockDelta(input: {
  lensType: LensType;
  lensId: string;
  quantityDelta: number;
  movementType: "STOCK_DECREMENTED" | "STOCK_INCREMENTED" | "STOCK_ADJUSTED" | "STOCK_PICKED" | "STOCK_RESTORED" | "STOCK_RECEIVED";
  actorUserId?: string | null;
  actorName?: string | null;
  orderId?: string | null;
  referenceId?: string | null;
  sourceType?: string | null;
  reasonCode?: string | null;
  reasonText?: string | null;
  request?: AuditRequestContext | null;
  quantityBefore?: number;
  quantityAfter?: number;
  /**
   * Pass a `$transaction` client so the movement row and audit event commit
   * atomically with the stock write they describe. Defaults to the global client
   * to keep existing call sites working.
   */
  client?: DbClient;
}) {
  const db = input.client ?? prisma;

  const before =
    input.quantityBefore ??
    (await getLensQuantity(db, input.lensType, input.lensId)) ??
    0;
  const after =
    input.quantityAfter ?? before + input.quantityDelta;

  const stockMovementType =
    input.movementType === "STOCK_RECEIVED"
      ? "RECEIVED"
      : input.movementType === "STOCK_PICKED"
        ? "PICKED"
        : input.movementType === "STOCK_RESTORED"
          ? "RESTORED"
          : input.quantityDelta >= 0
            ? "ADJUSTED"
            : "ADJUSTED";

  await recordStockMovement(db, {
    lensType: input.lensType,
    lensId: input.lensId,
    movementType: stockMovementType,
    quantityDelta: input.quantityDelta,
    quantityBefore: before,
    quantityAfter: after,
    sourceType: input.sourceType ?? null,
    referenceId: input.referenceId ?? null,
    orderId: input.orderId ?? null,
    actorUserId: input.actorUserId ?? null,
    reasonCode: input.reasonCode ?? null,
    reasonText: input.reasonText ?? null,
  });

  const auditAction =
    input.movementType === "STOCK_RECEIVED"
      ? AuditAction.STOCK_RECEIVED
      : input.movementType === "STOCK_PICKED"
        ? AuditAction.STOCK_PICKED
        : input.movementType === "STOCK_RESTORED"
          ? AuditAction.STOCK_RESTORED
          : input.quantityDelta >= 0
            ? AuditAction.STOCK_INCREMENTED
            : AuditAction.STOCK_DECREMENTED;

  await recordAuditEvent(db, {
    action: auditAction,
    module: AuditModule.INVENTORY,
    entityType: "LensSku",
    entityId: input.lensId,
    actor: input.actorUserId
      ? {
          actorType: "HUMAN",
          actorUserId: input.actorUserId,
          actorName: input.actorName ?? null,
        }
      : systemActor(),
    request: input.request ?? null,
    reasonCode: input.reasonCode ?? null,
    reasonText: input.reasonText ?? null,
    changes: singleChange("quantity", before, after),
    context: { lensType: input.lensType, quantityDelta: input.quantityDelta },
    relatedRefs: input.orderId ? { orderId: input.orderId } : undefined,
    activityMessage: `Stock ${input.quantityDelta >= 0 ? "+" : ""}${input.quantityDelta} (${before} → ${after})`,
  });
}
