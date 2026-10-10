import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "@/app/lib/session-auth";
import { prisma } from "@/app/lib/prisma";
import { adjustPoints } from "@/app/lib/loyalty/adjust";
import { AuditAction, AuditModule, recordAuditEvent } from "@/app/lib/audit";

export async function POST(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) {
    return auth.error;
  }
  const session = auth.session;
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const body = await req.json();
  const customerId =
    typeof body.customerId === "string" ? body.customerId.trim() : "";
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  const points = Number(body.points);

  if (!customerId) {
    return NextResponse.json({ error: "customerId is required." }, { status: 400 });
  }
  if (!reason) {
    return NextResponse.json({ error: "A reason is required." }, { status: 400 });
  }
  if (!Number.isFinite(points) || points === 0) {
    return NextResponse.json({ error: "points must be a non-zero number." }, { status: 400 });
  }

  try {
    const adjusted = await adjustPoints({
      customerId,
      points,
      reason,
      createdById: session.userId,
    });

    await recordAuditEvent(prisma, {
      action: AuditAction.LOYALTY_POINTS_ADJUSTED,
      module: AuditModule.LOYALTY,
      entityType: "LoyaltyWallet",
      entityId: customerId,
      actor: {
        actorType: "HUMAN",
        actorUserId: session.userId,
        actorName: null,
      },
      message: `Manual loyalty adjustment: ${adjusted > 0 ? "+" : ""}${adjusted} points`,
      context: { reason, points: adjusted },
    }).catch(() => undefined);

    return NextResponse.json({ success: true, adjusted });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Adjustment failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
