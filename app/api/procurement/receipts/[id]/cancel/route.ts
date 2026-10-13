import { NextRequest, NextResponse } from "next/server";
import { buildAuditRequestContext } from "@/app/lib/audit";
import {
  cancelDraftGoodsReceipt,
  serializeGoodsReceipt,
} from "@/app/lib/goods-receipts";
import {
  purchaseOrderErrorResponse,
  requireProcurementIntake,
} from "@/app/lib/purchase-order-http";

/** POST /api/procurement/receipts/:id/cancel — discard a draft receipt (no stock change). */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireProcurementIntake(req);
  if ("error" in gate && gate.error) return gate.error;
  try {
    const { id } = await params;
    const receipt = await cancelDraftGoodsReceipt({
      goodsReceiptId: id,
      actor: gate.actor,
      request: buildAuditRequestContext(req),
    });
    return NextResponse.json({ receipt: serializeGoodsReceipt(receipt) });
  } catch (error) {
    return purchaseOrderErrorResponse(error);
  }
}
