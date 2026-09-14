import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { getSession } from "../../../lib/session-auth";
import { toSafeUser } from "../../../lib/user-public";

export async function GET(req: NextRequest) {
  const session = getSession(req);
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin authorization required." }, { status: 403 });
  }

  try {
    const users = await prisma.user.findMany({
      where: {
        role: "CUSTOMER",
        approvalStatus: "PENDING_REVIEW",
        gstNumber: { not: null },
      },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json({ users: users.map(toSafeUser) });
  } catch (error) {
    console.error("GET /api/users/pending error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
