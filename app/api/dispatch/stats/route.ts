import { NextRequest, NextResponse } from "next/server";
import { getSession } from "../../../lib/session-auth";
import { prisma } from "../../../lib/prisma";

const MAX_DAYS = 365;
const DEFAULT_DAYS = 30;

// ─────────────────────────────────────────────────────────────
// GET /api/dispatch/stats?days=30
// Per-courier financial summary over dispatched deliveries.
// Admin only. Reads OrderDelivery (delivery money) — not invoices.
// ─────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const session = getSession(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden. Admin only." }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const rawDays = Number(searchParams.get("days"));
    const days = Number.isFinite(rawDays)
      ? Math.min(Math.max(1, Math.floor(rawDays)), MAX_DAYS)
      : DEFAULT_DAYS;
    const since = new Date(Date.now() - days * 86_400_000);

    const deliveries = await prisma.orderDelivery.findMany({
      where: { createdAt: { gte: since } },
      include: { deliveryService: true },
      orderBy: { createdAt: "desc" },
    });

    const byCompany = new Map<
      string,
      {
        courierCompany: string;
        orders: number;
        totalCustomerCharge: number;
        totalInternalCost: number;
        margin: number;
      }
    >();

    for (const d of deliveries) {
      const company = d.deliveryService?.courierCompany || "Unknown courier";
      const bucket = byCompany.get(company) ?? {
        courierCompany: company,
        orders: 0,
        totalCustomerCharge: 0,
        totalInternalCost: 0,
        margin: 0,
      };
      bucket.orders += 1;
      bucket.totalCustomerCharge += Number(d.customerCharge ?? 0);
      bucket.totalInternalCost += Number(d.internalCost ?? 0);
      bucket.margin += Number(d.margin ?? 0);
      byCompany.set(company, bucket);
    }

    const stats = Array.from(byCompany.values()).sort(
      (a, b) => b.totalCustomerCharge - a.totalCustomerCharge
    );

    const totals = stats.reduce(
      (acc, s) => ({
        orders: acc.orders + s.orders,
        totalCustomerCharge: acc.totalCustomerCharge + s.totalCustomerCharge,
        totalInternalCost: acc.totalInternalCost + s.totalInternalCost,
        margin: acc.margin + s.margin,
      }),
      { orders: 0, totalCustomerCharge: 0, totalInternalCost: 0, margin: 0 }
    );

    return NextResponse.json({ days, stats, totals });
  } catch (error) {
    console.error("GET /api/dispatch/stats error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}