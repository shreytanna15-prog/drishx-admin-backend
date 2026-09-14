import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { getSession } from "../../../lib/session-auth";
import { buildEmployeeAuditScope } from "../../../lib/audit";

export async function GET(req: NextRequest) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (session.role === "CUSTOMER") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const entityType = req.nextUrl.searchParams.get("entityType");
  const entityId = req.nextUrl.searchParams.get("entityId");
  if (!entityType || !entityId) {
    return NextResponse.json(
      { error: "entityType and entityId are required." },
      { status: 400 }
    );
  }

  try {
    const scope =
      session.role === "ADMIN"
        ? {}
        : await buildEmployeeAuditScope({ role: session.role, userId: session.userId });

    const items = await prisma.auditEvent.findMany({
      where: {
        AND: [scope, { entityType, entityId }],
      },
      orderBy: { occurredAt: "asc" },
      take: 200,
    });

    return NextResponse.json({ items });
  } catch (error) {
    console.error("GET /api/audit/timeline", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
