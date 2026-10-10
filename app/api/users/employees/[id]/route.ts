import { NextRequest, NextResponse } from "next/server";

import { prisma } from "../../../../lib/prisma";
import { getSessionOrUnauthorized } from "../../../../lib/session-auth";
import { toSafeUser } from "../../../../lib/user-public";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(req: NextRequest, context: RouteContext) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) {
    return auth.error;
  }
  const session = auth.session;
  if ((session.role !== "ADMIN" && session.role !== "EMPLOYEE")) {
    return NextResponse.json({ error: "Staff authorization required." }, { status: 403 });
  }

  try {
    const { id } = await context.params;
    const employee = await prisma.user.findFirst({
      where: {
        id,
        role: "EMPLOYEE",
      },
      include: { staffRole: true },
    });

    if (!employee) {
      return NextResponse.json({ error: "Employee not found." }, { status: 404 });
    }

    return NextResponse.json({ employee: toSafeUser(employee) });
  } catch (error) {
    console.error("GET /api/users/employees/[id] error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
