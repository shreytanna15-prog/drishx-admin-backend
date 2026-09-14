import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getSession } from "../../../../lib/session-auth";
import { buildEmployeeAuditScope } from "../../../../lib/audit";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = getSession(req);
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (session.role === "CUSTOMER") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { id } = await params;

  try {
    const event = await prisma.auditEvent.findUnique({ where: { id } });
    if (!event) return NextResponse.json({ error: "Not found." }, { status: 404 });

    if (session.role !== "ADMIN") {
      const scope = await buildEmployeeAuditScope({
        role: session.role,
        userId: session.userId,
      });
      const allowed = await prisma.auditEvent.count({
        where: { AND: [{ id }, scope] },
      });
      if (!allowed) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    return NextResponse.json(event);
  } catch (error) {
    console.error("GET /api/audit/events/[id]", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
