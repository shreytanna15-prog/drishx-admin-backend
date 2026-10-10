import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "@/app/lib/session-auth";
import { validateRedemption } from "@/app/lib/loyalty/redeem";
import { getLoyaltySettings } from "@/app/lib/loyalty/settings";
import { roundMoney } from "@/app/lib/finance/tax-calc";

export async function GET(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) {
    return auth.error;
  }
  const session = auth.session;
  if (session.role !== "CUSTOMER") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const orderGross = roundMoney(Number(searchParams.get("orderGross")) || 0);
  const settings = await getLoyaltySettings();

  if (!settings.enabled || orderGross <= 0) {
    return NextResponse.json({
      enabled: settings.enabled,
      maxAllowed: 0,
      availablePoints: 0,
    });
  }

  const { maxAllowed } = await validateRedemption({
    customerId: session.userId,
    points: orderGross,
    orderTaxable: orderGross,
  });

  return NextResponse.json({
    enabled: true,
    maxAllowed,
    maxRedemptionPct: Number(settings.maxRedemptionPct) || 5,
    pointValue: Number(settings.pointValue) || 1,
  });
}
