import { NextRequest, NextResponse } from "next/server";
import { buildAuditRequestContext } from "@/app/lib/audit";
import {
  closePurchaseOrderOutstanding,
  GoodsReceiptError,
} from "@/app/lib/goods-receipts";
import {
  getPurchaseOrder,
  serializePurchaseOrder,
} from "@/app/lib/purchase-orders";
import {
  purchaseOrderErrorResponse,
  requireProcurementApprove,
} from "@/app/lib/purchase-order-http";
import { CLOSE_OUTSTANDING_REASONS } from "@/app/lib/purchase-order-receive-math";

/**
 * POST /api/procurement/purchase-orders/:id/close-outstanding
 * Body: { reason, reasonDetail? }
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
    const body = await req.json();
    if (typeof body?.reason !== "string") {
      return NextResponse.json(
        {
          error: "reason is required.",
          allowed: CLOSE_OUTSTANDING_REASONS,
        },
        { status: 400 }
      );
    }
    await closePurchaseOrderOutstanding({
      purchaseOrderId: id,
      reason: body.reason,
      reasonDetail:
        typeof body.reasonDetail === "string" ? body.reasonDetail : undefined,
      actor,
      request: buildAuditRequestContext(req),
    });
    const po = await getPurchaseOrder(id);
    if (!po) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    return NextResponse.json({ purchaseOrder: serializePurchaseOrder(po) });
  } catch (error) {
    if (error instanceof GoodsReceiptError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    return purchaseOrderErrorResponse(error);
  }
}
