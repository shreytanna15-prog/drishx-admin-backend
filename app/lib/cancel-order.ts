import { OrderStatus, Prisma } from "@prisma/client";
import { restorePickedStock } from "@/app/lib/order-inventory";
import { cancelUnallocatedOrderDemand } from "@/app/lib/procurement-requests";
import { voidTransaction } from "@/app/lib/audit-query";
import { reverseRedemption } from "@/app/lib/loyalty/redeem";
import { voidUnpaidInvoiceOnOrderCancel } from "@/app/lib/finance/void-unpaid-invoice";
import {
  AuditAction, AuditModule, ReasonCode, actorFromSession,
  recordAuditEvent, singleChange, type AuditRequestContext,
} from "@/app/lib/audit";
import type { SessionPayload } from "@/app/lib/auth";
import { CatalogOrderStockError } from "@/app/lib/catalog/catalog-order-stock";

/** Used by ordinary cancellation and approved change requests. All writes commit together. */
export async function cancelOrderInTransaction(input: {
  tx: Prisma.TransactionClient;
  orderId: string;
  reason: string;
  session: SessionPayload;
  request?: AuditRequestContext | null;
  updateData?: Prisma.OrderUpdateInput;
}) {
  const { tx, session, orderId } = input;
  await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`;
  const order = await tx.order.findUnique({ where: { id: orderId } });
  if (!order) throw new CatalogOrderStockError("Order not found.", 404, "ORDER_NOT_FOUND");
  if (order.status === OrderStatus.CANCELLED) {
    throw new CatalogOrderStockError("Order is already cancelled.", 409, "ORDER_CANCELLED");
  }
  await restorePickedStock(order, {
    actorUserId: session.userId, orderId, request: input.request,
  }, tx);
  await cancelUnallocatedOrderDemand({
    orderId, reason: input.reason, tx,
    actor: actorFromSession(session), request: input.request,
  });
  if (order.transactionId) {
    await voidTransaction(
      order.transactionId, ReasonCode.VOID.INCORRECT_ENTRY,
      input.reason, session, tx
    );
  }
  await reverseRedemption({ customerId: order.userId, orderId, db: tx });
  const cancelled = await tx.order.update({
    where: { id: orderId },
    data: {
      ...input.updateData,
      status: OrderStatus.CANCELLED,
      transactionId: null,
      reservedQuantity: 0,
      cancelReason: input.reason.slice(0, 500),
    },
  });
  await voidUnpaidInvoiceOnOrderCancel({ orderId, reason: input.reason, tx });
  await recordAuditEvent(tx, {
    action: AuditAction.ORDER_CANCELLED, module: AuditModule.ORDER,
    entityType: "Order", entityId: orderId,
    actor: actorFromSession(session), request: input.request ?? null,
    reasonCode: ReasonCode.ORDER_CANCEL.OTHER, reasonText: input.reason,
    changes: singleChange("status", order.status, OrderStatus.CANCELLED),
    context: { orderNumber: order.orderNumber },
    activityMessage: `Order ${order.orderNumber ?? order.id} cancelled: ${input.reason}`,
  });
  return cancelled;
}
