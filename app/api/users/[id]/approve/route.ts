import { NextRequest, NextResponse } from "next/server";
import { prisma } from "../../../../lib/prisma";
import { getSessionOrUnauthorized } from "../../../../lib/session-auth";
import { toSafeUser } from "../../../../lib/user-public";
import {
  AuditAction,
  AuditModule,
  actorFromSession,
  buildAuditRequestContext,
  recordAuditEvent,
} from "../../../../lib/audit";
import { getBasePricingTier } from "../../../../lib/finance/pricing-tier";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type StatusAction = "approve" | "reject" | "reopen" | "suspend" | "activate";

const ACTIONS = new Set<StatusAction>([
  "approve",
  "reject",
  "reopen",
  "suspend",
  "activate",
]);

export async function PUT(req: NextRequest, context: RouteContext) {
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
    const body = await req.json();
    const action = String(body.action ?? "").trim().toLowerCase() as StatusAction;
    const rejectionReason = body.rejectionReason
      ? String(body.rejectionReason).trim()
      : null;

    if (!ACTIONS.has(action)) {
      return NextResponse.json(
        {
          error:
            "action must be approve, reject, reopen, suspend, or activate.",
        },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user || user.role !== "CUSTOMER") {
      return NextResponse.json({ error: "Customer account not found." }, { status: 404 });
    }

    if (action === "approve") {
      if (!user.gstNumber) {
        return NextResponse.json(
          {
            error:
              "Customer has not submitted GST details yet. Incomplete signups cannot be approved.",
          },
          { status: 400 }
        );
      }
    }

    if (action === "reject" && !rejectionReason) {
      return NextResponse.json(
        { error: "rejectionReason is required when rejecting." },
        { status: 400 }
      );
    }

    if (action === "suspend" && user.approvalStatus !== "APPROVED") {
      return NextResponse.json(
        { error: "Only approved customers can be suspended." },
        { status: 400 }
      );
    }

    if (action === "activate") {
      if (user.approvalStatus !== "APPROVED" || user.isActive) {
        return NextResponse.json(
          { error: "Only suspended approved customers can be reactivated." },
          { status: 400 }
        );
      }
      if (user.accountAction === "CLOSED") {
        return NextResponse.json(
          {
            error:
              "This account is closed. Clear account action before reactivating.",
          },
          { status: 400 }
        );
      }
    }

    if (action === "reopen") {
      if (
        user.approvalStatus !== "APPROVED" &&
        user.approvalStatus !== "REJECTED"
      ) {
        return NextResponse.json(
          { error: "Only approved or rejected customers can be reopened to pending." },
          { status: 400 }
        );
      }
    }

    const now = new Date();
    let defaultTierId: string | null = null;
    if (action === "approve" && !user.pricingTierId) {
      defaultTierId = (await getBasePricingTier()).id;
    }
    const data =
      action === "approve"
        ? {
            approvalStatus: "APPROVED" as const,
            isApproved: true,
            isActive: true,
            approvedAt: now,
            approvedById: session.userId,
            rejectionReason: null,
            // RC-01 Option A: address verified immediately on onboarding approve
            addressVerifiedAt: now,
            ...(defaultTierId ? { pricingTierId: defaultTierId } : {}),
          }
        : action === "reject"
          ? {
              approvalStatus: "REJECTED" as const,
              isApproved: false,
              isActive: false,
              approvedAt: null,
              approvedById: session.userId,
              rejectionReason: rejectionReason,
            }
          : action === "reopen"
            ? {
                approvalStatus: "PENDING_REVIEW" as const,
                isApproved: false,
                isActive: true,
                approvedAt: null,
                approvedById: null,
                rejectionReason: null,
              }
            : action === "suspend"
              ? {
                  isActive: false,
                }
              : {
                  // activate — commercial CLOSED is blocked above
                  isActive: true,
                };

    const updated = await prisma.user.update({
      where: { id },
      data,
    });

    const auditCtx = buildAuditRequestContext(req);
    const auditAction =
      action === "approve" || action === "reopen" || action === "activate"
        ? AuditAction.CUSTOMER_APPROVED
        : AuditAction.CUSTOMER_REJECTED;

    const activityMessage =
      action === "approve"
        ? "Customer account approved"
        : action === "reject"
          ? "Customer account rejected"
          : action === "reopen"
            ? "Customer reopened to pending review"
            : action === "suspend"
              ? "Customer account suspended"
              : "Customer account reactivated";

    await recordAuditEvent(prisma, {
      action: auditAction,
      module: AuditModule.CUSTOMER,
      entityType: "User",
      entityId: id,
      actor: actorFromSession(session),
      request: auditCtx,
      reasonText: rejectionReason,
      context: {
        email: user.email,
        gstNumber: user.gstNumber,
        statusAction: action,
        previousStatus: user.approvalStatus,
        previousActive: user.isActive,
      },
      activityMessage,
    });

    const messages: Record<StatusAction, string> = {
      approve: "Customer approved.",
      reject: "Customer rejected.",
      reopen: "Customer reopened to pending review.",
      suspend: "Customer suspended.",
      activate: "Customer reactivated.",
    };

    return NextResponse.json({
      user: toSafeUser(updated),
      message: messages[action],
    });
  } catch (error) {
    console.error("PUT /api/users/[id]/approve error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
