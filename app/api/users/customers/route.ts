import { NextRequest, NextResponse } from "next/server";

import { prisma } from "../../../lib/prisma";
import { getSessionOrUnauthorized } from "../../../lib/session-auth";
import { toSafeUser } from "../../../lib/user-public";

export async function GET(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) {
    return auth.error;
  }
  const session = auth.session;
  if ((session.role !== "ADMIN" && session.role !== "EMPLOYEE")) {
    return NextResponse.json({ error: "Staff authorization required." }, { status: 403 });
  }

  try {
    const customers = await prisma.user.findMany({
      where: {
        role: "CUSTOMER",
        isApproved: true,
      },
      orderBy: [
        { businessName: "asc" },
        { email: "asc" },
      ],
    });

    return NextResponse.json({ customers: customers.map(toSafeUser) });
  } catch (error) {
    console.error("GET /api/users/customers error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
