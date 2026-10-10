import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "../../../../lib/session-auth";
import { prisma } from "../../../../lib/prisma";
import { buildDispatchOverrideStamp } from "../../../../lib/dispatch-cutoff";
import { logOrderActivity } from "../../../../lib/order-activity";
import {
  AuditAction,
  AuditModule,
  actorFromSession,
  buildAuditRequestContext,
  recordAuditEvent,
} from "../../../../lib/audit";
import {
  orderDetailInclude,
  serializeOrderDetail,
} from "../../../../lib/order-detail";

function parseReason(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 500);
}

// ─────────────────────────────────────────────────────────────
// POST /api/orders/:id/dispatch-override
// Super admin manually moves a deferred (after-cutoff) order into today's
// courier flow. Bypasses the dispatch gate for this order only.
// ─────────────────────────────────────────────────────────────
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let id: string;
  try {
    ({ id } = await params);
  } catch {
    return NextResponse.json({ error: "Invalid order id." }, { status: 400 });
  }

  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) return auth.error;
  const session = auth.session;
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden. Admins only." }, { status: 403 });
  }

  try {
    const order = await prisma.order.findUnique({
      where: { id },
      include: orderDetailInclude,
    });
    if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });

    const body = await req.json().catch(() => null);
    const reason = parseReason(body?.reason);
    if (!reason) {
      return NextResponse.json(
        { error: "A reason is required to move an order past the dispatch cutoff." },
        { status: 400 }
      );
    }

    if (order.status === "COMPLETED" || order.status === "CANCELLED") {
      return NextResponse.json(
        { error: "A completed or cancelled order cannot be moved forward." },
        { status: 400 }
      );
    }
    if (order.dispatchOverrideStamp) {
      return NextResponse.json(
        { order: await serializeOrderDetail(order, session.role) },
        { status: 200 }
      );
    }

    const auditCtx = buildAuditRequestContext(req);
    const dispatchOverrideStamp = buildDispatchOverrideStamp(session.userId, reason);

    await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id },
        data: { dispatchOverrideStamp },
      });
      await logOrderActivity(tx, {
        orderId: id,
        actorUserId: session.userId,
        action: "DISPATCH_OVERRIDDEN",
        message: `Order moved forward past the dispatch cutoff by admin. Reason: ${reason}`,
        metadata: {
          dispatchDate: order.dispatchDate?.toISOString() ?? null,
          cutoffDeferred: order.cutoffDeferred,
          reason,
        },
      });
    });

    await recordAuditEvent(prisma, {
      action: AuditAction.ORDER_DISPATCH_OVERRIDDEN,
      module: AuditModule.ORDER,
      entityType: "Order",
      entityId: order.id,
      actor: actorFromSession(session),
      request: auditCtx,
      changes: [{ field: "dispatchOverrideStamp", before: null, after: reason }],
      context: {
        orderNumber: order.orderNumber,
        dispatchDate: order.dispatchDate?.toISOString() ?? null,
      },
      activityMessage: `Order #${order.id.slice(-8).toUpperCase()} moved forward past the dispatch cutoff. Reason: ${reason}`,
    });

    const full = await prisma.order.findUnique({
      where: { id },
      include: orderDetailInclude,
    });
    if (!full) return NextResponse.json({ order: null, duplicateWarning: null }, { status: 200 });
    return NextResponse.json({
      order: await serializeOrderDetail(full, session.role),
      duplicateWarning: null,
    });
  } catch (error) {
    console.error("POST /api/orders/[id]/dispatch-override error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}