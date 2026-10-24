import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "../../../lib/session-auth";

import { generateUniqueOrderNumber } from "../../../lib/order-numbers";
import {
  buildRxOrderNotes,
  mapColorLensTypeToPrisma,
  mapRxOrderForToEye,
  parseRxEyePower,
  type RxOrderRequest,
} from "../../../lib/rx-order";
import { prisma } from "../../../lib/prisma";
import { getSignedOrderImageUrl } from "../../../lib/supabase-storage";
import {
  assessSelfServeOrderEligibility,
  assessStaffOnBehalfOrderEligibility,
} from "../../../lib/customer-order-eligibility";
import { requireStaffPermission } from "../../../lib/staff-access";
import { resolveCheckoutDeliveryServiceId } from "../../../lib/delivery-pack";
import { dispatchSlotForNow } from "../../../lib/dispatch-cutoff";
import { warehouseReleaseCreateFields } from "../../../lib/prescription-order-hold";
import {
  buildOnBehalfActivityMessage,
  resolveOrderAttribution,
  stripClientOrderAttribution,
} from "../../../lib/order-attribution";
import {
  AuditAction,
  AuditModule,
  recordAuditEvent,
} from "../../../lib/audit";
import { logOrderActivity } from "../../../lib/order-activity";

function isStaffRole(role: string): boolean {
  return role === "ADMIN" || role === "EMPLOYEE";
}

