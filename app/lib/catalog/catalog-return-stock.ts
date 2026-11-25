import { Prisma } from "@prisma/client";
import { assertCatalogPowersNotFrozen } from "./catalog-stock-freeze";
import { getCatalogReservedForPowers } from "./catalog-stock-position";
import { AuditAction, AuditModule, recordAuditEvent, singleChange, type AuditActor, type AuditRequestContext } from "@/app/lib/audit";

/** Changes saleable return acceptance by delta, never reposts the same units. */
export async function setCatalogReturnRestockedQuantity(input: {
  tx: Prisma.TransactionClient;
  returnItemId: string;
  targetQuantity: number;
  actor: AuditActor;
  request?: AuditRequestContext | null;
  reason: string;
}) {
  const { tx } = input;
  await tx.$queryRaw`SELECT "id" FROM "ReturnRequestItem" WHERE "id" = ${input.returnItemId} FOR UPDATE`;
  const item = await tx.returnRequestItem.findUniqueOrThrow({ where: { id: input.returnItemId } });
  if (!item.lensProductPowerId) throw new Error("Return item has no catalog stock identity.");
  if (!Number.isInteger(input.targetQuantity) || input.targetQuantity < 0 || input.targetQuantity > item.quantity) {
    throw new Error("Saleable return quantity must be a whole number within the returned quantity.");
  }
  const delta = input.targetQuantity - item.saleableRestockedQuantity;
  if (delta === 0) return item;
  const powerId = item.lensProductPowerId;
  await tx.$queryRaw`SELECT "id" FROM "LensProductPower" WHERE "id" = ${powerId} FOR UPDATE`;
  await assertCatalogPowersNotFrozen([powerId], { client: tx });
  const leaf = await tx.lensProductPower.findUniqueOrThrow({ where: { id: powerId } });
  const reserved = (await getCatalogReservedForPowers([powerId], tx)).get(powerId) ?? 0;
  const after = leaf.quantity + delta;
  if (after < reserved + leaf.blockedQty) {
    throw new Error("Cannot reverse saleable acceptance: the stock is already reserved, blocked or issued.");
  }
  await tx.lensProductPower.update({
    where: { id: powerId },
    data: { quantity: after, ...(delta > 0 || after === 0 ? { weightedAverageCost: null } : {}) },
  });
  const updated = await tx.returnRequestItem.update({
    where: { id: item.id }, data: { saleableRestockedQuantity: input.targetQuantity },
  });
  await tx.stockMovement.create({
    data: {
      lensProductPowerId: powerId,
      movementType: delta > 0 ? "RETURNED" : "ADJUSTED",
      quantityDelta: delta, quantityBefore: leaf.quantity, quantityAfter: after,
      sourceType: "ReturnRequest", referenceId: item.returnRequestId,
      orderId: item.originalOrderId,
      actorUserId: input.actor.actorUserId ?? null,
      reasonCode: delta < 0 ? "return_decision_reversed" : "return_accepted",
      reasonText: input.reason,
    },
  });
  await recordAuditEvent(tx, {
    action: delta > 0 ? AuditAction.STOCK_RETURNED : AuditAction.STOCK_ADJUSTED,
    module: AuditModule.INVENTORY, entityType: "LensProductPower", entityId: powerId,
    actor: input.actor, request: input.request ?? null,
    reasonText: input.reason,
    changes: singleChange("quantity", leaf.quantity, after),
    context: { returnRequestId: item.returnRequestId, returnItemId: item.id, orderId: item.originalOrderId, delta },
    activityMessage: `Saleable return ${item.saleableRestockedQuantity} → ${input.targetQuantity} units`,
  });
  return updated;
}
