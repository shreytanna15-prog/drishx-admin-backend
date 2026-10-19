import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "../../../lib/session-auth";
import { prisma } from "../../../lib/prisma";
import { NotificationType, OrderStatus, Prisma } from "@prisma/client";
import {
  fulfillOrderPick,
  restorePickedStock,
  setOrderPickedQuantity,
} from "../../../lib/order-inventory";
import { markActiveVersionFinalFulfilled } from "../../../lib/alternate-power-workflow";
import { activateOrderLoyalty } from "../../../lib/loyalty/activate";
import { reverseRedemption } from "../../../lib/loyalty/redeem";
import {
  canTransitionStatus,
  formatOrderStatusLabel,
  isEditableOrderStatus,
  isOrderTrackingStatus,
  type OrderTrackingStatus,
} from "../../../lib/order-status-transitions";
import { logOrderActivity } from "../../../lib/order-activity";
import {
  AuditAction,
  AuditModule,
  ReasonCode,
  actorFromSession,
  buildAuditRequestContext,
  recordAuditEvent,
  singleChange,
} from "../../../lib/audit";
import { voidTransaction } from "../../../lib/audit-query";
import { validateOrderNotes } from "../../../lib/order-notes";
import { requireStaffPermission } from "../../../lib/staff-access";
import {
  parsePackages,
  recordPackingDelivery,
  resolveActiveDeliveryService,
} from "../../../lib/delivery-pack";
import { sumPackageWeights } from "../../../lib/delivery-calc";
import {
  assertDispatchReadiness,
  validateCourierName,
  validateTrackingNumber,
} from "../../../lib/dispatch-validate";
import { assertDispatchAllowed } from "../../../lib/dispatch-cutoff";
import { orderTotalFromPairPrice } from "../../../lib/lens-pricing";
import {
  OrderPricingInvoiceSyncError,
  syncUnpaidInvoiceAfterOrderPricingEdit,
} from "../../../lib/finance/sync-order-invoice-pricing";
import {
  assertOrderInvoiceAllowsCancellation,
  OrderInvoiceCancellationError,
  voidUnpaidInvoiceOnOrderCancel,
} from "../../../lib/finance/void-unpaid-invoice";
import {
  orderDetailInclude,
  serializeOrderDetail,
} from "../../../lib/order-detail";
import {
  employeeMayAccessOrder,
  shouldNotifyStaffOnEligibilityChange,
} from "../../../lib/prescription-order-hold";
import { notifyStaffOfNewOrder } from "../../../lib/staff-notifications";

// ─────────────────────────────────────────────────────────────
// GET /api/orders/:id
// ─────────────────────────────────────────────────────────────
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) return auth.error;
  const session = auth.session;

  try {
    const order = await prisma.order.findUnique({
      where: { id },
      include: orderDetailInclude,
    });

    if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });

    if (session.role === "CUSTOMER" && order.userId !== session.userId) {
      return NextResponse.json({ error: "Forbidden. Not your order." }, { status: 403 });
    }
    if (session.role === "EMPLOYEE") {
      const gate = await requireStaffPermission(session, [
        "orders.view",
        "orders.fulfill",
        "orders.rx",
        "orders.dispatch",
      ]);
      if ("error" in gate) return gate.error;
      if (
        !employeeMayAccessOrder(
          {
            assignedToId: order.assignedToId,
            warehouseHold: order.warehouseHold,
            warehouseReleasedAt: order.warehouseReleasedAt,
          },
          session.userId
        )
      ) {
        return NextResponse.json(
          {
            error:
              "Forbidden. This order is not assigned to you or is still held for admin release.",
          },
          { status: 403 }
        );
      }
    }

    return NextResponse.json(await serializeOrderDetail(order, session.role));
  } catch (error) {
    console.error("GET /api/orders/[id] error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

function parseTrackingStatus(value: unknown): OrderTrackingStatus | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  return isOrderTrackingStatus(normalized) ? normalized : null;
}

function parseOptionalString(value: unknown, maxLen = 2000): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLen);
}

