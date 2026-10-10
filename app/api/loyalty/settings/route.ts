import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "@/app/lib/session-auth";
import { prisma } from "@/app/lib/prisma";
import {
  getLoyaltySettings,
  updateLoyaltySettings,
} from "@/app/lib/loyalty/settings";
import { AuditAction, AuditModule, recordAuditEvent } from "@/app/lib/audit";

export async function GET(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) {
    return auth.error;
  }
  const session = auth.session;
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  const settings = await getLoyaltySettings();
  return NextResponse.json(settings);
}

export async function PUT(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) {
    return auth.error;
  }
  const session = auth.session;
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
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
