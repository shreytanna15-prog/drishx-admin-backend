import { ProcurementRequestStatus } from "@prisma/client";
import {
  AuditAction,
  AuditModule,
  systemActor,
  type AuditActor,
  type AuditRequestContext,
  recordAuditEvent,
} from "./audit";
import type { DbClient } from "./procurement-lens";
import {
  planAllocationReceipts,
  planAllocationReversals,
} from "./purchase-order-receive-math";

/**
 * Exact PR ↔ PO allocation bookkeeping (RW-08).
 *
 * Every helper here must run inside the transaction that holds the
 * PurchaseOrder row lock (see `lockPurchaseOrder`), so allocation rows for the
 * PO cannot change underneath it. PR counters use atomic increments because a
 * request can be touched by other flows (request cancel/approve) concurrently.
 */

/** PR status after its ordered quantity changes (never reopens closed PRs). */
export function statusAfterOrderedChange(
  current: ProcurementRequestStatus,
  orderedAfter: number
): ProcurementRequestStatus {
  if (
    current === ProcurementRequestStatus.CANCELLED ||
    current === ProcurementRequestStatus.RESOLVED
  ) {
    return current;
  }
  return orderedAfter > 0 ? ProcurementRequestStatus.APPROVED : ProcurementRequestStatus.OPEN;
}

/**
 * Release `quantity` units of this PO line's allocations back to their PRs
 * (cancel / close outstanding). Received units are never reversed.
 * Returns the quantity actually reversed.
 */
export async function reverseLineAllocations(
  tx: DbClient,
  purchaseOrderLineId: string,
  quantity: number
): Promise<number> {
  if (quantity <= 0) return 0;
  const allocations = await tx.purchaseOrderAllocation.findMany({
    where: { purchaseOrderLineId, reversedAt: null },
    orderBy: { createdAt: "asc" },
  });
  const plan = planAllocationReversals(allocations, quantity);
  let reversed = 0;
  for (const step of plan) {
    const row = allocations.find((a) => a.id === step.id);
    if (!row) continue;
    const pr = await tx.procurementRequest.update({
      where: { id: row.procurementRequestId },
      data: { orderedQuantity: { decrement: step.reverseBy } },
    });
    const orderedAfter = Math.max(0, pr.orderedQuantity);
    await tx.procurementRequest.update({
      where: { id: pr.id },
      data: {
        orderedQuantity: orderedAfter,
        status: statusAfterOrderedChange(pr.status, orderedAfter),
      },
    });
    const nextReversed = row.reversedQuantity + step.reverseBy;
    await tx.purchaseOrderAllocation.update({
      where: { id: row.id },
      data: {
        reversedQuantity: nextReversed,
        // Fully settled once nothing reversible remains.
        reversedAt:
          nextReversed + row.receivedQuantity >= row.quantity ? new Date() : null,
      },
    });
    reversed += step.reverseBy;
  }
  return reversed;
}

/**
 * Settle a confirmed receipt quantity against this PO line's PR allocations
 * (FIFO) and advance those PRs' received counters. Only the PRs allocated to
 * this PO line are touched — never unrelated open requests for the power.
 */
export async function receiveLineAllocations(
  tx: DbClient,
  input: {
    purchaseOrderLineId: string;
    quantity: number;
    poPublicId: string;
    receiptPublicId: string;
    actor?: AuditActor;
    request?: AuditRequestContext | null;
  }
): Promise<Array<{ procurementRequestId: string; received: number; resolved: boolean }>> {
  if (input.quantity <= 0) return [];
  const allocations = await tx.purchaseOrderAllocation.findMany({
    where: { purchaseOrderLineId: input.purchaseOrderLineId, reversedAt: null },
    orderBy: { createdAt: "asc" },
  });
  const plan = planAllocationReceipts(allocations, input.quantity);
  const settled: Array<{ procurementRequestId: string; received: number; resolved: boolean }> =
    [];

  for (const step of plan) {
    const row = allocations.find((a) => a.id === step.id);
    if (!row) continue;
    const nextReceived = row.receivedQuantity + step.receiveBy;
    await tx.purchaseOrderAllocation.update({
      where: { id: row.id },
      data: {
        receivedQuantity: nextReceived,
        reversedAt:
          nextReceived + row.reversedQuantity >= row.quantity ? new Date() : null,
      },
    });

    const pr = await tx.procurementRequest.update({
      where: { id: step.procurementRequestId },
      data: { receivedQuantity: { increment: step.receiveBy } },
    });
    const resolved =
      pr.receivedQuantity >= pr.requestedQuantity &&
      pr.status !== ProcurementRequestStatus.CANCELLED &&
      pr.status !== ProcurementRequestStatus.RESOLVED;
    if (resolved) {
      await tx.procurementRequest.update({
        where: { id: pr.id },
        data: {
          status: ProcurementRequestStatus.RESOLVED,
          resolvedAt: new Date(),
          resolutionReason: `Fully received (${input.poPublicId} / ${input.receiptPublicId})`,
        },
      });
    }

    await recordAuditEvent(tx, {
      action: resolved
        ? AuditAction.PROCUREMENT_REQUEST_RESOLVED
        : AuditAction.PROCUREMENT_REQUEST_RECEIVED,
      module: AuditModule.INVENTORY,
      entityType: "ProcurementRequest",
      entityId: pr.id,
      actor: input.actor ?? systemActor(),
      request: input.request ?? null,
      context: {
        publicId: pr.publicId,
        applied: String(step.receiveBy),
        received: String(pr.receivedQuantity),
        requested: String(pr.requestedQuantity),
        purchaseOrder: input.poPublicId,
        goodsReceipt: input.receiptPublicId,
      },
      activityMessage: resolved
        ? `Procurement request ${pr.publicId} fully received via ${input.receiptPublicId}`
        : `Procurement request ${pr.publicId} received +${step.receiveBy} via ${input.receiptPublicId}`,
    });

    settled.push({
      procurementRequestId: pr.id,
      received: step.receiveBy,
      resolved,
    });
  }
  return settled;
}
