import {
  CartLineType, LedgerEntryType, LensType, OrderStatus,
  TransactionStatus, TransactionType,
} from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import { calculateCatalogReservation, recordCatalogReservation, CatalogOrderStockError } from "./catalog-order-stock";
import { nextProcurementRequestPublicId } from "@/app/lib/procurement-requests";
import { createOriginalPowerVersion } from "@/app/lib/alternate-power-workflow";
import { createInvoiceFromOrder } from "@/app/lib/finance/create-invoice-from-order";
import { assertHardCreditAtCheckout } from "@/app/lib/finance/credit-limit";
import { resolveCustomerPricingTier, buildOrderTierSnapshot } from "@/app/lib/finance/pricing-tier";
import { orderTotalFromPairPrice } from "@/app/lib/lens-pricing";
import { resolveCheckoutRedemption, applyOrderRedemption } from "@/app/lib/loyalty/redeem";
import { generateUniqueOrderNumber } from "@/app/lib/order-numbers";
import { dispatchSlotForNow } from "@/app/lib/dispatch-cutoff";
import { resolveOrderAssigneeId, assignmentCreateFields } from "@/app/lib/assign-order-to-employee";
import { resolveOrderAttribution, buildOnBehalfActivityMessage } from "@/app/lib/order-attribution";
import { notifyStaffOfNewOrder } from "@/app/lib/staff-notifications";
import { logOrderActivity } from "@/app/lib/order-activity";
import { AuditAction, AuditModule, recordAuditEvent, type AuditRequestContext } from "@/app/lib/audit";

const FAMILY_LENS_TYPE: Record<string, LensType> = {
  SV: LensType.SINGLE_VISION,
  KT: LensType.KRYPTOK,
  V2: LensType.PROGRESSIVE,
};

