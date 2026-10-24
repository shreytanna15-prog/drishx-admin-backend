import { NextRequest, NextResponse } from "next/server";

import {
  AuditAction,
  AuditModule,
  actorFromSession,
  buildAuditRequestContext,
  recordAuditEvent,
} from "../../../../lib/audit";
import {
  accountActionUpdateData,
  isAccountAction,
} from "../../../../lib/admin-customer-write";
import { prisma } from "../../../../lib/prisma";
import { getSessionOrUnauthorized } from "../../../../lib/session-auth";
import { toSafeUser } from "../../../../lib/user-public";

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * Admin commercial actions: BLOCKED | CREDIT_SUSPENDED | CLOSED | NONE.
 * CLOSED forces isActive=false. Ordering gates for BLOCKED/CREDIT_SUSPENDED land in Phase D.
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
    const body = (await req.json()) as { action?: unknown };
    const actionRaw = String(body.action ?? "").trim().toUpperCase();
    if (!isAccountAction(actionRaw)) {
      return NextResponse.json(
        {
          error:
            "action must be NONE, BLOCKED, CREDIT_SUSPENDED, or CLOSED.",
        },
        { status: 400 }
      );
    }

    const user = await prisma.user.findFirst({
      where: { id, role: "CUSTOMER" },
    });
    if (!user) {
      return NextResponse.json({ error: "Customer not found." }, { status: 404 });
    }

    const previous = user.accountAction;
    const data = accountActionUpdateData(actionRaw, user);
    const updated = await prisma.user.update({
      where: { id },
      data,
    });

    await recordAuditEvent(prisma, {
      action: AuditAction.CUSTOMER_ACCOUNT_ACTION,
      module: AuditModule.CUSTOMER,
      entityType: "User",
      entityId: id,
      actor: actorFromSession(session),
      request: buildAuditRequestContext(req),
      context: {
        previousAction: previous,
        nextAction: actionRaw,
        isActive: updated.isActive,
      },
      activityMessage: `Customer accountAction set to ${actionRaw}`,
    });

    return NextResponse.json({
      customer: toSafeUser(updated),
      message: `Account action set to ${actionRaw}.`,
    });
  } catch (error) {
    console.error("POST /api/users/[id]/account-action error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
