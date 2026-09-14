import { NextRequest, NextResponse } from "next/server";
import { getSession } from "../../../lib/session-auth";

import { generateUniqueOrderNumber } from "../../../lib/order-numbers";
import {
  buildRxOrderNotes,
  mapColorLensTypeToPrisma,
  mapRxOrderForToEye,
  parseRxEyePower,
  type RxOrderRequest,
} from "../../../lib/rx-order";
import { prisma } from "../../../lib/prisma";
import { notifyStaffOfNewOrder } from "../../../lib/staff-notifications";
import {
  assignmentCreateFields,
  resolveOrderAssigneeId,
} from "../../../lib/assign-order-to-employee";
import { getSignedOrderImageUrl } from "../../../lib/supabase-storage";
import { isCustomerApproved } from "../../../lib/user-public";
import { requireStaffPermission } from "../../../lib/staff-access";
import { resolveCheckoutDeliveryServiceId } from "../../../lib/delivery-pack";

function isStaffRole(role: string): boolean {
  return role === "ADMIN" || role === "EMPLOYEE";
}

// POST /api/orders/rx — place a custom prescription (RX) order
export async function POST(req: NextRequest) {
  const session = getSession(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
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
    const body = (await req.json()) as RxOrderRequest & { userId?: string };

    let targetUserId = session.userId;
    if (session.role === "CUSTOMER") {
      const customer = await prisma.user.findUnique({ where: { id: session.userId } });
      if (!customer || !isCustomerApproved(customer)) {
        return NextResponse.json(
          { error: "Your account is pending admin approval. You cannot place orders yet." },
          { status: 403 }
        );
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
      if (!isCustomerApproved(customer)) {
        return NextResponse.json(
          { error: "This customer account is pending approval." },
          { status: 403 }
        );
      }
      targetUserId = onBehalfUserId;
    }

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
    const assignedToId = await resolveOrderAssigneeId();

    const order = await prisma.order.create({
      data: {
        orderNumber,
        userId: targetUserId,
        ...assignmentCreateFields(assignedToId),
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
      },
    });

    const customerLabel =
      order.user?.name?.trim() || order.user?.email || "Customer";
    await notifyStaffOfNewOrder(order.id, customerLabel, assignedToId);

    const signedImageUrl = order.orderImageUrl
      ? await getSignedOrderImageUrl(order.orderImageUrl)
      : null;

    return NextResponse.json(
      {
        order: {
          ...order,
          orderImageUrl: signedImageUrl,
          createdAt: order.createdAt.toISOString(),
          updatedAt: order.updatedAt.toISOString(),
        },
        message:
          session.role === "CUSTOMER"
            ? "Your prescription order has been placed. Our team will confirm pricing and delivery."
            : "Prescription order placed for the customer. Our team will confirm pricing and delivery.",
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/orders/rx error:", error);
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
