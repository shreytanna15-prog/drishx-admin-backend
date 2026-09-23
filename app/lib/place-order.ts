import {
  CartLineType,
  LensType,
  LedgerEntryType,
  OrderStatus,
  TransactionStatus,
  TransactionType,
  type CartReservation,
} from "@prisma/client";
import { createOriginalPowerVersion } from "./alternate-power-workflow";
import { orderTotalFromPairPrice } from "./lens-pricing";
import { prisma } from "./prisma";
import { computeOrderReservedQuantity } from "./order-inventory";
import { resolveOrderPrescription } from "./order-prescription";
import { resolveLensForOrder } from "./resolve-lens-stock";
import { generateUniqueOrderNumber } from "./order-numbers";
import { dispatchSlotForNow } from "./dispatch-cutoff";
import { notifyStaffOfNewOrder } from "./staff-notifications";
import {
  assignmentCreateFields,
  resolveOrderAssigneeId,
} from "./assign-order-to-employee";
import {
  AuditAction,
  AuditModule,
  recordAuditEvent,
} from "./audit";
import { createInvoiceFromOrder } from "./finance/create-invoice-from-order";
import {
  applyOrderRedemption,
  resolveCheckoutRedemption,
} from "./loyalty/redeem";

export type PlaceOrderLineInput = {
  lensType: LensType;
  lensId: string;
  quantity: number;
  cartLineKey?: string | null;
  reservation?: Pick<
    CartReservation,
    "sph" | "cyl" | "add" | "axis" | "eye" | "lensId"
  > | null;
  prescription?: {
    sph?: number | null;
    cyl?: number | null;
    axis?: number | null;
    add?: number | null;
    eye?: string | null;
  };
  notes?: string | null;
  deliveryServiceId?: string | null;
};

export type PlaceOrderContext = {
  actingUserId: string;
  resolvedUserId: string;
  checkoutBatchId?: string | null;
  followsCustomerProcurementFlow: boolean;
  notifyStaff: boolean;
  /** X Points to redeem (₹ value) against this order's invoice. */
  redeemPoints?: number | null;
};

export type PlacedOrderResult = {
  orderId: string;
  status: OrderStatus;
  needsProcurement: boolean;
};

