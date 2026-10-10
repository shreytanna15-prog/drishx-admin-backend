import { NextRequest, NextResponse } from "next/server";
import { InvoiceStatus, NotificationType } from "@prisma/client";
import { getSessionOrUnauthorized } from "../../../../lib/session-auth";
import { prisma } from "../../../../lib/prisma";
import {
  canTransitionStatus,
  formatOrderStatusLabel,
  type OrderTrackingStatus,
} from "../../../../lib/order-status-transitions";
import { logOrderActivity } from "../../../../lib/order-activity";
import { assertDispatchAllowed } from "../../../../lib/dispatch-cutoff";
import {
  AuditAction,
  AuditModule,
  actorFromSession,
  buildAuditRequestContext,
  recordAuditEvent,
  singleChange,
} from "../../../../lib/audit";
import { requireStaffPermission } from "../../../../lib/staff-access";
import { markActiveVersionFinalFulfilled } from "../../../../lib/alternate-power-workflow";
import {
  orderDetailInclude,
  serializeOrderDetail,
} from "../../../../lib/order-detail";

function parseDispatchField(value: unknown, maxLen = 200): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLen);
}

// ─────────────────────────────────────────────────────────────
// POST /api/orders/:id/dispatch
// Handover to courier: capture courier + tracking, move PACKED → DISPATCHED.
// ─────────────────────────────────────────────────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let id: string;
  try {
    ({ id } = await params);
  } catch {
    return NextResponse.json({ error: "Invalid order id." }, { status: 400 });
  }

  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) return auth.error;
  const session = auth.session;

  try {
    const body = await req.json().catch(() => null);
    const courierName = parseDispatchField(body?.courierName);
    const trackingNumber = parseDispatchField(body?.trackingNumber);
    if (!courierName || !trackingNumber) {
      return NextResponse.json(
        { error: "Courier name and tracking number are required to dispatch." },
        { status: 400 }
      );
    }

    const order = await prisma.order.findUnique({
      where: { id },
      include: orderDetailInclude,
    });
    if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });

    if (session.role === "CUSTOMER") {
      return NextResponse.json({ error: "Customers cannot dispatch orders." }, { status: 403 });
    }
    if (session.role === "EMPLOYEE") {
      const gate = await requireStaffPermission(session, "orders.dispatch");
      if ("error" in gate) return gate.error;
      if (order.assignedToId && order.assignedToId !== session.userId) {
        return NextResponse.json({ error: "Forbidden. Not your assigned order." }, { status: 403 });
      }
    }

    const currentStatus = order.status as OrderTrackingStatus;
    if (currentStatus === "COMPLETED" || currentStatus === "CANCELLED") {
      return NextResponse.json(
        { error: "A completed or cancelled order cannot be dispatched." },
        { status: 400 }
      );
    }
    if (currentStatus !== "PACKED" && currentStatus !== "DISPATCHED") {
      return NextResponse.json(
        { error: "Order must be packed before it can be dispatched." },
        { status: 400 }
      );
    }
    if (!canTransitionStatus(currentStatus, "DISPATCHED")) {
      return NextResponse.json(
        {
          error: `Invalid status transition from ${formatOrderStatusLabel(currentStatus)} to Dispatched.`,
        },
        { status: 400 }
      );
    }

    const alreadyDispatched = currentStatus === "DISPATCHED";
    const statusChanged = !alreadyDispatched;
    const duplicateWarning =
      alreadyDispatched &&
      order.courierName === courierName &&
      order.trackingNumber === trackingNumber
        ? "This order was already dispatched with the same courier and tracking details."
        : null;

    if (statusChanged) {
      const cutoff = await assertDispatchAllowed(order);
      if (!cutoff.ok) {
        return NextResponse.json({ error: cutoff.error }, { status: 400 });
      }
    }

    const auditCtx = buildAuditRequestContext(req);

    await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id },
        data: {
          courierName,
          trackingNumber,
          status: statusChanged ? "DISPATCHED" : undefined,
        },
      });

      if (statusChanged && order.lineType === "RETAIL") {
        await markActiveVersionFinalFulfilled(id);
      }
      if (statusChanged) {
        await tx.invoice.updateMany({
          where: { orderId: order.id },
          data: { status: InvoiceStatus.ISSUED },
        });
      }

      await logOrderActivity(tx, {
        orderId: order.id,
        actorUserId: session.userId,
        action: "ORDER_DISPATCHED",
        message: statusChanged
          ? `Order dispatched via ${courierName} (tracking ${trackingNumber}).`
          : `Courier details updated to ${courierName} (tracking ${trackingNumber}).`,
        metadata: { courierName, trackingNumber },
      });
    });

    await recordAuditEvent(prisma, {
      action: AuditAction.ORDER_STATUS_CHANGED,
      module: AuditModule.ORDER,
      entityType: "Order",
      entityId: order.id,
      actor: actorFromSession(session),
      request: auditCtx,
      changes: statusChanged
        ? singleChange("status", currentStatus, "DISPATCHED")
        : singleChange("courierDetails", null, `${courierName} / ${trackingNumber}`),
      context: { orderNumber: order.orderNumber },
      activityMessage: `Order dispatched via ${courierName} (tracking ${trackingNumber}).`,
    });

    if (statusChanged) {
      await prisma.notification.create({
        data: {
          userId: order.userId,
          orderId: order.id,
          type: NotificationType.ORDER_STATUS_UPDATED,
          title: "Order Dispatched",
          message: `Your order #${order.id.slice(-8).toUpperCase()} is now Dispatched via ${courierName}. Tracking: ${trackingNumber}.`,
        },
      });
    }

    const full = await prisma.order.findUnique({
      where: { id },
      include: orderDetailInclude,
    });
    if (!full) return NextResponse.json({ order: null, duplicateWarning }, { status: 200 });

    const payload = await serializeOrderDetail(full, session.role);
    return NextResponse.json({ order: payload, duplicateWarning });
  } catch (error) {
    console.error("POST /api/orders/[id]/dispatch error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}