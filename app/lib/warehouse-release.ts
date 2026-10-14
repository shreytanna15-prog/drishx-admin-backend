import { prisma } from "./prisma";
import {
  AuditAction,
  AuditModule,
  type AuditActor,
  type AuditRequestContext,
  recordAuditEvent,
} from "./audit";
import { notifyStaffOfNewOrder } from "./staff-notifications";
import {
  assessWarehouseRelease,
  shouldNotifyStaffOnEligibilityChange,
} from "./prescription-order-hold";

export class WarehouseReleaseError extends Error {
  status: number;
  code: string;
  constructor(message: string, status = 400, code = "WAREHOUSE_RELEASE_ERROR") {
    super(message);
    this.name = "WarehouseReleaseError";
    this.status = status;
    this.code = code;
  }
}

/**
 * Admin-only: mark an RX/photo hold order available at the warehouse.
 * Idempotent when already released. Does not change assignment.
 * Notifies the assignee only when this action newly makes the order eligible.
 */
export async function releaseOrderToWarehouse(input: {
  orderId: string;
  actor: AuditActor;
  request?: AuditRequestContext | null;
}) {
  const actorUserId =
    input.actor && "actorUserId" in input.actor
      ? input.actor.actorUserId ?? null
      : null;
  if (!actorUserId) {
    throw new WarehouseReleaseError("Authenticated actor required.", 401);
  }

  const existing = await prisma.order.findUnique({
    where: { id: input.orderId },
    select: {
      id: true,
      orderNumber: true,
      warehouseHold: true,
      warehouseReleasedAt: true,
      assignedToId: true,
      user: { select: { name: true, email: true } },
    },
  });
  if (!existing) {
    throw new WarehouseReleaseError("Order not found.", 404, "ORDER_NOT_FOUND");
  }

  const assessment = assessWarehouseRelease(existing);
  if (assessment.reason === "NOT_HOLD_ORDER") {
    throw new WarehouseReleaseError(
      "This order does not require warehouse release.",
      409,
      "NOT_HOLD_ORDER"
    );
  }
  if (assessment.reason === "ALREADY_RELEASED" && existing.warehouseReleasedAt) {
    return existing;
  }

  const previouslyEligible =
    Boolean(existing.assignedToId) &&
    (!existing.warehouseHold || Boolean(existing.warehouseReleasedAt));

  // Conditional update: concurrent releases — only the first writer notifies.
  const releasedAt = new Date();
  const claimed = await prisma.order.updateMany({
    where: {
      id: existing.id,
      warehouseHold: true,
      warehouseReleasedAt: null,
    },
    data: {
      warehouseReleasedAt: releasedAt,
      warehouseReleasedById: actorUserId,
    },
  });

  const updated = await prisma.order.findUnique({
    where: { id: existing.id },
    select: {
      id: true,
      orderNumber: true,
      warehouseHold: true,
      warehouseReleasedAt: true,
      warehouseReleasedById: true,
      assignedToId: true,
      user: { select: { name: true, email: true } },
    },
  });
  if (!updated) {
    throw new WarehouseReleaseError("Order not found.", 404, "ORDER_NOT_FOUND");
  }

  if (claimed.count === 0) {
    // Lost the race or already released — idempotent success, no duplicate notify/audit.
    return updated;
  }

  await recordAuditEvent(prisma, {
    action: AuditAction.ORDER_UPDATED,
    module: AuditModule.ORDER,
    entityType: "Order",
    entityId: updated.id,
    actor: input.actor,
    request: input.request ?? null,
    context: {
      orderNumber: String(updated.orderNumber ?? ""),
      warehouseReleased: "true",
    },
    activityMessage: `Order #${updated.orderNumber ?? updated.id} released to warehouse`,
  });

  const notify = shouldNotifyStaffOnEligibilityChange({
    previouslyEligible,
    nowAssignedToId: updated.assignedToId,
    warehouseHold: updated.warehouseHold,
    warehouseReleasedAt: updated.warehouseReleasedAt,
  });
  if (notify.notify && notify.assigneeId) {
    const label =
      updated.user?.name?.trim() || updated.user?.email || "Customer";
    await notifyStaffOfNewOrder(updated.id, label, notify.assigneeId);
  }

  return updated;
}
