import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "@/app/lib/session-auth";
import { actorFromSession, buildAuditRequestContext } from "@/app/lib/audit";
import {
  releaseOrderToWarehouse,
  WarehouseReleaseError,
} from "@/app/lib/warehouse-release";
import {
  orderDetailInclude,
  serializeOrderDetail,
} from "@/app/lib/order-detail";
import { prisma } from "@/app/lib/prisma";

/**
 * POST /api/orders/:id/warehouse-release
 * Admin-only: mark RX hold order available at warehouse.
 * Assignment alone does not release; this action does (idempotent).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) return auth.error;
  if (auth.session.role !== "ADMIN") {
    return NextResponse.json(
      { error: "Only admins can release orders to the warehouse." },
      { status: 403 }
    );
  }

  try {
    const { id } = await params;
    await releaseOrderToWarehouse({
      orderId: id,
      actor: actorFromSession(auth.session),
      request: buildAuditRequestContext(req),
    });
    const order = await prisma.order.findUnique({
      where: { id },
      include: orderDetailInclude,
    });
    if (!order) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }
    return NextResponse.json({
      order: await serializeOrderDetail(order, auth.session.role),
      message: "Order released to warehouse.",
    });
  } catch (error) {
    if (error instanceof WarehouseReleaseError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error("POST /api/orders/[id]/warehouse-release error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
