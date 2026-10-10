import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "../../../../../../lib/session-auth";
import { prisma } from "../../../../../../lib/prisma";
import {
  rejectAlternateSuggestion,
  serializeAlternateSuggestion,
} from "../../../../../../lib/alternate-power-workflow";

/** POST /api/orders/:id/alternate-suggestions/:suggestionId/reject */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; suggestionId: string }> }
) {
  const { id, suggestionId } = await params;
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) {
    return auth.error;
  }
  const session = auth.session;
  try {
    const order = await prisma.order.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });
    if (!order) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }
    if (session.role !== "CUSTOMER" || order.userId !== session.userId) {
      return NextResponse.json(
        { error: "Only the customer can accept or reject alternate powers." },
        { status: 403 }
      );
    }

    const suggestion = await rejectAlternateSuggestion({
      orderId: id,
      suggestionId,
      actorUserId: session.userId,
    });

    return NextResponse.json({
      suggestion: serializeAlternateSuggestion(suggestion),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal Server Error";
    console.error(
      "POST /api/orders/[id]/alternate-suggestions/[suggestionId]/reject error:",
      error
    );
    return NextResponse.json(
      { error: message },
      { status: message.includes("not found") || message.includes("pending") ? 400 : 500 }
    );
  }
}
