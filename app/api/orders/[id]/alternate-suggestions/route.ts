import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "../../../../lib/session-auth";
import { prisma } from "../../../../lib/prisma";
import {
  listAlternateSuggestions,
  serializeAlternateSuggestion,
} from "../../../../lib/alternate-power-workflow";

/** GET /api/orders/:id/alternate-suggestions */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) {
    return auth.error;
  }
  const session = auth.session;
  try {
    const order = await prisma.order.findUnique({
      where: { id },
      select: { id: true, userId: true, assignedToId: true },
    });
    if (!order) {
      return NextResponse.json({ error: "Order not found." }, { status: 404 });
    }

    if (session.role === "CUSTOMER" && order.userId !== session.userId) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }
    if (
      session.role === "EMPLOYEE" &&
      order.assignedToId &&
      order.assignedToId !== session.userId
    ) {
      return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    }

    const pendingOnly =
      new URL(req.url).searchParams.get("pending") === "1" ||
      new URL(req.url).searchParams.get("pending") === "true";

    const suggestions = await listAlternateSuggestions(id);
    const filtered = pendingOnly
      ? suggestions.filter((s) => s.status === "PENDING")
      : suggestions;

    return NextResponse.json({
      suggestions: filtered.map(serializeAlternateSuggestion),
    });
  } catch (error) {
    console.error("GET /api/orders/[id]/alternate-suggestions error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
