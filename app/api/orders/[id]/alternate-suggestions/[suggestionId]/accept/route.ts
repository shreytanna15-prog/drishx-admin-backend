import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "../../../../../../lib/session-auth";
import { prisma } from "../../../../../../lib/prisma";
import {
  acceptAlternateSuggestion,
  serializeAlternateSuggestion,
  serializePowerVersion,
  listAlternateSuggestions,
  listPowerVersions,
} from "../../../../../../lib/alternate-power-workflow";

async function assertCustomerOwnsOrder(
  session: { userId: string; role: string },
  orderId: string
) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, userId: true, lineType: true },
  });
  if (!order) return { error: "Order not found.", status: 404 as const };
  if (session.role !== "CUSTOMER" || order.userId !== session.userId) {
    return {
      error: "Only the customer can accept or reject alternate powers.",
      status: 403 as const,
    };
  }
  return { order };
}

/** POST /api/orders/:id/alternate-suggestions/:suggestionId/accept */
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
    const access = await assertCustomerOwnsOrder(session, id);
    if ("error" in access && access.error) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const result = await acceptAlternateSuggestion({
      orderId: id,
      suggestionId,
      actorUserId: session.userId,
    });

    const [versions, suggestions] = await Promise.all([
      listPowerVersions(id),
      listAlternateSuggestions(id),
    ]);

    return NextResponse.json({
      order: {
        id: result.order.id,
        status: result.order.status,
        sph: result.order.sph !== null ? Number(result.order.sph) : null,
        cyl: result.order.cyl !== null ? Number(result.order.cyl) : null,
        reservedQuantity: result.order.reservedQuantity,
      },
      version: serializePowerVersion({
        ...result.version,
        createdBy: null,
        acceptedBy: null,
      }),
      powerVersions: versions.map(serializePowerVersion),
      suggestions: suggestions.map(serializeAlternateSuggestion),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Internal Server Error";
    console.error(
      "POST /api/orders/[id]/alternate-suggestions/[suggestionId]/accept error:",
      error
    );
    return NextResponse.json(
      { error: message },
      { status: message.includes("not found") || message.includes("pending") ? 400 : 500 }
    );
  }
}
