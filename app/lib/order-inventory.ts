import { LensType, OrderStatus, PowerVersionStatus, Prisma, type Order } from "@prisma/client";
import { prisma } from "./prisma";
import { decrementLensStock, incrementLensStock } from "./cart-reservations";
import {
  AuditAction,
  AuditModule,
  recordAuditEvent,
  systemActor,
  type AuditRequestContext,
} from "./audit";
import { singleChange } from "./audit/diff";
import {
  changeCatalogOrderPicked, cancelCatalogOrderStock,
  lockCatalogOrderPower, recordCatalogReservation,
} from "./catalog/catalog-order-stock";
import { getCatalogReservedForPowers } from "./catalog/catalog-stock-position";

export type StockAuditOptions = {
  actorUserId?: string;
  actorName?: string;
  orderId?: string;
  request?: AuditRequestContext | null;
};

function stockAuditPayload<M extends "STOCK_PICKED" | "STOCK_DECREMENTED" | "STOCK_RESTORED" | "STOCK_INCREMENTED">(
  opts: StockAuditOptions | undefined,
  movementType: M
) {
  if (!opts) return undefined;
  return {
    actorUserId: opts.actorUserId,
    actorName: opts.actorName,
    orderId: opts.orderId,
    movementType,
    request: opts.request,
  };
}

/** Order statuses that hold reserved (not yet picked) stock. */
export const ACTIVE_RESERVATION_STATUSES: OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.PICKING,
  OrderStatus.PACKED,
  OrderStatus.DISPATCHED,
  OrderStatus.PARTIALLY_FULFILLED,
  OrderStatus.AWAITING_PROCUREMENT,
];

function lensIdField(lensType: LensType): "singleVisionLensId" | "kryptokLensId" | "progressiveLensId" {
  if (lensType === LensType.SINGLE_VISION) return "singleVisionLensId";
  if (lensType === LensType.KRYPTOK) return "kryptokLensId";
  return "progressiveLensId";
}

export function getOrderLensId(order: Pick<Order, "lensType" | "singleVisionLensId" | "kryptokLensId" | "progressiveLensId">): string | null {
  if (order.lensType === LensType.SINGLE_VISION) return order.singleVisionLensId;
  if (order.lensType === LensType.KRYPTOK) return order.kryptokLensId;
  if (order.lensType === LensType.PROGRESSIVE) return order.progressiveLensId;
  return null;
}

/** Units still held against inventory for open orders (reserved but not yet picked). */
export async function getCommittedQuantity(lensType: LensType, lensId: string): Promise<number> {
  const field = lensIdField(lensType);
  const orders = await prisma.order.findMany({
    where: {
      lensType,
      [field]: lensId,
      status: { in: ACTIVE_RESERVATION_STATUSES },
    },
    select: { reservedQuantity: true, pickedQuantity: true },
  });

  return orders.reduce(
    (sum, row) => sum + Math.max(0, row.reservedQuantity - row.pickedQuantity),
    0
  );
}

export async function getAvailableQuantity(lensType: LensType, lensId: string, onHand: number): Promise<number> {
  const committed = await getCommittedQuantity(lensType, lensId);
  return Math.max(0, onHand - committed);
}

/** Allocate stock when an order is placed (no physical decrement yet). */
export async function computeOrderReservedQuantity(
  lensType: LensType,
  lensId: string,
  onHand: number,
  orderQty: number
): Promise<number> {
  const available = await getAvailableQuantity(lensType, lensId, onHand);
  return Math.min(orderQty, available);
}

/** Decrement lens stock when staff marks the line packed / picked. */
export async function fulfillOrderPick(
  order: Order,
  audit?: StockAuditOptions
): Promise<Order> {
  if (order.lensProductPowerId) {
    return setOrderPickedQuantity(order, order.reservedQuantity, audit);
  }
  const lensId = getOrderLensId(order);
  const toPick = Math.max(0, order.reservedQuantity - order.pickedQuantity);
  if (!lensId || toPick <= 0) {
    return order;
  }

  await decrementLensStock(
    order.lensType,
    lensId,
    toPick,
    stockAuditPayload(audit, "STOCK_PICKED")
  );
  const updated = await prisma.order.update({
    where: { id: order.id },
    data: { pickedQuantity: order.pickedQuantity + toPick },
  });
  if (updated.lineType === "RETAIL") {
    await prisma.orderPowerVersion.updateMany({
      where: { orderId: updated.id, status: PowerVersionStatus.ACTIVE },
      data: {
        pickedQuantity: updated.pickedQuantity,
        reservedQuantity: updated.reservedQuantity,
      },
    });
  }
  return updated;
}

