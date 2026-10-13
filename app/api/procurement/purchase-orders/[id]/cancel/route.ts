import { NextRequest, NextResponse } from "next/server";
import { buildAuditRequestContext } from "@/app/lib/audit";
import {
  cancelPurchaseOrder,
  serializePurchaseOrder,
} from "@/app/lib/purchase-orders";
import {
  purchaseOrderErrorResponse,
  requireProcurementApprove,
} from "@/app/lib/purchase-order-http";

/**
 * POST /api/procurement/purchase-orders/:id/cancel
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
    let reason: string | undefined;
    try {
      const body = await req.json();
      if (typeof body?.reason === "string") reason = body.reason;
    } catch {
      // empty body OK
    }

    const cancelled = await cancelPurchaseOrder({
      purchaseOrderId: id,
      reason,
      actor,
      request: buildAuditRequestContext(req),
    });
    return NextResponse.json({ purchaseOrder: serializePurchaseOrder(cancelled) });
  } catch (error) {
    return purchaseOrderErrorResponse(error);
  }
}
