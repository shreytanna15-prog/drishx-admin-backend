import { NextRequest, NextResponse } from "next/server";
import { buildAuditRequestContext } from "@/app/lib/audit";
import {
  markPurchaseOrderSent,
  serializePurchaseOrder,
} from "@/app/lib/purchase-orders";
import { isPoSentChannel } from "@/app/lib/purchase-order-sent";
import {
  purchaseOrderErrorResponse,
  requireProcurementApprove,
} from "@/app/lib/purchase-order-http";

/**
 * POST /api/procurement/purchase-orders/:id/sent
 * Body: { channel, sentTo?, note? }
 * Explicit, authorized record that the approved PO was dispatched to the
 * supplier. DrishX does not send email itself — no email service is configured.
 * Access: ADMIN | EMPLOYEE (procurement.approve)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireProcurementApprove(req);
  if ("error" in gate && gate.error) return gate.error;
  const { actor } = gate;

  try {
    const { id } = await params;
    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || !isPoSentChannel(body.channel)) {
      return NextResponse.json(
        { error: "Choose how the purchase order was sent.", code: "PO_SENT_CHANNEL_INVALID" },
        { status: 400 }
      );
    }
    const po = await markPurchaseOrderSent({
      purchaseOrderId: id,
      channel: body.channel,
      sentTo: typeof body.sentTo === "string" ? body.sentTo : null,
      note: typeof body.note === "string" ? body.note : null,
      actor,
      request: buildAuditRequestContext(req),
    });
    return NextResponse.json({ purchaseOrder: serializePurchaseOrder(po) });
  } catch (error) {
    return purchaseOrderErrorResponse(error);
  }
}
