import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { getSessionOrUnauthorized } from "../../../lib/session-auth";
import { buildEmployeeAuditScope } from "../../../lib/audit";
import { buildAuditListWhere } from "../../../lib/audit-query";

export async function GET(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) return auth.error;
  const session = auth.session;
  if (session.role === "CUSTOMER") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    const scope =
      session.role === "ADMIN"
        ? {}
        : await buildEmployeeAuditScope({ role: session.role, userId: session.userId });

    const params = req.nextUrl.searchParams;
    const page = Math.max(1, Number(params.get("page") ?? 1));
    const limit = Math.min(100, Math.max(1, Number(params.get("limit") ?? 25)));
    const skip = (page - 1) * limit;

    const where = buildAuditListWhere(params, scope);

    const [items, total] = await Promise.all([
      prisma.auditEvent.findMany({
        where,
        orderBy: { occurredAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.auditEvent.count({ where }),
    ]);

    return NextResponse.json({ items, total, page, limit });
  } catch (error) {
    console.error("GET /api/audit/events", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
