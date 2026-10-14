import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "../../../lib/session-auth";
import { prisma } from "../../../lib/prisma";
import { requireStaffPermission } from "../../../lib/staff-access";
import {
  serializeOrderPrescription,
  serializeWholesaleLineItem,
} from "../../../lib/serialize-order";
import { sanitizeOrderForRole } from "../../../lib/order-activity";
import { serializeDeliveryService } from "../../../lib/delivery-service";
import { serializeDeliveryForRole } from "../../../lib/delivery-pack";
import { getSignedOrderImageUrl } from "../../../lib/supabase-storage";
import { employeeOrdersWhere } from "../../../lib/prescription-order-hold";

// ─────────────────────────────────────────────────────────────
// GET /api/dispatch/pending
// Orders packed and waiting to be handed to a courier (no courier
// + tracking recorded yet). EMPLOYEE sees assigned orders only.
// ─────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) {
    return auth.error;
  }
  const session = auth.session;
  if (session.role === "CUSTOMER") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  if (session.role === "EMPLOYEE") {
    const gate = await requireStaffPermission(session, "orders.dispatch");
    if ("error" in gate) return gate.error;
  }

  try {
    const staffScope =
      session.role === "EMPLOYEE"
        ? employeeOrdersWhere(session.userId)
        : {};

    const orders = await prisma.order.findMany({
      where: {
        AND: [
          staffScope,
          {
            status: "PACKED",
            OR: [{ courierName: null }, { trackingNumber: null }],
          },
        ],
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            businessName: true,
          },
        },
        assignedTo: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
        singleVisionLens: true,
        kryptokLens: true,
        progressiveLens: true,
        wholesaleLineItems: {
          orderBy: { createdAt: "asc" },
        },
        deliveryService: true,
        delivery: true,
        powerVersions: {
          orderBy: { versionNumber: "asc" },
          select: {
            id: true,
            versionNumber: true,
            status: true,
            source: true,
            sph: true,
            cyl: true,
            isFinalFulfilled: true,
          },
        },
      },
      orderBy: { updatedAt: "asc" },
    });

    const serialized = [];
    for (const order of orders) {
      const o = order as unknown as Record<string, unknown> & {
        deliveryService?: Parameters<typeof serializeDeliveryService>[0] | null;
        delivery?: Record<string, unknown> | null;
      };
      serialized.push(
        sanitizeOrderForRole(
          {
            ...order,
            ...serializeOrderPrescription(order),
            deliveryService: o.deliveryService
              ? serializeDeliveryService(o.deliveryService)
              : null,
            delivery: serializeDeliveryForRole(o.delivery ?? null, session.role),
            wholesaleLineItems: order.wholesaleLineItems.map(serializeWholesaleLineItem),
            orderImageUrl: order.orderImageUrl
              ? await getSignedOrderImageUrl(order.orderImageUrl)
              : null,
            createdAt: order.createdAt.toISOString(),
            updatedAt: order.updatedAt.toISOString(),
            assignedAt: order.assignedAt?.toISOString() ?? null,
            dispatchDate: order.dispatchDate?.toISOString() ?? null,
            cutoffDeferred: order.cutoffDeferred ?? false,
            dispatchOverridden: Boolean(order.dispatchOverrideStamp),
          },
          session.role
        )
      );
    }

    return NextResponse.json({ orders: serialized });
  } catch (error) {
    console.error("GET /api/dispatch/pending error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}