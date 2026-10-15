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
    const searchParams = new URL(req.url).searchParams;
    const status = searchParams.get("status")?.trim().toLowerCase() || "approved";
    const activeOnly = searchParams.get("activeOnly") === "1" || searchParams.get("activeOnly") === "true";
    const q = searchParams.get("q")?.trim().toLowerCase() || "";

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
      if (activeOnly) {
        where.isActive = true;
      }
    }

    const customers = await prisma.user.findMany({
      where,
      orderBy: [
        { businessName: "asc" },
        { email: "asc" },
      ],
    });

    const filtered = q
      ? customers.filter((c) => {
          const hay = [
            c.name,
            c.businessName,
            c.shopName,
            c.email,
            c.mobileNumber,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return hay.includes(q);
        })
      : customers;

    return NextResponse.json({
      customers: filtered.map(toSafeUser),
      status,
      activeOnly,
    });
  } catch (error) {
    console.error("GET /api/users/customers error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
