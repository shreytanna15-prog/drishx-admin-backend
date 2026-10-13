import { NextRequest, NextResponse } from "next/server";
import { buildAuditRequestContext } from "@/app/lib/audit";
import {
  getGoodsReceipt,
  serializeGoodsReceipt,
  updateDraftReceiptLines,
  GoodsReceiptError,
} from "@/app/lib/goods-receipts";
import {
  purchaseOrderErrorResponse,
  requireProcurementIntake,
  requireProcurementView,
} from "@/app/lib/purchase-order-http";

type Ctx = { params: Promise<{ id: string }> };

function grnError(error: unknown) {
  if (error instanceof GoodsReceiptError) {
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status }
    );
  }
  return purchaseOrderErrorResponse(error);
}

/** GET /api/procurement/receipts/:id */
export async function GET(req: NextRequest, ctx: Ctx) {
  const gate = await requireProcurementView(req);
  if ("error" in gate && gate.error) return gate.error;
  try {
    const { id } = await ctx.params;
    const receipt = await getGoodsReceipt(id);
    if (!receipt) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    return NextResponse.json({ receipt: serializeGoodsReceipt(receipt) });
  } catch (error) {
    return grnError(error);
  }
}

/** PATCH — update accepted/damaged/actions before confirm (no stock). */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const gate = await requireProcurementIntake(req);
  if ("error" in gate && gate.error) return gate.error;
  const { actor } = gate;

  try {
    const { id } = await ctx.params;
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }
    const updated = await updateDraftReceiptLines({
      goodsReceiptId: id,
      lineUpdates: Array.isArray(body?.lineUpdates) ? body.lineUpdates : [],
      billResolutions: Array.isArray(body?.billResolutions)
        ? body.billResolutions
        : undefined,
      actor,
      request: buildAuditRequestContext(req),
    });
    return NextResponse.json({ receipt: serializeGoodsReceipt(updated) });
  } catch (error) {
    return grnError(error);
  }
}
