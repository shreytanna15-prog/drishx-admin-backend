import { NextRequest, NextResponse } from "next/server";
import { getSession } from "../../../../../lib/session-auth";
import { prisma } from "../../../../../lib/prisma";
import { rejectAllAlternateSuggestions } from "../../../../../lib/alternate-power-workflow";

/** POST /api/orders/:id/alternate-suggestions/reject-all */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = getSession(req);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

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

    const result = await rejectAllAlternateSuggestions({
      orderId: id,
      actorUserId: session.userId,
    });

    return NextResponse.json({ rejectedCount: result.count });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal Server Error";
    console.error(
      "POST /api/orders/[id]/alternate-suggestions/reject-all error:",
      error
    );
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