// POST /api/orders/rx — place a custom prescription (RX) order
export async function POST(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) {
    return auth.error;
  }
  const session = auth.session;
  if (session.role !== "CUSTOMER" && !isStaffRole(session.role)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  if (session.role === "EMPLOYEE") {
    const gate = await requireStaffPermission(session, [
      "orders.rx",
      "orders.create_on_behalf",
    ]);
    if ("error" in gate) return gate.error;
  }

  try {
    const rawBody = (await req.json()) as Record<string, unknown>;
    const body = stripClientOrderAttribution(rawBody) as RxOrderRequest & {
      userId?: string;
    };

    let targetUserId = session.userId;
    if (session.role === "CUSTOMER") {
      const customer = await prisma.user.findUnique({ where: { id: session.userId } });
      const selfGate = customer
        ? assessSelfServeOrderEligibility(customer)
        : ({
            ok: false as const,
            message:
              "Your account is pending admin approval. You cannot place orders yet.",
          });
      if (!selfGate.ok) {
        return NextResponse.json({ error: selfGate.message }, { status: 403 });
      }
    } else {
      const onBehalfUserId =
        typeof body.userId === "string" ? body.userId.trim() : "";
      if (!onBehalfUserId) {
        return NextResponse.json(
          { error: "Customer userId is required when placing an RX order on behalf." },
          { status: 400 }
        );
      }
      const customer = await prisma.user.findUnique({ where: { id: onBehalfUserId } });
      if (!customer || customer.role !== "CUSTOMER") {
        return NextResponse.json({ error: "Customer not found." }, { status: 404 });
      }
      const onBehalfGate = assessStaffOnBehalfOrderEligibility(customer);
      if (!onBehalfGate.ok) {
        return NextResponse.json(
          { error: onBehalfGate.message },
          { status: 403 }
        );
      }
      targetUserId = onBehalfUserId;
    }

    const attribution = resolveOrderAttribution({
      session: { role: session.role, userId: session.userId },
      customerUserId: targetUserId,
    });

    const prismaLensType = mapColorLensTypeToPrisma(body.lensType);
    if (!prismaLensType) {
      return NextResponse.json({ error: "Invalid lens type." }, { status: 400 });
    }

    const orderFor = body.orderFor ?? "both";
    const right = parseRxEyePower(body.prescription?.right);
    const left = parseRxEyePower(body.prescription?.left);

    if ((orderFor === "both" || orderFor === "right") && !right) {
      return NextResponse.json({ error: "Right eye prescription is required." }, { status: 400 });
    }
    if ((orderFor === "both" || orderFor === "left") && !left) {
      return NextResponse.json({ error: "Left eye prescription is required." }, { status: 400 });
    }

    const quantity =
      body.quantity != null && Number.isFinite(body.quantity) && body.quantity > 0
        ? Math.round(body.quantity)
        : 1;

    const primaryEye = right ?? left;
    if (!primaryEye) {
      return NextResponse.json({ error: "Prescription is required." }, { status: 400 });
    }

    let deliveryServiceId: string | null = null;
    try {
      deliveryServiceId = await resolveCheckoutDeliveryServiceId(
        (body as Record<string, unknown>).deliveryServiceId
      );
    } catch {
      return NextResponse.json({ error: "Selected delivery service is not available." }, { status: 400 });
    }

    const orderNotes = buildRxOrderNotes({
      ...body,
      prescription: { right, left },
      quantity,
    });

    const prescriptionImage = body.prescriptionImageUrl?.trim() || null;
    const orderNumber = await generateUniqueOrderNumber();
    const cutoffSlot = await dispatchSlotForNow();

    // RW-05: RX stays admin-held — no auto-assign / staff notify until warehouse release.
    const order = await prisma.order.create({
      data: {
        orderNumber,
        userId: targetUserId,
        ...warehouseReleaseCreateFields(),
        ...attribution,
        lensType: prismaLensType,
        quantity,
        reservedQuantity: 0,
        pickedQuantity: 0,
        unitPrice: 0,
        totalAmount: 0,
        status: "PENDING",
        notes: orderNotes,
        deliveryServiceId,
        orderImageUrl: prescriptionImage,
        ...cutoffSlot,
        sph: primaryEye.sph,
        cyl: primaryEye.cyl,
        axis: primaryEye.axis,
        add: primaryEye.add,
        eye: mapRxOrderForToEye(orderFor),
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            businessName: true,
          },
        },
        placedBy: {
          select: { id: true, name: true, email: true, role: true },
        },
      },
    });

    const signedImageUrl = order.orderImageUrl
      ? await getSignedOrderImageUrl(order.orderImageUrl)
      : null;

    const customerLabel =
      order.user?.businessName?.trim() ||
      order.user?.name?.trim() ||
      order.user?.email ||
      "Customer";
    const actorLabel =
      order.placedBy?.name?.trim() || order.placedBy?.email || null;
    const activityMessage = buildOnBehalfActivityMessage({
      orderNumber: order.orderNumber,
      orderId: order.id,
      customerLabel,
      sessionRole: session.role,
      actorLabel,
    });

    await recordAuditEvent(prisma, {
      action: AuditAction.ORDER_CREATED,
      module: AuditModule.ORDER,
      entityType: "Order",
      entityId: order.id,
      actor: {
        actorType: "HUMAN",
        actorUserId: session.userId,
        actorName: actorLabel,
      },
      context: {
        orderNumber: order.orderNumber,
        orderSource: attribution.orderSource,
        customerUserId: targetUserId,
        placedByUserId: attribution.placedByUserId,
        channel: "RX",
        warehouseHold: true,
      },
      activityMessage,
      message: `RX order created (${order.status})`,
    });

    if (attribution.placedByUserId) {
      await logOrderActivity(prisma, {
        orderId: order.id,
        actorUserId: session.userId,
        action: "ORDER_CREATED_ON_BEHALF",
        message: activityMessage,
        metadata: {
          orderSource: attribution.orderSource,
          customerUserId: targetUserId,
          channel: "RX",
        },
      });
    }

    return NextResponse.json(
      {
        order: {
          ...order,
          warehouseReleasedAt: null,
          createdAt: order.createdAt.toISOString(),
          updatedAt: order.updatedAt.toISOString(),
        },
        message:
          session.role === "CUSTOMER"
            ? "Your prescription order has been placed. Our team will confirm pricing and delivery."
            : "Prescription order placed for the customer. Held for admin review before warehouse.",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/orders/rx error:", error);
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
