import { NextRequest, NextResponse } from "next/server";

import {
  AuditAction,
  AuditModule,
  actorFromSession,
  buildAuditRequestContext,
  recordAuditEvent,
} from "../../../../lib/audit";
import { prisma } from "../../../../lib/prisma";
import { getSessionOrUnauthorized } from "../../../../lib/session-auth";
import { toSafeUser } from "../../../../lib/user-public";

type RouteContext = {
  params: Promise<{ id: string }>;
};

/** RC-01 — Admin confirms address (no OTP). */
export async function POST(req: NextRequest, context: RouteContext) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) return auth.error;
  const session = auth.session;
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin authorization required." }, { status: 403 });
  }

  try {
    const { id } = await context.params;
    const existing = await prisma.user.findFirst({
      where: { id, role: "CUSTOMER" },
    });
    if (!existing) {
      return NextResponse.json({ error: "Customer not found." }, { status: 404 });
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { addressVerifiedAt: new Date() },
      include: {
        pricingTier: { select: { code: true, discountPercent: true } },
      },
    });

    await recordAuditEvent(prisma, {
      action: AuditAction.CUSTOMER_UPDATED,
      module: AuditModule.CUSTOMER,
      entityType: "User",
      entityId: id,
      actor: actorFromSession(session),
      request: buildAuditRequestContext(req),
      reasonText: "Admin verified customer address",
      changes: [
        {
          field: "Address verified",
          before: existing.addressVerifiedAt
            ? existing.addressVerifiedAt.toISOString()
            : null,
          after: updated.addressVerifiedAt?.toISOString() ?? null,
        },
      ],
      context: { addressVerified: true },
      activityMessage: "Customer address verified by admin",
    });

    return NextResponse.json({
      customer: toSafeUser(updated),
      message: "Address verified.",
    });
  } catch (error) {
    console.error("POST /api/users/[id]/verify-address error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
