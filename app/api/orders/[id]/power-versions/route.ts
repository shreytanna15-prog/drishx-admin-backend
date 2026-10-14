import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "../../../../lib/session-auth";
import { prisma } from "../../../../lib/prisma";
import {
  listPowerVersions,
  serializePowerVersion,
} from "../../../../lib/alternate-power-workflow";
import { employeeMayAccessOrder } from "../../../../lib/prescription-order-hold";

/** GET /api/orders/:id/power-versions */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) {
    return auth.error;
  }
  const session = auth.session;
  try {
    const order = await prisma.order.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        assignedToId: true,
        warehouseHold: true,
        warehouseReleasedAt: true,
      },
    });
    if (!order) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }
    if (session.role === "CUSTOMER" && order.userId !== session.userId) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }
    if (
      session.role === "EMPLOYEE" &&
      !employeeMayAccessOrder(order, session.userId)
    ) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const versions = await listPowerVersions(id);
    return NextResponse.json({
      powerVersions: versions.map(serializePowerVersion),
    });
  } catch (error) {
    console.error("GET /api/orders/[id]/power-versions error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
