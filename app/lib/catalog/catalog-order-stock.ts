import { Prisma, type Order } from "@prisma/client";
import {
  AuditAction, AuditModule, recordAuditEvent, singleChange,
  type AuditActor, type AuditRequestContext,
} from "@/app/lib/audit";
import { assertCatalogPowersNotFrozen } from "@/app/lib/catalog/catalog-stock-freeze";
import { getCatalogReservedForPowers } from "@/app/lib/catalog/catalog-stock-position";

type Tx = Prisma.TransactionClient;

export class CatalogOrderStockError extends Error {
  constructor(message: string, readonly status = 409, readonly code = "CATALOG_STOCK_UNAVAILABLE") {
    super(message);
    this.name = "CatalogOrderStockError";
  }
}

/** Lock the leaf before reading its committed orders, so concurrent checkouts cannot oversell. */
export async function lockCatalogOrderPower(tx: Tx, powerId: string) {
  const locked = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "LensProductPower" WHERE "id" = ${powerId} FOR UPDATE
  `;
  if (!locked.length) throw new CatalogOrderStockError("Catalog power not found.", 404, "POWER_NOT_FOUND");
  await assertCatalogPowersNotFrozen([powerId], { client: tx });
  const leaf = await tx.lensProductPower.findUniqueOrThrow({
    where: { id: powerId },
    include: { lensProductVariant: { include: { product: { include: { family: true } }, addition: true } } },
  });
  if (!leaf.lensProductVariant.isActive || !leaf.lensProductVariant.product.isActive) {
    throw new CatalogOrderStockError("Catalog variant is inactive.", 409, "VARIANT_INACTIVE");
  }
  return leaf;
}

/** Live orders require full coverage. Non-live orders may raise a shortage for the remainder. */
export async function calculateCatalogReservation(
  tx: Tx, powerId: string, quantity: number, live: boolean
) {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new CatalogOrderStockError("Quantity must be a positive whole number.", 400, "INVALID_QUANTITY");
  }
  const leaf = await lockCatalogOrderPower(tx, powerId);
  const reserved = (await getCatalogReservedForPowers([powerId], tx)).get(powerId) ?? 0;
  const available = Math.max(0, leaf.quantity - leaf.blockedQty - reserved);
  if (live && available < quantity) {
    throw new CatalogOrderStockError(`Only ${available} units are available.`, 409, "INSUFFICIENT_CATALOG_STOCK");
  }
  return { leaf, available, reservedQuantity: Math.min(quantity, available) };
}

async function writeMovement(input: {
  tx: Tx;
  orderId: string;
  powerId: string;
  actor: AuditActor;
  request?: AuditRequestContext | null;
  type: "RESERVED" | "RELEASED" | "PICKED" | "RESTORED" | "RETURNED";
  quantity: number;
  onHandBefore: number;
  onHandAfter: number;
}) {
  const { tx, orderId, powerId, actor, type, quantity, onHandBefore, onHandAfter } = input;
  if (quantity <= 0) return;
  const action = {
    RESERVED: AuditAction.STOCK_RESERVED,
    RELEASED: AuditAction.STOCK_RELEASED,
    PICKED: AuditAction.STOCK_PICKED,
    RESTORED: AuditAction.STOCK_RESTORED,
    RETURNED: AuditAction.STOCK_RETURNED,
  }[type];
  await tx.stockMovement.create({
    data: {
      lensProductPowerId: powerId,
      movementType: type,
      quantityDelta: onHandAfter - onHandBefore,
      quantityBefore: onHandBefore,
      quantityAfter: onHandAfter,
      sourceType: "Order",
      referenceId: orderId,
      orderId,
      actorUserId: actor.actorUserId ?? null,
      notes: `${type.toLowerCase()} ${quantity} unit(s)`,
    },
  });
  await recordAuditEvent(tx, {
    action,
    module: AuditModule.INVENTORY,
    entityType: "LensProductPower",
    entityId: powerId,
    actor,
    request: input.request ?? null,
    changes: type === "PICKED" || type === "RESTORED" || type === "RETURNED"
      ? singleChange("quantity", onHandBefore, onHandAfter)
      : singleChange("reservedQuantity", type === "RESERVED" ? 0 : quantity, type === "RESERVED" ? quantity : 0),
    context: { orderId, quantity, movementType: type },
    activityMessage: `Catalog stock ${type.toLowerCase()} ${quantity} unit(s) for order ${orderId}`,
  });
}

export async function recordCatalogReservation(input: {
  tx: Tx; powerId: string; orderId: string; quantity: number; onHand: number;
  actor: AuditActor; request?: AuditRequestContext | null;
}) {
  await writeMovement({ ...input, type: "RESERVED", onHandBefore: input.onHand, onHandAfter: input.onHand });
}

/** Caller owns the order-row lock and applies pickedQuantity in the same transaction. */
export async function changeCatalogOrderPicked(input: {
  tx: Tx; order: Order; newPickedQuantity: number; actor: AuditActor;
  request?: AuditRequestContext | null;
}) {
  const { order, tx, actor, request } = input;
  if (!order.lensProductPowerId) return;
  const delta = input.newPickedQuantity - order.pickedQuantity;
  if (!delta) return;
  const leaf = await lockCatalogOrderPower(tx, order.lensProductPowerId);
  if (delta > 0 && (delta > order.reservedQuantity - order.pickedQuantity ||
      leaf.quantity - leaf.blockedQty < delta)) {
    throw new CatalogOrderStockError("Cannot pack unreserved or blocked catalog stock.");
  }
  const after = leaf.quantity - delta;
  if (after < 0) throw new CatalogOrderStockError("Insufficient physical catalog stock.");
  await tx.lensProductPower.update({
    where: { id: leaf.id }, data: { quantity: after },
  });
  await writeMovement({
    tx, orderId: order.id, powerId: leaf.id, actor, request,
    type: delta > 0 ? "PICKED" : "RESTORED",
    quantity: Math.abs(delta), onHandBefore: leaf.quantity, onHandAfter: after,
  });
}

/** Cancel/rollback: restore picked stock, then release the still-held reservation. */
export async function cancelCatalogOrderStock(input: {
  tx: Tx; order: Order; actor: AuditActor; request?: AuditRequestContext | null;
}) {
  const { tx, order, actor, request } = input;
  if (!order.lensProductPowerId) return;
  const leaf = await lockCatalogOrderPower(tx, order.lensProductPowerId);
  if (order.pickedQuantity > 0) {
    await tx.lensProductPower.update({
      where: { id: leaf.id }, data: { quantity: { increment: Math.floor(order.pickedQuantity) } },
    });
    await writeMovement({
      tx, orderId: order.id, powerId: leaf.id, actor, request,
      type: "RESTORED", quantity: order.pickedQuantity,
      onHandBefore: leaf.quantity, onHandAfter: leaf.quantity + order.pickedQuantity,
    });
  }
  const release = Math.max(0, order.reservedQuantity - order.pickedQuantity);
  await writeMovement({
    tx, orderId: order.id, powerId: leaf.id, actor, request,
    type: "RELEASED", quantity: release,
    onHandBefore: leaf.quantity + order.pickedQuantity,
    onHandAfter: leaf.quantity + order.pickedQuantity,
  });
}
