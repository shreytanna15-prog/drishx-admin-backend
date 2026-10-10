import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../lib/prisma";
import { getSessionOrUnauthorized } from "../../../lib/session-auth";

export async function GET(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) {
    return auth.error;
  }
  const session = auth.session;
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const page = Math.max(1, Number(req.nextUrl.searchParams.get("page") ?? 1));
  const limit = Math.min(100, Math.max(1, Number(req.nextUrl.searchParams.get("limit") ?? 25)));
  const skip = (page - 1) * limit;

  try {
    const [items, total] = await Promise.all([
      prisma.systemErrorLog.findMany({
        orderBy: { occurredAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.systemErrorLog.count(),
    ]);
    return NextResponse.json({ items, total, page, limit });
  } catch (error) {
    console.error("GET /api/audit/errors", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
