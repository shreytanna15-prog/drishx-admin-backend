import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/app/lib/session-auth";
import { validateRedemption } from "@/app/lib/loyalty/redeem";
import { getLoyaltySettings } from "@/app/lib/loyalty/settings";
import { roundMoney } from "@/app/lib/finance/tax-calc";

export async function GET(req: NextRequest) {
  const session = getSession(req);
  if (!session || session.role !== "CUSTOMER") {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
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