export async function placeCatalogOrder(input: {
  powerId: string;
  quantity: number;
  live: boolean;
  customerId: string;
  actorId: string;
  actorRole: string;
  checkoutBatchId?: string | null;
  redeemPoints?: number | null;
  deliveryServiceId?: string | null;
  notes?: string | null;
  request?: AuditRequestContext | null;
}) {
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    throw new CatalogOrderStockError("Quantity must be a positive whole number.", 400, "INVALID_QUANTITY");
  }
  const quote = await prisma.lensProductPower.findUnique({
    where: { id: input.powerId },
    select: { lensProductVariant: { select: { sellingPrice: true } } },
  });
  if (!quote || Number(quote.lensProductVariant.sellingPrice) <= 0) {
    throw new CatalogOrderStockError("A priced catalog power is required.", 400, "POWER_NOT_PRICED");
  }
  if (input.deliveryServiceId) {
    const service = await prisma.deliveryService.findUnique({
      where: { id: input.deliveryServiceId }, select: { isActive: true },
    });
    if (!service?.isActive) {
      throw new CatalogOrderStockError("Selected delivery service is not available.", 400, "DELIVERY_INVALID");
    }
  }
  const gross = orderTotalFromPairPrice(Number(quote.lensProductVariant.sellingPrice), input.quantity);
  const tier = buildOrderTierSnapshot(await resolveCustomerPricingTier(input.customerId), gross);
  const customer = await prisma.user.findUnique({
    where: { id: input.customerId },
    select: { id: true, name: true, businessName: true, email: true, accountAction: true, creditAllowed: true, creditLimit: true },
  });
  if (!customer) throw new CatalogOrderStockError("Customer not found.", 404, "CUSTOMER_NOT_FOUND");
  const credit = await assertHardCreditAtCheckout(customer, tier.totalAfterTier);
  if (!credit.ok) throw new CatalogOrderStockError(credit.message, 403, "CREDIT_LIMIT");
  const batchId = input.checkoutBatchId?.trim().slice(0, 64) || null;
  const assigneeId = await resolveOrderAssigneeId({ checkoutBatchId: batchId });
  const cutoff = await dispatchSlotForNow();
  const orderNumber = await generateUniqueOrderNumber();
  const attribution = resolveOrderAttribution({
    session: { role: input.actorRole, userId: input.actorId },
    customerUserId: input.customerId,
  });
  const actor = await prisma.user.findUnique({
    where: { id: input.actorId }, select: { name: true, email: true },
  });
  const actorName = actor?.name?.trim() || actor?.email || null;
  const auditActor = { actorType: "HUMAN" as const, actorUserId: input.actorId, actorName };
  const customerLabel = customer.businessName?.trim() || customer.name?.trim() || customer.email || "A customer";

  const created = await prisma.$transaction(async (tx) => {
    const { leaf, available, reservedQuantity } = await calculateCatalogReservation(
      tx, input.powerId, input.quantity, input.live
    );
    const lensType = FAMILY_LENS_TYPE[leaf.lensProductVariant.product.family.code];
    if (!lensType) throw new CatalogOrderStockError("Unsupported catalog family.", 400, "FAMILY_UNSUPPORTED");
    const price = Number(leaf.lensProductVariant.sellingPrice);
    if (!(price > 0) || price !== Number(quote.lensProductVariant.sellingPrice)) {
      throw new CatalogOrderStockError("Catalog price changed. Review the order and retry.", 409, "PRICE_CHANGED");
    }
    const needsProcurement = reservedQuantity < input.quantity;
    const redemption = await resolveCheckoutRedemption({
      customerId: input.customerId,
      redeemPoints: input.actorRole === "CUSTOMER" ? input.redeemPoints : null,
      orderGross: tier.totalAfterTier,
      db: tx,
    });
    if (redemption.error) throw new CatalogOrderStockError(redemption.error, 400, "LOYALTY_INVALID");

    const reference = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const transaction = await tx.transaction.create({
      data: {
        reference, amount: tier.totalAfterTier, currency: "INR", type: TransactionType.CREDIT,
        status: TransactionStatus.COMPLETED, description: `Sale for order: ${reference}`, userId: input.actorId,
      },
    });
    await tx.ledgerEntry.create({
      data: {
        transactionId: transaction.id, entryType: LedgerEntryType.CREDIT,
        amount: tier.totalAfterTier, description: `Sale for order: ${reference}`,
      },
    });

    const order = await tx.order.create({
      data: {
        orderNumber, checkoutBatchId: batchId, userId: input.customerId,
        ...assignmentCreateFields(assigneeId), ...attribution,
        lineType: CartLineType.RETAIL, lensType, lensProductPowerId: leaf.id,
        quantity: input.quantity, reservedQuantity, pickedQuantity: 0,
        unitPrice: price, totalAmount: tier.totalAfterTier,
        tierCode: tier.tierCode, tierDiscountPercent: tier.tierDiscountPercent,
        tierDiscountAmount: tier.tierDiscountAmount,
        sph: leaf.sph, cyl: leaf.cyl, axis: leaf.lensProductVariant.axis,
        add: leaf.lensProductVariant.addition?.value ?? null, eye: leaf.lensProductVariant.eye,
        status: needsProcurement ? OrderStatus.AWAITING_PROCUREMENT : OrderStatus.PENDING,
        notes: input.notes?.trim() || null, transactionId: transaction.id,
        deliveryServiceId: input.deliveryServiceId || null,
        ...cutoff,
      },
    });
    await createOriginalPowerVersion(tx, order, input.actorId);
    await recordCatalogReservation({
      tx, powerId: leaf.id, orderId: order.id, quantity: reservedQuantity,
      onHand: leaf.quantity, actor: auditActor, request: input.request,
    });
    if (needsProcurement) {
      const shortage = input.quantity - reservedQuantity;
      const pr = await tx.procurementRequest.create({
        data: {
          publicId: await nextProcurementRequestPublicId(tx), source: "ORDER_SHORTAGE",
          status: "OPEN", lensProductPowerId: leaf.id, orderId: order.id,
          requiredQuantity: shortage, requestedQuantity: shortage,
          stockAtTrigger: leaf.quantity, availableAtTrigger: available,
          minStockAtTrigger: leaf.minStock, targetStockAtTrigger: leaf.targetStock,
          triggerReason: `Order ${order.orderNumber} shortage`, createdById: input.actorId,
        },
      });
      await recordAuditEvent(tx, {
        action: AuditAction.PROCUREMENT_REQUEST_CREATED, module: AuditModule.INVENTORY,
        entityType: "ProcurementRequest", entityId: pr.id, actor: auditActor,
        request: input.request ?? null,
        context: { orderId: order.id, lensProductPowerId: leaf.id, quantity: shortage },
        activityMessage: `Procurement shortage ${shortage} for catalog order ${order.orderNumber}`,
      });
    }
    const { invoiceId } = await createInvoiceFromOrder({
      orderId: order.id, loyaltyDiscount: redemption.loyaltyDiscount, tx,
    });
    await applyOrderRedemption({
      customerId: input.customerId, orderId: order.id, invoiceId,
      loyaltyDiscount: redemption.loyaltyDiscount, db: tx,
    });
    const message = buildOnBehalfActivityMessage({
      orderNumber: order.orderNumber, orderId: order.id, customerLabel,
      sessionRole: input.actorRole, actorLabel: actorName,
    });
    await recordAuditEvent(tx, {
      action: AuditAction.ORDER_CREATED, module: AuditModule.ORDER,
      entityType: "Order", entityId: order.id, actor: auditActor,
      request: input.request ?? null,
      context: { orderNumber, lensProductPowerId: leaf.id, quantity: input.quantity, reservedQuantity },
      relatedRefs: { transactionId: transaction.id },
      activityMessage: message,
    });
    if (attribution.placedByUserId) {
      await logOrderActivity(tx, {
        orderId: order.id, actorUserId: input.actorId, action: "ORDER_CREATED_ON_BEHALF",
        message, metadata: { orderSource: attribution.orderSource, customerUserId: input.customerId },
      });
    }
    return { order, transaction, invoiceId, needsProcurement };
  }, { maxWait: 10_000, timeout: 60_000 });

  await notifyStaffOfNewOrder(created.order.id, customerLabel, assigneeId).catch((error) => {
    console.error("Catalog order staff notification failed:", error);
  });
  return created;
}
