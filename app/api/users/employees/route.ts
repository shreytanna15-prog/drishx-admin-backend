import { NextRequest, NextResponse } from "next/server";

import { prisma } from "../../../lib/prisma";
import { getSession } from "../../../lib/session-auth";
import { toSafeUser } from "../../../lib/user-public";

export async function GET(req: NextRequest) {
  const session = getSession(req);
  if (!session || (session.role !== "ADMIN" && session.role !== "EMPLOYEE")) {
    return NextResponse.json({ error: "Staff authorization required." }, { status: 403 });
  }

  try {
    const employees = await prisma.user.findMany({
      where: {
        role: "EMPLOYEE",
      },
      include: { staffRole: true },
      orderBy: [
        { name: "asc" },
        { email: "asc" },
      ],
    });

    return NextResponse.json({ employees: employees.map(toSafeUser) });
  } catch (error) {
    console.error("GET /api/users/employees error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
