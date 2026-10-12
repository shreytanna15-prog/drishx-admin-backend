import { NextRequest, NextResponse } from "next/server";

import { prisma } from "../../../lib/prisma";
import { getSessionOrUnauthorized } from "../../../lib/session-auth";
import { toSafeUser } from "../../../lib/user-public";

/**
 * Customer directory for staff.
 * - status=approved (default): approved customers
 * - status=rejected: rejected applications
 * - status=suspended: approved but inactive (suspended)
 */
export async function GET(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) {
    return auth.error;
  }
  const session = auth.session;
  if (session.role !== "ADMIN" && session.role !== "EMPLOYEE") {
    return NextResponse.json({ error: "Staff authorization required." }, { status: 403 });
  }

  try {
    const status = new URL(req.url).searchParams.get("status")?.trim().toLowerCase() || "approved";

    let where: {
      role: "CUSTOMER";
      isApproved?: boolean;
      approvalStatus?: "APPROVED" | "REJECTED";
      isActive?: boolean;
    } = { role: "CUSTOMER", isApproved: true };

    if (status === "rejected") {
      where = { role: "CUSTOMER", approvalStatus: "REJECTED" };
    } else if (status === "suspended") {
      where = {
        role: "CUSTOMER",
        approvalStatus: "APPROVED",
        isApproved: true,
        isActive: false,
      };
    } else {
      // approved (active + suspended both have isApproved; default list = all approved)
      where = { role: "CUSTOMER", isApproved: true, approvalStatus: "APPROVED" };
    }

    const customers = await prisma.user.findMany({
      where,
      orderBy: [
        { businessName: "asc" },
        { email: "asc" },
      ],
    });

    return NextResponse.json({
      customers: customers.map(toSafeUser),
      status,
    });
  } catch (error) {
    console.error("GET /api/users/customers error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
