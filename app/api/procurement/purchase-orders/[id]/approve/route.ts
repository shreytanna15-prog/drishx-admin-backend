import { NextRequest, NextResponse } from "next/server";
import { buildAuditRequestContext } from "@/app/lib/audit";
import {
  approvePurchaseOrder,
  serializePurchaseOrder,
} from "@/app/lib/purchase-orders";
import {
  purchaseOrderErrorResponse,
  requireProcurementApprove,
} from "@/app/lib/purchase-order-http";

/**
 * POST /api/procurement/purchase-orders/:id/approve
 * Draft/pending → OPEN. Allocates PRs; does not change stock.
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
    const approved = await approvePurchaseOrder({
      purchaseOrderId: id,
      actor,
      request: buildAuditRequestContext(req),
    });
    return NextResponse.json({ purchaseOrder: serializePurchaseOrder(approved) });
  } catch (error) {
    return purchaseOrderErrorResponse(error);
  }
}
