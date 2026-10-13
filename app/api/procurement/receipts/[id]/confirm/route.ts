import { NextRequest, NextResponse } from "next/server";
import { buildAuditRequestContext } from "@/app/lib/audit";
import {
  confirmGoodsReceipt,
  serializeGoodsReceipt,
  GoodsReceiptError,
} from "@/app/lib/goods-receipts";
import {
  purchaseOrderErrorResponse,
  requireProcurementApprove,
} from "@/app/lib/purchase-order-http";

/**
 * POST /api/procurement/receipts/:id/confirm
 * Body: { confirmationKey: string }
 * Posts accepted stock exactly once. Requires procurement.approve.
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
    const body = await req.json().catch(() => ({}));
    const confirmationKey =
      typeof body?.confirmationKey === "string" ? body.confirmationKey : "";
    const confirmed = await confirmGoodsReceipt({
      goodsReceiptId: id,
      confirmationKey,
      actor,
      request: buildAuditRequestContext(req),
    });
    return NextResponse.json({ receipt: serializeGoodsReceipt(confirmed) });
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
