import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { getSession } from "../../../lib/session-auth";

export async function GET(req: NextRequest) {
  const session = getSession(req);
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const params = req.nextUrl.searchParams;
  const page = Math.max(1, Number(params.get("page") ?? 1));
  const limit = Math.min(100, Math.max(1, Number(params.get("limit") ?? 25)));
  const skip = (page - 1) * limit;

  const where: Record<string, unknown> = {};
  const action = params.get("action");
  if (action) where.action = action;

  try {
    const [items, total] = await Promise.all([
      prisma.securityEvent.findMany({
        where,
        orderBy: { occurredAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.securityEvent.count({ where }),
    ]);
    return NextResponse.json({ items, total, page, limit });
  } catch (error) {
    console.error("GET /api/audit/security", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
