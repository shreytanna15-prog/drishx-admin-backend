import { OrderModificationStatus, OrderStatus } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import { cancelOrderInTransaction } from "@/app/lib/cancel-order";
import { assertOrderInvoiceAllowsCancellation } from "@/app/lib/finance/void-unpaid-invoice";
import { logOrderActivity } from "@/app/lib/order-activity";
import {
  AuditAction, AuditModule, actorFromSession, recordAuditEvent,
  type AuditRequestContext,
} from "@/app/lib/audit";
import type { SessionPayload } from "@/app/lib/auth";
import { CatalogOrderStockError } from "@/app/lib/catalog/catalog-order-stock";

const EDITABLE_STATUSES: OrderStatus[] = [
  OrderStatus.PENDING, OrderStatus.PICKING,
  OrderStatus.PARTIALLY_FULFILLED, OrderStatus.AWAITING_PROCUREMENT,
  OrderStatus.PACKED,
];

export async function requestOrderModification(input: {
  orderId: string; quantity: number; powerId?: string | null;
  reason: string; session: SessionPayload; request?: AuditRequestContext | null;
}) {
  const reason = input.reason.trim();
  if (!reason || reason.length > 500 || !Number.isInteger(input.quantity) || input.quantity <= 0) {
    throw new CatalogOrderStockError("A reason and positive whole-number quantity are required.", 400, "INVALID_CHANGE_REQUEST");
  }
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${input.orderId} FOR UPDATE`;
    const order = await tx.order.findUnique({ where: { id: input.orderId } });
    if (!order?.lensProductPowerId) {
      throw new CatalogOrderStockError("Only catalog orders support this controlled change workflow.", 409, "CATALOG_ORDER_REQUIRED");
    }
    if (!EDITABLE_STATUSES.includes(order.status)) {
      throw new CatalogOrderStockError("This order cannot be changed after dispatch or completion.", 409, "ORDER_NOT_EDITABLE");
    }
    const powerId = input.powerId?.trim() || order.lensProductPowerId;
    if (input.quantity === order.quantity && powerId === order.lensProductPowerId) {
      throw new CatalogOrderStockError("Specify a different power or quantity.", 400, "NO_CHANGE");
    }
    const power = await tx.lensProductPower.findUnique({
      where: { id: powerId },
      select: { lensProductVariant: { select: { isActive: true, product: { select: { isActive: true } } } } },
    });
    if (!power?.lensProductVariant.isActive || !power.lensProductVariant.product.isActive) {
      throw new CatalogOrderStockError("The requested catalog power is unavailable.", 400, "POWER_UNAVAILABLE");
    }
    const created = await tx.orderModificationRequest.create({
      data: {
        orderId: order.id, requestedById: input.session.userId,
        requestedQuantity: input.quantity, requestedPowerId: powerId,
        reason,
      },
    });
    await recordAuditEvent(tx, {
      action: AuditAction.ORDER_MODIFICATION_REQUESTED, module: AuditModule.ORDER,
      entityType: "OrderModificationRequest", entityId: created.id,
      actor: actorFromSession(input.session), request: input.request ?? null,
      context: { orderId: order.id, powerId, quantity: input.quantity },
      activityMessage: `Change requested for order ${order.orderNumber ?? order.id}`,
    });
    return created;
  }, { maxWait: 10_000, timeout: 20_000 });
}

export async function decideOrderModification(input: {
  orderId: string; requestId: string; approve: boolean;
  reason: string; goodsReturnedConfirmed: boolean;
  session: SessionPayload; request?: AuditRequestContext | null;
}) {
  const decisionReason = input.reason.trim();
  if (!decisionReason || decisionReason.length > 500) {
    throw new CatalogOrderStockError("A decision reason is required.", 400, "REASON_REQUIRED");
  }
  if (input.approve) {
    const gate = await assertOrderInvoiceAllowsCancellation(input.orderId);
    if (!gate.ok) throw new CatalogOrderStockError(gate.error, 409, "INVOICE_BLOCKED");
  }
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "OrderModificationRequest" WHERE "id" = ${input.requestId} FOR UPDATE`;
    const request = await tx.orderModificationRequest.findUnique({ where: { id: input.requestId } });
    if (!request || request.orderId !== input.orderId) {
      throw new CatalogOrderStockError("Change request not found.", 404, "CHANGE_NOT_FOUND");
    }
    if (request.status !== OrderModificationStatus.PENDING) {
      throw new CatalogOrderStockError("This change request was already decided.", 409, "CHANGE_ALREADY_DECIDED");
    }
    if (input.approve) {
      const order = await tx.order.findUniqueOrThrow({ where: { id: input.orderId } });
      if (order.pickedQuantity > 0 && !input.goodsReturnedConfirmed) {
        throw new CatalogOrderStockError("Confirm the picked goods were physically returned before approving reversal.", 409, "GOODS_RETURN_REQUIRED");
      }
      if (!EDITABLE_STATUSES.includes(order.status)) {
        throw new CatalogOrderStockError("Order can no longer be reversed.", 409, "ORDER_NOT_EDITABLE");
      }
      await cancelOrderInTransaction({
        tx, orderId: order.id,
        reason: `Approved change request ${request.id}: ${decisionReason}`,
        session: input.session, request: input.request,
      });
    }
    const status = input.approve ? OrderModificationStatus.APPROVED : OrderModificationStatus.REJECTED;
    const updated = await tx.orderModificationRequest.update({
      where: { id: request.id },
      data: {
        status, decidedById: input.session.userId,
        decisionReason, decidedAt: new Date(),
        goodsReturnedConfirmed: input.approve && input.goodsReturnedConfirmed,
      },
    });
    await logOrderActivity(tx, {
      orderId: input.orderId, actorUserId: input.session.userId,
      action: input.approve ? "CHANGE_APPROVED" : "CHANGE_REJECTED",
      message: input.approve
        ? "Order reversed after admin approval. Place a new order for the requested power/quantity."
        : `Change request rejected: ${decisionReason}`,
      metadata: { requestId: request.id, requestedPowerId: request.requestedPowerId, requestedQuantity: request.requestedQuantity },
    });
    await recordAuditEvent(tx, {
      action: input.approve ? AuditAction.ORDER_MODIFICATION_APPROVED : AuditAction.ORDER_MODIFICATION_REJECTED,
      module: AuditModule.ORDER, entityType: "OrderModificationRequest", entityId: request.id,
      actor: actorFromSession(input.session), request: input.request ?? null,
      reasonText: decisionReason,
      context: { orderId: input.orderId, requestedPowerId: request.requestedPowerId, requestedQuantity: request.requestedQuantity, goodsReturnedConfirmed: input.goodsReturnedConfirmed },
      activityMessage: `Order change request ${status.toLowerCase()}`,
    });
    return updated;
  }, { maxWait: 10_000, timeout: 60_000 });
}
