import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "@/app/lib/session-auth";
import { requireStaffPermission } from "@/app/lib/staff-access";
import {
  buildCustomerOrdersOverview,
  buildStaffOrdersOverview,
} from "@/app/lib/orders-overview";

/**
 * GET /api/orders/overview — role-scoped dashboard aggregates (RW-11 Phase D).
 * CUSTOMER: lifetime status counts, day-over-day trends, last order, top products.
 * EMPLOYEE: today's order/task counts + pending previews (assigned + hold rules).
 * ADMIN: same staff shape for the acting admin user when used as operator.
 */
export async function GET(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) {
    return auth.error;
  }
  const session = auth.session;

  try {
    if (session.role === "CUSTOMER") {
      const overview = await buildCustomerOrdersOverview(session.userId);
      return NextResponse.json(overview);
    }

    if (session.role === "EMPLOYEE") {
      const gate = await requireStaffPermission(session, [
        "orders.view",
        "orders.fulfill",
        "orders.rx",
        "orders.dispatch",
        "orders.create_on_behalf",
      ]);
      if ("error" in gate) return gate.error;
      const overview = await buildStaffOrdersOverview(session.userId);
      return NextResponse.json(overview);
    }

    if (session.role === "ADMIN") {
      const overview = await buildStaffOrdersOverview(session.userId);
      return NextResponse.json({ ...overview, role: "ADMIN" as const });
    }

    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  } catch (error) {
    console.error("GET /api/orders/overview error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
