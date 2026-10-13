import { NextRequest, NextResponse } from "next/server";
import { buildAuditRequestContext } from "@/app/lib/audit";
import {
  serializePurchaseOrder,
  submitPurchaseOrderForReview,
} from "@/app/lib/purchase-orders";
import {
  purchaseOrderErrorResponse,
  requireProcurementView,
} from "@/app/lib/purchase-order-http";

/**
 * POST /api/procurement/purchase-orders/:id/submit
 * Draft → PENDING_APPROVAL (review). No quantity reservation.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireProcurementView(req);
  if ("error" in gate && gate.error) return gate.error;
  const { actor } = gate;

  try {
    const { id } = await params;
    const updated = await submitPurchaseOrderForReview({
      purchaseOrderId: id,
      actor,
      request: buildAuditRequestContext(req),
    });
    return NextResponse.json({ purchaseOrder: serializePurchaseOrder(updated) });
  } catch (error) {
    return purchaseOrderErrorResponse(error);
  }
}
