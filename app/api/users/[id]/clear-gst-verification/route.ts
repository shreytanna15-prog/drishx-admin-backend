import { NextRequest, NextResponse } from "next/server";

import {
  AuditAction,
  AuditModule,
  actorFromSession,
  buildAuditRequestContext,
  recordAuditEvent,
} from "../../../../lib/audit";
import { clearGstVerificationData } from "../../../../lib/admin-customer-write";
import { prisma } from "../../../../lib/prisma";
import { getSessionOrUnauthorized } from "../../../../lib/session-auth";
import { toSafeUser } from "../../../../lib/user-public";

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * Admin-only — unlock GSTIN/PAN after ACTIVE verify (does not change tax IDs).
 */
export async function POST(req: NextRequest, context: RouteContext) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) {
    return auth.error;
  }
  const session = auth.session;
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin authorization required." }, { status: 403 });
  }

  try {
    const { id } = await context.params;
    const user = await prisma.user.findFirst({
      where: { id, role: "CUSTOMER" },
    });
    if (!user) {
      return NextResponse.json({ error: "Customer not found." }, { status: 404 });
    }

    if (user.gstinVerifyStatus === "UNKNOWN" && !user.gstinVerifiedAt) {
      return NextResponse.json({
        customer: toSafeUser(user),
        message: "GST verification already cleared.",
      });
    }

    const updated = await prisma.user.update({
      where: { id },
      data: clearGstVerificationData(),
      include: {
        pricingTier: { select: { code: true, discountPercent: true } },
      },
    });

    await recordAuditEvent(prisma, {
      action: AuditAction.GSTIN_VERIFICATION_CLEARED,
      module: AuditModule.CUSTOMER,
      entityType: "User",
      entityId: id,
      actor: actorFromSession(session),
      request: buildAuditRequestContext(req),
      context: {
        previousStatus: user.gstinVerifyStatus,
        gstNumber: user.gstNumber,
      },
      activityMessage: "GST verification cleared by admin",
    });

    return NextResponse.json({
      customer: toSafeUser(updated),
      message: "GST verification cleared. GSTIN and PAN can be edited.",
    });
  } catch (error) {
    console.error("POST /api/users/[id]/clear-gst-verification error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
