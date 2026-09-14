import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getSession } from "../../../../lib/session-auth";
import { toSafeUser } from "../../../../lib/user-public";
import {
  AuditAction,
  AuditModule,
  actorFromSession,
  buildAuditRequestContext,
  recordAuditEvent,
} from "../../../../lib/audit";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PUT(req: NextRequest, context: RouteContext) {
  const session = getSession(req);
  if (!session || session.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin authorization required." }, { status: 403 });
  }

  try {
    const { id } = await context.params;
    const body = await req.json();
    const action = String(body.action ?? "").trim().toLowerCase();
    const rejectionReason = body.rejectionReason ? String(body.rejectionReason).trim() : null;

    if (action !== "approve" && action !== "reject") {
      return NextResponse.json({ error: "action must be approve or reject." }, { status: 400 });
    }

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user || user.role !== "CUSTOMER") {
      return NextResponse.json({ error: "Customer account not found." }, { status: 404 });
    }

    if (!user.gstNumber) {
      return NextResponse.json({ error: "Customer has not submitted GST details yet." }, { status: 400 });
    }

    if (action === "reject" && !rejectionReason) {
      return NextResponse.json({ error: "rejectionReason is required when rejecting." }, { status: 400 });
    }

    const updated = await prisma.user.update({
      where: { id },
      data:
        action === "approve"
          ? {
              approvalStatus: "APPROVED",
              isApproved: true,
              isActive: true,
              approvedAt: new Date(),
              approvedById: session.userId,
              rejectionReason: null,
            }
          : {
              approvalStatus: "REJECTED",
              isApproved: false,
              isActive: false,
              approvedAt: null,
              approvedById: session.userId,
              rejectionReason: rejectionReason,
            },
    });

    const auditCtx = buildAuditRequestContext(req);
    await recordAuditEvent(prisma, {
      action:
        action === "approve"
          ? AuditAction.CUSTOMER_APPROVED
          : AuditAction.CUSTOMER_REJECTED,
      module: AuditModule.CUSTOMER,
      entityType: "User",
      entityId: id,
      actor: actorFromSession(session),
      request: auditCtx,
      reasonText: rejectionReason,
      context: { email: user.email, gstNumber: user.gstNumber },
      activityMessage:
        action === "approve" ? "Customer account approved" : "Customer account rejected",
    });

    return NextResponse.json({
      user: toSafeUser(updated),
      message: action === "approve" ? "Customer approved." : "Customer rejected.",
    });
  } catch (error) {
    console.error("PUT /api/users/[id]/approve error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