/** Set picked units for a line (adjusts lens stock by the delta). */
export async function setOrderPickedQuantity(
  order: Order,
  newPickedQuantity: number,
  audit?: StockAuditOptions,
  orderUpdate?: Prisma.OrderUpdateInput
): Promise<Order> {
  return prisma.$transaction(async (tx) => {
    // Serialize picks against the same order; any freeze rejection rolls back
    // both the legacy stock movement and the catalog blocked balance.
    await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${order.id} FOR UPDATE`;
    const current = await tx.order.findUnique({ where: { id: order.id } });
    if (!current) throw new Error("Order not found.");
    const lensId = getOrderLensId(current);
    const clamped = Math.max(0, Math.min(current.quantity, Math.floor(newPickedQuantity)));
    const delta = clamped - current.pickedQuantity;
    if (delta === 0 && !orderUpdate) return current;

    if (current.lensProductPowerId) {
      await changeCatalogOrderPicked({
        tx,
        order: current,
        newPickedQuantity: clamped,
        actor: audit?.actorUserId
          ? { actorType: "HUMAN", actorUserId: audit.actorUserId, actorName: audit.actorName ?? null }
          : systemActor(),
        request: audit?.request,
      });
    } else if (lensId) {
      if (delta > 0) {
        await decrementLensStock(
          current.lensType,
          lensId,
          delta,
          stockAuditPayload(audit, "STOCK_PICKED"),
          tx
        );
      } else {
        await incrementLensStock(
          current.lensType,
          lensId,
          -delta,
          stockAuditPayload(audit, "STOCK_RESTORED"),
          tx
        );
      }
    }

    const prevShort = Math.max(0, current.quantity - current.pickedQuantity);
    const addedShort = Math.max(0, current.quantity - clamped) - prevShort;
    if (addedShort > 0 && lensId && !current.lensProductPowerId) {
      const { incrementCatalogBlockedByLegacyLens } = await import(
        "@/app/lib/catalog/catalog-stock-block"
      );
      await incrementCatalogBlockedByLegacyLens({
        lensType: current.lensType,
        lensId,
        shortQty: addedShort,
        actorUserId: audit?.actorUserId ?? null,
        actorName: audit?.actorName ?? null,
        request: audit?.request,
        referenceId: current.id,
        client: tx,
      });
    }

    const updated = await tx.order.update({
      where: { id: current.id },
      data: { ...orderUpdate, pickedQuantity: clamped },
    });
    if (updated.lineType === "RETAIL") {
      await tx.orderPowerVersion.updateMany({
        where: { orderId: updated.id, status: PowerVersionStatus.ACTIVE },
        data: {
          pickedQuantity: clamped,
          reservedQuantity: updated.reservedQuantity,
        },
      });
    }
    return updated;
  }, { maxWait: 10_000, timeout: 20_000 });
}

/** Restore inventory when a picked order is cancelled or deleted. */
export async function restorePickedStock(
  order: Pick<Order, "lensType" | "singleVisionLensId" | "kryptokLensId" | "progressiveLensId" | "lensProductPowerId" | "reservedQuantity" | "pickedQuantity" | "id">,
  audit?: StockAuditOptions,
  db?: import("@prisma/client").Prisma.TransactionClient | typeof import("./prisma").prisma
) {
  if (order.lensProductPowerId) {
    const restore = async (tx: import("@prisma/client").Prisma.TransactionClient) => {
      const full = await tx.order.findUniqueOrThrow({ where: { id: order.id } });
      await cancelCatalogOrderStock({
        tx, order: full,
        actor: audit?.actorUserId
          ? { actorType: "HUMAN", actorUserId: audit.actorUserId, actorName: audit.actorName ?? null }
          : systemActor(),
        request: audit?.request,
      });
    };
    if (db && db !== prisma) return restore(db as import("@prisma/client").Prisma.TransactionClient);
    return prisma.$transaction(restore, { maxWait: 10_000, timeout: 20_000 });
  }
  const lensId = getOrderLensId(order);
  if (!lensId || order.pickedQuantity <= 0) return;
  await incrementLensStock(
    order.lensType,
    lensId,
    order.pickedQuantity,
    stockAuditPayload(
      audit ? { ...audit, orderId: audit.orderId ?? order.id } : undefined,
      "STOCK_RESTORED"
    ),
    db ?? prisma
  );
}

async function readLensOnHand(lensType: LensType, lensId: string): Promise<number> {
  if (lensType === LensType.SINGLE_VISION) {
    const lens = await prisma.singleVisionLens.findUnique({ where: { id: lensId }, select: { quantity: true } });
    return lens?.quantity ?? 0;
  }
  if (lensType === LensType.KRYPTOK) {
    const lens = await prisma.kryptokLens.findUnique({ where: { id: lensId }, select: { quantity: true } });
    return lens?.quantity ?? 0;
  }
  const lens = await prisma.progressiveLens.findUnique({ where: { id: lensId }, select: { quantity: true } });
  return lens?.quantity ?? 0;
}

/** After stock intake, move a procurement order back to the active orders queue when stock allows. */
export async function fulfillProcurementOrder(orderId: string): Promise<Order | null> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || (order.status !== OrderStatus.AWAITING_PROCUREMENT && order.status !== OrderStatus.PARTIALLY_FULFILLED)) {
    return null;
  }

  if (order.lensProductPowerId) {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`;
      const live = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
      if (!live.lensProductPowerId || (live.status !== OrderStatus.AWAITING_PROCUREMENT && live.status !== OrderStatus.PARTIALLY_FULFILLED)) {
        return live;
      }
      const leaf = await lockCatalogOrderPower(tx, live.lensProductPowerId);
      const committed = (await getCatalogReservedForPowers([leaf.id], tx)).get(leaf.id) ?? 0;
      const available = Math.max(0, leaf.quantity - leaf.blockedQty - committed);
      const nextReserved = Math.min(live.quantity, live.reservedQuantity + available);
      const nextStatus = nextReserved >= live.quantity ? OrderStatus.PENDING
        : nextReserved > 0 ? OrderStatus.PARTIALLY_FULFILLED : OrderStatus.AWAITING_PROCUREMENT;
      if (nextReserved === live.reservedQuantity && nextStatus === live.status) return live;
      const updated = await tx.order.update({
        where: { id: orderId }, data: { reservedQuantity: nextReserved, status: nextStatus },
      });
      await tx.orderPowerVersion.updateMany({
        where: { orderId, status: PowerVersionStatus.ACTIVE },
        data: { reservedQuantity: nextReserved },
      });
      await recordCatalogReservation({
        tx, powerId: leaf.id, orderId, quantity: nextReserved - live.reservedQuantity,
        onHand: leaf.quantity, actor: systemActor(),
      });
      await recordAuditEvent(tx, {
        action: AuditAction.SYSTEM_ORDER_COVERAGE_RECALCULATED,
        module: AuditModule.SYSTEM, entityType: "Order", entityId: orderId,
        actor: systemActor(),
        changes: [
          ...singleChange("reservedQuantity", live.reservedQuantity, nextReserved),
          ...singleChange("status", live.status, nextStatus),
        ],
        activityMessage: `Catalog procurement coverage recalculated → ${nextStatus}`,
      });
      if (nextReserved >= live.quantity) {
        await resolveOrderShortageRequests(orderId, live.quantity, tx);
      }
      return updated;
    }, { maxWait: 10_000, timeout: 30_000 });
  }

  const lensId = getOrderLensId(order);
  if (!lensId) {
    return null;
  }

  const onHand = await readLensOnHand(order.lensType, lensId);
  const reservedQty = await computeOrderReservedQuantity(
    order.lensType,
    lensId,
    onHand,
    order.quantity
  );

  const nextStatus =
    reservedQty >= order.quantity
      ? OrderStatus.PENDING
      : reservedQty > 0
        ? OrderStatus.PARTIALLY_FULFILLED
        : OrderStatus.AWAITING_PROCUREMENT;

  return prisma.order.update({
    where: { id: orderId },
    data: {
      status: nextStatus,
      reservedQuantity: reservedQty,
    },
  }).then(async (updated) => {
    if (updated.lineType === "RETAIL") {
      await prisma.orderPowerVersion.updateMany({
        where: { orderId: updated.id, status: PowerVersionStatus.ACTIVE },
        data: { reservedQuantity: reservedQty },
      });
    }

    await recordAuditEvent(prisma, {
      action: AuditAction.SYSTEM_ORDER_COVERAGE_RECALCULATED,
      module: AuditModule.SYSTEM,
      entityType: "Order",
      entityId: orderId,
      actor: systemActor(),
      changes: [
        ...singleChange("status", order.status, nextStatus),
        ...singleChange("reservedQuantity", order.reservedQuantity, reservedQty),
      ],
      context: { orderNumber: order.orderNumber },
      activityMessage: `Procurement coverage recalculated → ${nextStatus}`,
    });

    // Once the order is fully covered from stock, any ORDER_SHORTAGE
    // procurement request raised for it has served its purpose. Close it as
    // satisfied rather than leaving a phantom "buy more" requirement open.
    if (reservedQty >= order.quantity) {
      await resolveOrderShortageRequests(orderId, order.quantity);
    }

    return updated;
  });
}

/**
 * Close every open ORDER_SHORTAGE request for an order that is now fully
 * covered. History is preserved — only the status advances.
 */
async function resolveOrderShortageRequests(
  orderId: string, orderQuantity: number,
  db: typeof prisma | import("@prisma/client").Prisma.TransactionClient = prisma
) {
  const open = await db.procurementRequest.findMany({
    where: {
      orderId,
      source: "ORDER_SHORTAGE",
      status: { in: ["OPEN", "UNDER_REVIEW", "APPROVED"] },
    },
    select: { id: true, publicId: true, receivedQuantity: true, requestedQuantity: true },
  });

  for (const request of open) {
    const stillNeeded = Math.max(0, request.requestedQuantity - request.receivedQuantity);
    await db.procurementRequest.update({
      where: { id: request.id },
      data: {
        status: stillNeeded > 0 ? "CANCELLED" : "RESOLVED",
        resolvedAt: new Date(),
        resolutionReason:
          stillNeeded > 0
            ? `Order fully covered from stock (${orderQuantity} units); remaining requirement withdrawn`
            : "Order fully covered from stock",
      },
    });
  }
}
