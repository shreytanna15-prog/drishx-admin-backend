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

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  try {
    const [
      todayTotal,
      highRiskToday,
      stockAdjustmentsToday,
      financeToday,
      failedSecurityToday,
    ] = await Promise.all([
      prisma.auditEvent.count({ where: { occurredAt: { gte: startOfDay } } }),
      prisma.auditEvent.count({
        where: { occurredAt: { gte: startOfDay }, isHighRisk: true },
      }),
      prisma.auditEvent.count({
        where: {
          occurredAt: { gte: startOfDay },
          action: { in: ["STOCK_ADJUSTED", "STOCK_DECREMENTED", "STOCK_INCREMENTED"] },
        },
      }),
      prisma.auditEvent.count({
        where: {
          occurredAt: { gte: startOfDay },
          module: "FINANCE",
        },
      }),
      prisma.securityEvent.count({
        where: {
          occurredAt: { gte: startOfDay },
          result: "FAILURE",
        },
      }),
    ]);

    return NextResponse.json({
      todayTotal,
      highRiskToday,
      stockAdjustmentsToday,
      financeToday,
      failedSecurityToday,
    });
  } catch (error) {
    console.error("GET /api/audit/overview", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
