import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "@/app/lib/session-auth";
import { getLoyaltyDashboard } from "@/app/lib/loyalty/dashboard";
import { getLoyaltySettings } from "@/app/lib/loyalty/settings";

export async function GET(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) {
    return auth.error;
  }
  const session = auth.session;
  const customerId =
    session.role === "CUSTOMER"
      ? session.userId
      : new URL(req.url).searchParams.get("customerId")?.trim() || null;

  if (!customerId) {
    return NextResponse.json({ error: "customerId is required." }, { status: 400 });
  }

  if (session.role === "CUSTOMER" && customerId !== session.userId) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  if (session.role !== "CUSTOMER" && session.role !== "ADMIN" && session.role !== "EMPLOYEE") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const [dashboard, settings] = await Promise.all([
    getLoyaltyDashboard(customerId),
    getLoyaltySettings(),
  ]);

  return NextResponse.json({
    ...dashboard,
    enabled: settings.enabled,
    pointValue: Number(settings.pointValue) || 1,
    maxRedemptionPct: Number(settings.maxRedemptionPct) || 5,
    rupeeValue: dashboard.availablePoints * (Number(settings.pointValue) || 1),
  });
}
