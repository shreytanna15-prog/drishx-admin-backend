import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/app/lib/session-auth";
import { prisma } from "@/app/lib/prisma";
import {
  getLoyaltySettings,
  updateLoyaltySettings,
} from "@/app/lib/loyalty/settings";
import { AuditAction, AuditModule, recordAuditEvent } from "@/app/lib/audit";

export async function GET(req: NextRequest) {
  const session = getSession(req);
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const settings = await getLoyaltySettings();
  return NextResponse.json(settings);
}

export async function PUT(req: NextRequest) {
  const session = getSession(req);
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const body = await req.json();
  const settings = await updateLoyaltySettings({
    enabled: body.enabled,
    pointValue: body.pointValue,
    baseRatePct: body.baseRatePct,
    advanceBonusPct: body.advanceBonusPct,
    fullPaymentRatePct: body.fullPaymentRatePct,
    minMarginPct: body.minMarginPct,
    maxRedemptionPct: body.maxRedemptionPct,
    expiryDays: body.expiryDays,
    minInvoiceValue: body.minInvoiceValue,
    maxPointsPerInvoice: body.maxPointsPerInvoice,
    freightEligible: body.freightEligible,
  });

  await recordAuditEvent(prisma, {
    action: AuditAction.LOYALTY_SETTINGS_UPDATED,
    module: AuditModule.LOYALTY,
    entityType: "LoyaltySettings",
    entityId: "default",
    actor: {
      actorType: "HUMAN",
      actorUserId: session.userId,
      actorName: null,
    },
    message: "Loyalty settings updated",
  }).catch(() => undefined);

  return NextResponse.json(settings);
}
