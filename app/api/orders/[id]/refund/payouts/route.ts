import { PaymentMode } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

import {
  AuditAction,
  AuditModule,
  actorFromSession,
  buildAuditRequestContext,
  recordAuditEvent,
} from "@/app/lib/audit";
import {
  getOrderRefundSummary,
  recordOrderRefundPayout,
} from "@/app/lib/finance/order-refund";
import { prisma } from "@/app/lib/prisma";
import { getSessionOrUnauthorized } from "@/app/lib/session-auth";

/** POST /api/orders/[id]/refund/payouts — record refund payout (admin). */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) return auth.error;
  const session = auth.session;
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin only." }, { status: 403 });
  }

  const { id: orderId } = await params;
  try {
    const body = (await req.json()) as {
      amount?: unknown;
      mode?: unknown;
      paidAt?: unknown;
      reference?: unknown;
      notes?: unknown;
    };

    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: "Valid amount is required." }, { status: 400 });
    }

    const modeRaw = String(body.mode ?? "").toUpperCase();
    if (!(modeRaw in PaymentMode)) {
      return NextResponse.json({ error: "Valid payment mode is required." }, { status: 400 });
    }
    const mode = PaymentMode[modeRaw as keyof typeof PaymentMode];

    const paidAt =
      typeof body.paidAt === "string" && body.paidAt.trim()
        ? new Date(body.paidAt)
        : new Date();
    if (Number.isNaN(paidAt.getTime())) {
      return NextResponse.json({ error: "Invalid paidAt." }, { status: 400 });
    }

    const result = await recordOrderRefundPayout({
      orderId,
      amount,
      mode,
      paidAt,
      reference: typeof body.reference === "string" ? body.reference : null,
      notes: typeof body.notes === "string" ? body.notes : null,
      recordedById: session.userId,
    });

    await recordAuditEvent(prisma, {
      action: AuditAction.ORDER_REFUND_PAYOUT,
      module: AuditModule.FINANCE,
      entityType: "Order",
      entityId: orderId,
      actor: actorFromSession(session),
      request: buildAuditRequestContext(req),
      context: {
        payoutId: result.payoutId,
        amount,
        mode,
        status: result.status,
        amountPaid: result.amountPaid,
      },
      activityMessage: `Recorded refund payout of ${amount}`,
    });

    const refund = await getOrderRefundSummary(orderId);
    return NextResponse.json({ refund, payoutId: result.payoutId });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to record payout.";
    if (
      /No refund|already fully|exceeds remaining|greater than zero|cancelled/i.test(
        message
      )
    ) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    console.error("POST /api/orders/[id]/refund/payouts error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
