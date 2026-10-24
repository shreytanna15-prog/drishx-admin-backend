import { NextRequest, NextResponse } from "next/server";

import {
  AuditAction,
  AuditModule,
  actorFromSession,
  buildAuditRequestContext,
  recordAuditEvent,
} from "../../../../lib/audit";
import { accountAccessErrorResponse } from "../../../../lib/account-access";
import { parseCustomerProfilePatch } from "../../../../lib/customer-profile-update";
import { prisma } from "../../../../lib/prisma";
import { getSessionOrUnauthorized } from "../../../../lib/session-auth";
import { toSafeUser } from "../../../../lib/user-public";

/**
 * Phase E — Customer self-update. Always flips to PENDING_REVIEW.
 * Admin updates use PATCH /api/users/customers/[id] (no pending flip).
 */
export async function PATCH(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) return auth.error;
  const session = auth.session;

  if (session.role !== "CUSTOMER") {
    return NextResponse.json(
      { error: "Only customers can update their own profile here." },
      { status: 403 }
    );
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      include: { staffRole: true, pricingTier: { select: { code: true } } },
    });
    if (!user || user.role !== "CUSTOMER") {
      return NextResponse.json({ error: "Customer not found." }, { status: 404 });
    }

    const accessDenied = accountAccessErrorResponse(user);
    if (accessDenied) return accessDenied;

    const body = (await req.json()) as Record<string, unknown>;
    const parsed = parseCustomerProfilePatch(body, user);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }

    const nextGst =
      typeof parsed.data.gstNumber === "string" ? parsed.data.gstNumber : null;
    if (nextGst) {
      const gstTaken = await prisma.user.findFirst({
        where: {
          gstNumber: nextGst,
          NOT: { id: user.id },
        },
        select: { id: true },
      });
      if (gstTaken) {
        return NextResponse.json(
          { error: "GST number is already registered." },
          { status: 409 }
        );
      }
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: parsed.data,
      include: { staffRole: true, pricingTier: { select: { code: true } } },
    });

    await recordAuditEvent(prisma, {
      action: AuditAction.CUSTOMER_PROFILE_RESUBMITTED,
      module: AuditModule.CUSTOMER,
      entityType: "User",
      entityId: user.id,
      actor: actorFromSession(session),
      request: buildAuditRequestContext(req),
      context: {
        fields: parsed.fieldsTouched,
        previousStatus: user.approvalStatus,
      },
      activityMessage: "Customer resubmitted profile for review",
    });

    return NextResponse.json({
      user: toSafeUser(updated),
      message:
        "Profile updated. Your account is pending admin approval again.",
    });
  } catch (error) {
    console.error("PATCH /api/users/me/profile error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