// ─────────────────────────────────────────────────────────────
// PUT /api/orders/:id
// Status workflow, pick qty, reassignment, internal notes, shipping
// ─────────────────────────────────────────────────────────────
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) return auth.error;
  const session = auth.session;

  try {
    const body = await req.json();
    const status = body?.status !== undefined ? parseTrackingStatus(body.status) : null;
    if (body?.status !== undefined && !status) {
      return NextResponse.json({ error: "Invalid order status." }, { status: 400 });
    }

    const hasPickedQuantity =
      body?.pickedQuantity !== undefined && body?.pickedQuantity !== null;
    const pickedQuantity =
      hasPickedQuantity && Number.isFinite(Number(body.pickedQuantity))
        ? Math.max(0, Math.floor(Number(body.pickedQuantity)))
        : null;

    const assignedToIdRaw = body?.assignedToId;
    const hasAssignment = assignedToIdRaw !== undefined;
    const assignedToId =
      assignedToIdRaw === null || assignedToIdRaw === ""
        ? null
        : typeof assignedToIdRaw === "string"
          ? assignedToIdRaw.trim()
          : null;

    const internalNotes = parseOptionalString(body?.internalNotes);
    const cancelReason = parseOptionalString(body?.cancelReason, 500);
    const courierName = parseOptionalString(body?.courierName, 200);
    const trackingNumber = parseOptionalString(body?.trackingNumber, 200);
    const force = body?.force === true && session.role === "ADMIN";
    // Delivery module: service chosen at order time, weight entered at packing.
    const deliveryServiceIdRaw = body?.deliveryServiceId;
    const deliveryServiceId =
      deliveryServiceIdRaw === null || deliveryServiceIdRaw === ""
        ? null
        : typeof deliveryServiceIdRaw === "string" && deliveryServiceIdRaw.trim()
          ? deliveryServiceIdRaw.trim()
          : undefined;
    const actualWeightRaw = body?.actualWeight;
    const hasActualWeight = actualWeightRaw !== undefined && actualWeightRaw !== null && actualWeightRaw !== "";
    const actualWeight = hasActualWeight ? Number(actualWeightRaw) : null;
    const packages = parsePackages(body?.packages);
    const hasPackages = packages !== null;
    const weightReason = parseOptionalString(body?.weightReason, 500);

    const hasMutation =
      status !== null ||
      hasPickedQuantity ||
      hasAssignment ||
      internalNotes !== undefined ||
      cancelReason !== undefined ||
      courierName !== undefined ||
      trackingNumber !== undefined ||
      deliveryServiceId !== undefined ||
      hasActualWeight ||
      hasPackages;

    if (!hasMutation) {
      return NextResponse.json(
        { error: "Provide status, pickedQuantity, assignedToId, notes, or shipping fields." },
        { status: 400 }
      );
    }

    const existingOrder = await prisma.order.findUnique({ where: { id } });
    if (!existingOrder) return NextResponse.json({ error: "Order not found." }, { status: 404 });

    const auditCtx = buildAuditRequestContext(req);
    const stockAudit = {
      actorUserId: session.userId,
      orderId: id,
      request: auditCtx,
    };

    const currentStatus = existingOrder.status as OrderTrackingStatus;
    const nextStatus = (status ?? currentStatus) as OrderTrackingStatus;

    if (session.role === "CUSTOMER") {
      if (existingOrder.userId !== session.userId) {
        return NextResponse.json({ error: "Forbidden. Not your order." }, { status: 403 });
      }
      if (nextStatus !== "CANCELLED" || status === null) {
        return NextResponse.json({ error: "Customers can only cancel orders." }, { status: 403 });
      }
      if (
        hasPickedQuantity ||
        hasAssignment ||
        internalNotes !== undefined ||
        courierName !== undefined ||
        trackingNumber !== undefined ||
        deliveryServiceId !== undefined ||
        hasActualWeight ||
        hasPackages
      ) {
        return NextResponse.json({ error: "Customers cannot update those fields." }, { status: 403 });
      }
      if (
        existingOrder.status !== "PENDING" &&
        existingOrder.status !== "AWAITING_PROCUREMENT"
      ) {
        return NextResponse.json(
          { error: "Only pending or procurement orders can be cancelled by the customer." },
          { status: 400 }
        );
      }
    } else if (session.role === "EMPLOYEE") {
      if (
        !employeeMayAccessOrder(
          {
            assignedToId: existingOrder.assignedToId,
            warehouseHold: existingOrder.warehouseHold,
            warehouseReleasedAt: existingOrder.warehouseReleasedAt,
          },
          session.userId
        )
      ) {
        return NextResponse.json(
          {
            error:
              "Forbidden. This order is not assigned to you or is still held for admin release.",
          },
          { status: 403 }
        );
      }
      const needsDispatch =
        courierName !== undefined || trackingNumber !== undefined;
      const needsFulfill =
        status !== null ||
        hasPickedQuantity ||
        internalNotes !== undefined ||
        cancelReason !== undefined ||
        deliveryServiceId !== undefined ||
        hasActualWeight ||
        hasPackages;
      if (needsDispatch) {
        const gate = await requireStaffPermission(session, "orders.dispatch");
        if ("error" in gate) return gate.error;
      }
      if (needsFulfill || hasAssignment) {
        const gate = await requireStaffPermission(
          session,
          needsFulfill ? "orders.fulfill" : "orders.view"
        );
        if ("error" in gate) return gate.error;
      }
      if (hasAssignment) {
        return NextResponse.json(
          { error: "Employees cannot reassign orders." },
          { status: 403 }
        );
      }
    } else if (session.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    if (existingOrder.status === "CANCELLED" && nextStatus !== "CANCELLED") {
      return NextResponse.json(
        { error: "Cannot un-cancel an order currently. Please create a new order." },
        { status: 400 }
      );
    }

    if (status && status !== currentStatus) {
      const allowed = canTransitionStatus(currentStatus, status, {
        allowAdminForce: force,
      });
      if (!allowed) {
        return NextResponse.json(
          {
            error: `Invalid status transition from ${currentStatus} to ${status}.`,
          },
          { status: 400 }
        );
      }
    }

    // ── Courier dispatch ──────────────────────────────────────
    // Dispatching (or fixing shipping on an already-dispatched order)
    // requires valid courier + tracking details — no silent back door.
    const dispatching = status === "DISPATCHED" && currentStatus !== "DISPATCHED";
    const editingShippingOnDispatched =
      existingOrder.status === "DISPATCHED" &&
      (courierName !== undefined || trackingNumber !== undefined);
    if (dispatching) {
      const courierCheck = validateCourierName(body?.courierName);
      if (!courierCheck.ok) {
        return NextResponse.json({ error: courierCheck.error }, { status: 400 });
      }
      const trackingCheck = validateTrackingNumber(body?.trackingNumber);
      if (!trackingCheck.ok) {
        return NextResponse.json({ error: trackingCheck.error }, { status: 400 });
      }
    } else if (editingShippingOnDispatched) {
      if (courierName !== undefined) {
        const check = validateCourierName(body?.courierName);
        if (!check.ok) {
          return NextResponse.json({ error: check.error }, { status: 400 });
        }
      }
      if (trackingNumber !== undefined) {
        const check = validateTrackingNumber(body?.trackingNumber);
        if (!check.ok) {
          return NextResponse.json({ error: check.error }, { status: 400 });
        }
      }
    }

    // Dispatch cutoff: an order placed after the cutoff cannot be handed to
    // the courier until its dispatch date — unless a super admin moved it forward.
    if (dispatching && !force) {
      const cutoff = await assertDispatchAllowed(existingOrder);
      if (!cutoff.ok) {
        return NextResponse.json({ error: cutoff.error }, { status: 400 });
      }
    }

    if (
      existingOrder.status === "DISPATCHED" &&
      deliveryServiceId === null
    ) {
      return NextResponse.json(
        { error: "Cannot remove the delivery service from a dispatched order." },
        { status: 400 }
      );
    }

    if (hasAssignment && assignedToId) {
      const employee = await prisma.user.findFirst({
        where: { id: assignedToId, role: "EMPLOYEE" },
        select: { id: true },
      });
      if (!employee) {
        return NextResponse.json(
          { error: "Assignee must be an existing employee." },
          { status: 400 }
        );
      }
    }

    // ── Delivery module ──────────────────────────────────────────
    // Service chosen at order time; weight + charge captured at PACKED.
    const existingDelivery = await prisma.orderDelivery.findUnique({ where: { orderId: id } });
    const currentServiceId = existingOrder.deliveryServiceId ?? existingDelivery?.deliveryServiceId ?? null;
    const nextDeliveryServiceId: string | null | undefined = deliveryServiceId;

    // PACKED → DISPATCHED (or force) must pass the same readiness gate as POST /dispatch.
    // Already-dispatched courier/tracking corrections skip this (safe historical edit).
    if (dispatching) {
      const nextWeight = hasActualWeight
        ? actualWeight
        : hasPackages
          ? sumPackageWeights(packages!)
          : undefined;
      const ready = assertDispatchReadiness({
        order: {
          quantity: existingOrder.quantity,
          reservedQuantity: existingOrder.reservedQuantity,
          pickedQuantity: existingOrder.pickedQuantity,
          deliveryServiceId: existingOrder.deliveryServiceId,
        },
        delivery: existingDelivery
          ? {
              deliveryServiceId: existingDelivery.deliveryServiceId,
              actualWeight: Number(existingDelivery.actualWeight),
            }
          : null,
        next: {
          ...(deliveryServiceId !== undefined
            ? { deliveryServiceId }
            : {}),
          ...(nextWeight !== undefined ? { actualWeight: nextWeight } : {}),
          ...(pickedQuantity !== null ? { pickedQuantity } : {}),
        },
      });
      if (!ready.ok) {
        return NextResponse.json({ error: ready.error }, { status: 400 });
      }
      const effectiveForDispatch =
        deliveryServiceId !== undefined
          ? deliveryServiceId
          : currentServiceId;
      const service = effectiveForDispatch
        ? await resolveActiveDeliveryService(effectiveForDispatch)
        : null;
      if (!service) {
        return NextResponse.json(
          { error: "Selected delivery service is not available." },
          { status: 400 }
        );
      }
    }

    if (deliveryServiceId) {
      const service = await prisma.deliveryService.findUnique({ where: { id: deliveryServiceId } });
      if (!service || !service.isActive) {
        return NextResponse.json({ error: "Selected delivery service is not available." }, { status: 400 });
      }
      // Only enforce change rules when the service actually changes — re-saving
      // the same service (e.g. together with a weight correction) is always OK.
      if (deliveryServiceId !== currentServiceId) {
        const editableForServiceChange =
          session.role === "ADMIN"
            ? existingOrder.status !== "COMPLETED" && existingOrder.status !== "CANCELLED"
            : ["PENDING", "PICKING", "AWAITING_PROCUREMENT"].includes(existingOrder.status);
        if (!editableForServiceChange) {
          return NextResponse.json(
            { error: "Delivery service can no longer be changed for this order." },
            { status: 400 }
          );
        }
      }
    }
    const movingToPacked = status === "PACKED" && currentStatus !== "PACKED";
    const effectiveServiceId =
      nextDeliveryServiceId !== undefined ? nextDeliveryServiceId : currentServiceId;
    if (movingToPacked) {
      if (!effectiveServiceId) {
        return NextResponse.json(
          { error: "Choose a delivery service before marking the order as packed." },
          { status: 400 }
        );
      }
      if (!hasActualWeight && !hasPackages && !existingDelivery) {
        return NextResponse.json(
          { error: "Enter the packed weight (kg) to mark the order as packed." },
          { status: 400 }
        );
      }
      if (hasActualWeight && (!Number.isFinite(actualWeight!) || actualWeight! <= 0)) {
        return NextResponse.json({ error: "Enter a valid packed weight greater than 0." }, { status: 400 });
      }
      if (body?.packages !== undefined && !hasPackages) {
        return NextResponse.json({ error: "Invalid packages. Each package needs a weight > 0." }, { status: 400 });
      }
    }
    const editingWeightAfterPack =
      !movingToPacked && (hasActualWeight || hasPackages) && existingDelivery;
    if (editingWeightAfterPack) {
      if (!weightReason) {
        return NextResponse.json(
          { error: "A reason is required to change the packed weight." },
          { status: 400 }
        );
      }
      if (
        session.role === "EMPLOYEE" &&
        !["PACKED"].includes(existingOrder.status)
      ) {
        return NextResponse.json(
          { error: "Packed weight can only be corrected while the order is Packed. Ask an admin." },
          { status: 403 }
        );
      }
      if (["COMPLETED", "CANCELLED"].includes(existingOrder.status) && session.role !== "ADMIN") {
        return NextResponse.json({ error: "Weight can no longer be changed." }, { status: 403 });
      }
    }
    if ((hasActualWeight || hasPackages) && session.role === "CUSTOMER") {
      return NextResponse.json({ error: "Customers cannot update weight." }, { status: 403 });
    }

    if (nextStatus === "CANCELLED" && existingOrder.status !== "CANCELLED") {
      const invoiceGate = await assertOrderInvoiceAllowsCancellation(existingOrder.id);
      if (!invoiceGate.ok) {
        return NextResponse.json({ error: invoiceGate.error }, { status: 400 });
      }
      // Stock restore, sale void, loyalty reverse, order+invoice void run inside
      // the cancelling transaction below (Phase 4 atomicity).
    }

    if (pickedQuantity !== null && session.role !== "CUSTOMER" && nextStatus !== "CANCELLED") {
      await setOrderPickedQuantity(existingOrder, pickedQuantity, stockAudit);
    }

    const updateData: Prisma.OrderUpdateInput = {};

    if (status && status !== currentStatus) {
      updateData.status = status;
    }
    if (status === "CANCELLED" && currentStatus !== "CANCELLED") {
      updateData.transactionId = null;
      updateData.reservedQuantity = 0;
      if (cancelReason !== undefined) {
        updateData.cancelReason = cancelReason;
      } else if (typeof body?.cancelReason === "string" && body.cancelReason.trim()) {
        updateData.cancelReason = body.cancelReason.trim().slice(0, 500);
      }
    }
    if (hasAssignment && session.role === "ADMIN") {
      updateData.assignedTo =
        assignedToId === null
          ? { disconnect: true }
          : { connect: { id: assignedToId } };
      updateData.assignedAt = assignedToId ? new Date() : null;
    }
    if (internalNotes !== undefined && session.role !== "CUSTOMER") {
      updateData.internalNotes = internalNotes;
    }
    if (courierName !== undefined && session.role !== "CUSTOMER") {
      updateData.courierName = courierName;
    }
    if (trackingNumber !== undefined && session.role !== "CUSTOMER") {
      updateData.trackingNumber = trackingNumber;
    }
    if (nextDeliveryServiceId !== undefined && session.role !== "CUSTOMER") {
      updateData.deliveryService =
        nextDeliveryServiceId === null ? { disconnect: true } : { connect: { id: nextDeliveryServiceId } };
    }

    const isCancelling =
      status === "CANCELLED" && currentStatus !== "CANCELLED";

    let updatedOrder;
    try {
      if (isCancelling) {
        updatedOrder = await prisma.$transaction(async (tx) => {
          await restorePickedStock(existingOrder, stockAudit, tx);
          if (existingOrder.transactionId) {
            await voidTransaction(
              existingOrder.transactionId,
              ReasonCode.VOID.INCORRECT_ENTRY,
              cancelReason ?? "Order cancelled",
              session,
              tx
            );
          }
          await reverseRedemption({
            customerId: existingOrder.userId,
            orderId: existingOrder.id,
            db: tx,
          });
          const order = await tx.order.update({
            where: { id },
            data: updateData,
          });
          await voidUnpaidInvoiceOnOrderCancel({
            orderId: id,
            reason: cancelReason || "Order cancelled",
            tx,
          });
          return order;
        });
      } else {
        updatedOrder = await prisma.order.update({
          where: { id },
          data: updateData,
        });
      }
    } catch (e) {
      if (e instanceof OrderInvoiceCancellationError) {
        return NextResponse.json({ error: e.message }, { status: 400 });
      }
      throw e;
    }

    // Record packed weight + delivery charge (mandatory at PACKED).
    let packedDelivery: Awaited<ReturnType<typeof recordPackingDelivery>> | null = null;
    const needsDeliveryRecord =
      (movingToPacked && (hasActualWeight || hasPackages || existingDelivery)) ||
      Boolean(editingWeightAfterPack);
    if (needsDeliveryRecord) {
      const serviceId = effectiveServiceId!;
      const weightInput = hasActualWeight || hasPackages
        ? { actualWeight: hasActualWeight ? actualWeight : null, packages: hasPackages ? packages : null }
        : {
            actualWeight: existingDelivery ? Number(existingDelivery.actualWeight) : null,
            packages: (existingDelivery?.packages as unknown as { no?: number; weight: number }[] | null) ?? null,
          };
      try {
        packedDelivery = await recordPackingDelivery({
          orderId: id,
          deliveryServiceId: serviceId,
          actualWeight: weightInput.actualWeight,
          packages: weightInput.packages,
          enteredBy: session.userId,
          reason: weightReason ?? null,
        });
      } catch (e) {
        return NextResponse.json(
          { error: e instanceof Error ? e.message : "Could not calculate delivery charge." },
          { status: 400 }
        );
      }
      await logOrderActivity(prisma, {
        orderId: id,
        actorUserId: session.userId,
        action: existingDelivery ? "WEIGHT_CHANGED" : "WEIGHT_ENTERED",
        message: existingDelivery
          ? `Packed weight corrected to ${packedDelivery.pricing.actualWeight} kg (chargeable ${packedDelivery.pricing.chargeableWeight} kg, delivery ₹${packedDelivery.pricing.customerCharge}).`
          : `Packed weight ${packedDelivery.pricing.actualWeight} kg entered (chargeable ${packedDelivery.pricing.chargeableWeight} kg, delivery ₹${packedDelivery.pricing.customerCharge}).`,
        metadata: {
          actualWeight: packedDelivery.pricing.actualWeight,
          chargeableWeight: packedDelivery.pricing.chargeableWeight,
          customerCharge: packedDelivery.pricing.customerCharge,
          internalCost: packedDelivery.pricing.internalCost,
          margin: packedDelivery.pricing.margin,
          reason: weightReason ?? null,
        },
      });
    }

    const shouldFulfillPick =
      pickedQuantity === null &&
      (nextStatus === "PACKED" || nextStatus === "COMPLETED") &&
      existingOrder.reservedQuantity > existingOrder.pickedQuantity;

    if (shouldFulfillPick) {
      updatedOrder = await fulfillOrderPick(updatedOrder, stockAudit);
    }

    if (
      status &&
      status !== currentStatus &&
      (status === "DISPATCHED" || status === "COMPLETED") &&
      existingOrder.lineType === "RETAIL"
    ) {
      await markActiveVersionFinalFulfilled(id);
    }

    // Invoice PAID/ISSUED is payment-driven only — never flip from order status.

    // Loyalty: activate any pending points once the order is completed.
    if (status === "COMPLETED" && status !== currentStatus) {
      await activateOrderLoyalty(id).catch(() => undefined);
    }

    const activityMessages: string[] = [];
    if (status && status !== currentStatus) {
      activityMessages.push(
        `Status changed from ${formatOrderStatusLabel(currentStatus)} to ${formatOrderStatusLabel(status)}.`
      );
      await logOrderActivity(prisma, {
        orderId: id,
        actorUserId: session.userId,
        action: status === "CANCELLED" ? "CANCELLED" : "STATUS_CHANGED",
        message: activityMessages[activityMessages.length - 1]!,
        metadata: {
          from: currentStatus,
          to: status,
          force,
          cancelReason: updateData.cancelReason ?? null,
        },
      });
      const auditCtx = buildAuditRequestContext(req);
      await recordAuditEvent(prisma, {
        action:
          status === "CANCELLED"
            ? AuditAction.ORDER_CANCELLED
            : AuditAction.ORDER_STATUS_CHANGED,
        module: AuditModule.ORDER,
        entityType: "Order",
        entityId: id,
        actor: actorFromSession(session),
        request: auditCtx,
        reasonCode:
          status === "CANCELLED" ? ReasonCode.ORDER_CANCEL.OTHER : undefined,
        reasonText: status === "CANCELLED" ? (cancelReason ?? null) : null,
        changes: singleChange("status", currentStatus, status),
        context: { orderNumber: existingOrder.orderNumber },
        activityMessage: activityMessages[activityMessages.length - 1]!,
      });
    }
    if (hasAssignment && session.role === "ADMIN") {
      const msg = assignedToId
        ? `Order reassigned to employee ${assignedToId}.`
        : "Order unassigned.";
      await logOrderActivity(prisma, {
        orderId: id,
        actorUserId: session.userId,
        action: "REASSIGNED",
        message: msg,
        metadata: {
          from: existingOrder.assignedToId,
          to: assignedToId,
        },
      });
      // RW-05: notify only when assignment newly makes a released hold order eligible.
      const previouslyEligible =
        Boolean(existingOrder.assignedToId) &&
        (!existingOrder.warehouseHold ||
          Boolean(existingOrder.warehouseReleasedAt));
      const notify = shouldNotifyStaffOnEligibilityChange({
        previouslyEligible,
        nowAssignedToId: assignedToId,
        warehouseHold: existingOrder.warehouseHold,
        warehouseReleasedAt: existingOrder.warehouseReleasedAt,
      });
      if (notify.notify && notify.assigneeId) {
        const customer = await prisma.user.findUnique({
          where: { id: existingOrder.userId },
          select: { name: true, email: true },
        });
        const label =
          customer?.name?.trim() || customer?.email || "Customer";
        await notifyStaffOfNewOrder(id, label, notify.assigneeId);
      }
    }
    if (pickedQuantity !== null && session.role !== "CUSTOMER") {
      await logOrderActivity(prisma, {
        orderId: id,
        actorUserId: session.userId,
        action: "PICKED_QUANTITY",
        message: `Picked quantity set to ${pickedQuantity}.`,
        metadata: { pickedQuantity },
      });
    }
    if (internalNotes !== undefined && session.role !== "CUSTOMER") {
      await logOrderActivity(prisma, {
        orderId: id,
        actorUserId: session.userId,
        action: "INTERNAL_NOTES",
        message: "Internal notes updated.",
      });
    }
    if (
      (courierName !== undefined || trackingNumber !== undefined) &&
      session.role !== "CUSTOMER"
    ) {
      await logOrderActivity(prisma, {
        orderId: id,
        actorUserId: session.userId,
        action: "SHIPPING_UPDATED",
        message: "Shipping / tracking details updated.",
        metadata: {
          courierName: courierName ?? updatedOrder.courierName,
          trackingNumber: trackingNumber ?? updatedOrder.trackingNumber,
        },
      });
    }

    const shouldCreateNotification =
      Boolean(status) &&
      existingOrder.status !== status &&
      (session.role === "ADMIN" || session.role === "EMPLOYEE");

    if (shouldCreateNotification && status) {
      const packedNote =
        packedDelivery && status === "PACKED"
          ? ` Packed ${(packedDelivery.pricing.actualWeight)} kg, delivery ₹${packedDelivery.pricing.customerCharge}.`
          : "";
      await prisma.notification.create({
        data: {
          userId: existingOrder.userId,
          orderId: existingOrder.id,
          type: NotificationType.ORDER_STATUS_UPDATED,
          title: "Order Update",
          message: `Your order #${existingOrder.id.slice(-8).toUpperCase()} is now ${formatOrderStatusLabel(status)}.${packedNote}`,
        },
      });
    }

    const full = await prisma.order.findUnique({
      where: { id },
      include: orderDetailInclude,
    });
    if (!full) return NextResponse.json(updatedOrder);

    return NextResponse.json(await serializeOrderDetail(full, session.role));
  } catch (error) {
    console.error("PUT /api/orders/[id] error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────
// PATCH /api/orders/:id
// Safe edit while PENDING or AWAITING_PROCUREMENT (admin/employee)
// ─────────────────────────────────────────────────────────────
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) return auth.error;
  const session = auth.session;
  if (session.role !== "ADMIN" && session.role !== "EMPLOYEE") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    const existingOrder = await prisma.order.findUnique({ where: { id } });
    if (!existingOrder) return NextResponse.json({ error: "Order not found." }, { status: 404 });

    if (session.role === "EMPLOYEE") {
      if (existingOrder.assignedToId && existingOrder.assignedToId !== session.userId) {
        return NextResponse.json(
          { error: "Forbidden. Not your assigned order." },
          { status: 403 }
        );
      }
    }

    if (!isEditableOrderStatus(existingOrder.status)) {
      return NextResponse.json(
        {
          error:
            "Orders can only be edited while Pending or Awaiting Procurement. Use a return after fulfillment.",
        },
        { status: 400 }
      );
    }

    const body = await req.json();
    const data: Prisma.OrderUpdateInput = {};

    // Order.unitPrice is per pair; Order.quantity is pieces.
    const pricingTouched =
      body?.quantity !== undefined || body?.unitPrice !== undefined;
    let nextPairPrice = Number(existingOrder.unitPrice);
    let nextPieceQty = Number(existingOrder.quantity);

    if (body?.quantity !== undefined) {
      const quantity = Number(body.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        return NextResponse.json({ error: "Invalid quantity." }, { status: 400 });
      }
      data.quantity = quantity;
      nextPieceQty = quantity;
    }

    if (body?.unitPrice !== undefined) {
      const unitPrice = Number(body.unitPrice);
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        return NextResponse.json({ error: "Invalid unit price." }, { status: 400 });
      }
      data.unitPrice = unitPrice;
      nextPairPrice = unitPrice;
    }

    if (pricingTouched) {
      // C10: wholesale multi-line orders cannot be safely re-priced from header alone.
      if (existingOrder.lineType === "WHOLESALE") {
        return NextResponse.json(
          {
            error:
              "Wholesale order quantity or pair price cannot be edited on the header. Multi-line wholesale invoices must be corrected via Finance or a replacement order — incomplete recalculation is not allowed.",
          },
          { status: 400 }
        );
      }
      data.totalAmount = orderTotalFromPairPrice(nextPairPrice, nextPieceQty);
    }

    if (body?.sph !== undefined || body?.cyl !== undefined || body?.axis !== undefined || body?.add !== undefined || body?.eye !== undefined) {
      if (existingOrder.lineType === "RETAIL") {
        return NextResponse.json(
          {
            error:
              "Retail order power cannot be edited directly. Use Smart Alternate Power (mark not available → customer accepts an alternate).",
          },
          { status: 400 }
        );
      }
    }

    if (body?.sph !== undefined) {
      data.sph = body.sph === null || body.sph === "" ? null : Number(body.sph);
    }
    if (body?.cyl !== undefined) {
      data.cyl = body.cyl === null || body.cyl === "" ? null : Number(body.cyl);
    }
    if (body?.axis !== undefined) {
      data.axis =
        body.axis === null || body.axis === ""
          ? null
          : Math.round(Number(body.axis));
    }
    if (body?.add !== undefined) {
      data.add = body.add === null || body.add === "" ? null : Number(body.add);
    }
    if (body?.eye !== undefined) {
      data.eye =
        typeof body.eye === "string" && body.eye.trim()
          ? body.eye.trim().toUpperCase()
          : null;
    }
    if (body?.notes !== undefined) {
      const notesResult = validateOrderNotes(body.notes);
      if (!notesResult.ok) {
        return NextResponse.json({ error: notesResult.error }, { status: 400 });
      }
      data.notes = notesResult.notes;
    }
    if (body?.deliveryServiceId !== undefined) {
      const raw = body.deliveryServiceId;
      if (raw === null || raw === "") {
        data.deliveryService = { disconnect: true };
      } else if (typeof raw === "string" && raw.trim()) {
        const service = await prisma.deliveryService.findUnique({ where: { id: raw.trim() } });
        if (!service || !service.isActive) {
          return NextResponse.json({ error: "Selected delivery service is not available." }, { status: 400 });
        }
        data.deliveryService = { connect: { id: service.id } };
      } else {
        return NextResponse.json({ error: "Invalid delivery service." }, { status: 400 });
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "No editable fields provided." }, { status: 400 });
    }

    try {
      await prisma.$transaction(async (tx) => {
        const updated = await tx.order.update({ where: { id }, data });

        if (pricingTouched) {
          const sync = await syncUnpaidInvoiceAfterOrderPricingEdit(tx, {
            orderId: id,
            pairUnitPrice: nextPairPrice,
            pieceQuantity: nextPieceQty,
          });
          if (!sync.ok) {
            throw new OrderPricingInvoiceSyncError(sync.error);
          }
          // Keep linked sale transaction amount aligned with order total (retail).
          if (existingOrder.transactionId) {
            await tx.transaction.updateMany({
              where: {
                id: existingOrder.transactionId,
                status: { not: "VOIDED" },
              },
              data: { amount: updated.totalAmount },
            });
          }
        }
      });
    } catch (err) {
      if (err instanceof OrderPricingInvoiceSyncError) {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
      throw err;
    }

    const auditCtx = buildAuditRequestContext(req);
    await recordAuditEvent(prisma, {
      action: AuditAction.ORDER_UPDATED,
      module: AuditModule.ORDER,
      entityType: "Order",
      entityId: id,
      actor: actorFromSession(session),
      request: auditCtx,
      context: { orderNumber: (await prisma.order.findUnique({ where: { id }, select: { orderNumber: true } }))?.orderNumber },
      activityMessage: "Order details edited before fulfillment.",
    });

    await logOrderActivity(prisma, {
      orderId: id,
      actorUserId: session.userId,
      action: "ORDER_EDITED",
      message: "Order details edited before fulfillment.",
      metadata: data as Prisma.InputJsonValue,
    });

    const full = await prisma.order.findUnique({
      where: { id },
      include: orderDetailInclude,
    });
    if (!full) return NextResponse.json({ error: "Order not found." }, { status: 404 });
    return NextResponse.json(await serializeOrderDetail(full, session.role));
  } catch (error) {
    console.error("PATCH /api/orders/[id] error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// DELETE /api/orders/:id — ADMIN archive (no hard delete)
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) return auth.error;
  const session = auth.session;
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden. Admin only." }, { status: 403 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const archiveReason = String(body.reason ?? body.archiveReason ?? "").trim() || "Archived by admin";

    const existingOrder = await prisma.order.findUnique({ where: { id } });
    if (!existingOrder) return NextResponse.json({ error: "Order not found." }, { status: 404 });
    if (existingOrder.archivedAt) {
      return NextResponse.json({ error: "Order is already archived." }, { status: 409 });
    }

    const invoiceGate = await assertOrderInvoiceAllowsCancellation(id);
    if (!invoiceGate.ok) {
      return NextResponse.json({ error: invoiceGate.error }, { status: 400 });
    }

    try {
      await prisma.$transaction(async (tx) => {
        if (existingOrder.status !== OrderStatus.CANCELLED) {
          await restorePickedStock(
            existingOrder,
            {
              actorUserId: session.userId,
              orderId: id,
              request: buildAuditRequestContext(req),
            },
            tx
          );
          if (existingOrder.transactionId) {
            await voidTransaction(
              existingOrder.transactionId,
              ReasonCode.VOID.INCORRECT_ENTRY,
              archiveReason,
              session,
              tx
            );
          }
          await reverseRedemption({
            customerId: existingOrder.userId,
            orderId: existingOrder.id,
            db: tx,
          });
        }
        await tx.order.update({
          where: { id },
          data: {
            archivedAt: new Date(),
            archiveReason,
            status: OrderStatus.CANCELLED,
            transactionId: null,
            reservedQuantity: 0,
          },
        });
        await voidUnpaidInvoiceOnOrderCancel({
          orderId: id,
          reason: archiveReason,
          tx,
        });
      });
    } catch (e) {
      if (e instanceof OrderInvoiceCancellationError) {
        return NextResponse.json({ error: e.message }, { status: 400 });
      }
      throw e;
    }

    await logOrderActivity(prisma, {
      orderId: id,
      actorUserId: session.userId,
      action: "ARCHIVED",
      message: "Order archived by admin (not hard-deleted).",
    });

    const auditCtx = buildAuditRequestContext(req);
    await recordAuditEvent(prisma, {
      action: AuditAction.ORDER_ARCHIVED,
      module: AuditModule.ORDER,
      entityType: "Order",
      entityId: id,
      actor: actorFromSession(session),
      request: auditCtx,
      reasonCode: ReasonCode.VOID.OTHER,
      reasonText: archiveReason,
      context: { orderNumber: existingOrder.orderNumber },
      activityMessage: `Order archived — ${archiveReason}`,
    });

    return NextResponse.json({ message: "Order archived successfully." });
  } catch (error) {
    console.error("DELETE /api/orders/[id] error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