export async function placeOrderLine(
  input: PlaceOrderLineInput,
  context: PlaceOrderContext
): Promise<PlacedOrderResult> {
  const lens = await resolveLensForOrder(
    input.lensType,
    Number(input.quantity),
    input.lensId
  );

  if (!lens) {
    throw new Error(
      "Lens not found. Remove the item from cart and add it again from Shop."
    );
  }

  const resolvedLensId = input.reservation?.lensId ?? lens.id;
  const orderQty = Number(input.quantity);
  const reservedQty = await computeOrderReservedQuantity(
    input.lensType,
    resolvedLensId,
    lens.quantity,
    orderQty
  );
  const needsProcurement =
    context.followsCustomerProcurementFlow && reservedQty < orderQty;

  if (
    !needsProcurement &&
    reservedQty < orderQty &&
    !context.followsCustomerProcurementFlow
  ) {
    const productHint =
      input.lensType === LensType.SINGLE_VISION && "brand" in lens
        ? ` (${lens.brand} · ${lens.coating}, SPH ${lens.sph}, CYL ${lens.cyl ?? "—"})`
        : "";
    throw new Error(
      `Insufficient stock${productHint}. Available: ${reservedQty}.`
    );
  }

  const unitPrice = lens.price;
  const totalAmount = orderTotalFromPairPrice(Number(unitPrice), orderQty);
  const prescription = resolveOrderPrescription(
    input.reservation ?? null,
    {
      sph: input.prescription?.sph,
      cyl: input.prescription?.cyl,
      axis: input.prescription?.axis,
      add: input.prescription?.add,
      eye: input.prescription?.eye,
    },
    lens
  );

  const orderReference = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const orderNumber = await generateUniqueOrderNumber();
  const normalizedBatchId =
    typeof context.checkoutBatchId === "string" && context.checkoutBatchId.trim()
      ? context.checkoutBatchId.trim().slice(0, 64)
      : null;
  const assignedToId = await resolveOrderAssigneeId({
    checkoutBatchId: normalizedBatchId,
  });

  const deliveryServiceId =
    typeof input.deliveryServiceId === "string" && input.deliveryServiceId.trim()
      ? input.deliveryServiceId.trim()
      : null;
  if (deliveryServiceId) {
    const service = await prisma.deliveryService.findUnique({ where: { id: deliveryServiceId } });
    if (!service || !service.isActive) throw new Error("Selected delivery service is not available.");
  }

  const newTransaction = await prisma.transaction.create({    data: {
      reference: orderReference,
      amount: totalAmount,
      currency: "INR",
      type: TransactionType.CREDIT,
      status: TransactionStatus.COMPLETED,
      description: `Sale for order: ${orderReference}`,
      userId: context.actingUserId,
    },
  });

  await prisma.ledgerEntry.create({
    data: {
      transactionId: newTransaction.id,
      entryType: LedgerEntryType.CREDIT,
      amount: totalAmount,
      description: `Sale for order: ${orderReference}`,
    },
  });

  const cutoffSlot = await dispatchSlotForNow();

  const newOrder = await prisma.order.create({
    data: {
      orderNumber,
      checkoutBatchId: normalizedBatchId,
      userId: context.resolvedUserId,
      ...assignmentCreateFields(assignedToId),
      lineType: CartLineType.RETAIL,
      lensType: input.lensType,
      singleVisionLensId:
        input.lensType === LensType.SINGLE_VISION ? resolvedLensId : null,
      kryptokLensId: input.lensType === LensType.KRYPTOK ? resolvedLensId : null,
      progressiveLensId:
        input.lensType === LensType.PROGRESSIVE ? resolvedLensId : null,
      quantity: orderQty,
      reservedQuantity: reservedQty,
      pickedQuantity: 0,
      unitPrice: Number(unitPrice),
      totalAmount,
      sph: prescription.sph,
      cyl: prescription.cyl,
      axis: prescription.axis,
      add: prescription.add,
      eye: prescription.eye,
      status: needsProcurement
        ? OrderStatus.AWAITING_PROCUREMENT
        : OrderStatus.PENDING,
      notes: input.notes ?? null,
      transactionId: newTransaction.id,
      deliveryServiceId,
      ...cutoffSlot,
    },
  });

  await createOriginalPowerVersion(prisma, newOrder, context.actingUserId);

  const redemption = await resolveCheckoutRedemption({
    customerId: context.resolvedUserId,
    redeemPoints: context.redeemPoints,
    orderGross: totalAmount,
  });
  if (redemption.error) {
    throw new Error(redemption.error);
  }

  const { invoiceId } = await createInvoiceFromOrder({
    orderId: newOrder.id,
    markPaid: newOrder.status === OrderStatus.COMPLETED,
    loyaltyDiscount: redemption.loyaltyDiscount,
  });

  await applyOrderRedemption({
    customerId: context.resolvedUserId,
    orderId: newOrder.id,
    invoiceId,
    loyaltyDiscount: redemption.loyaltyDiscount,
  });

  if (context.notifyStaff) {
    const customer = await prisma.user.findUnique({
      where: { id: context.resolvedUserId },
      select: { name: true, email: true },
    });
    const customerLabel =
      customer?.name?.trim() || customer?.email || "A customer";
    await notifyStaffOfNewOrder(newOrder.id, customerLabel, assignedToId);
  }

  await recordAuditEvent(prisma, {
    action: AuditAction.ORDER_CREATED,
    module: AuditModule.ORDER,
    entityType: "Order",
    entityId: newOrder.id,
    actor: {
      actorType: "HUMAN",
      actorUserId: context.actingUserId,
      actorName: null,
    },
    context: {
      orderNumber: newOrder.orderNumber,
      lensType: input.lensType,
      lensId: resolvedLensId,
      quantity: orderQty,
      status: newOrder.status,
      sph: prescription.sph,
      cyl: prescription.cyl,
      axis: prescription.axis,
      add: prescription.add,
    },
    relatedRefs: { transactionId: newTransaction.id },
    activityMessage: `Order #${newOrder.orderNumber ?? newOrder.id.slice(-6)} created`,
    message: `Order created (${newOrder.status})`,
  });

  return {
    orderId: newOrder.id,
    status: newOrder.status,
    needsProcurement,
  };
}
