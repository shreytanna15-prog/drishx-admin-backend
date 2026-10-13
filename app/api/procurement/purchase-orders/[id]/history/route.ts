import { NextRequest, NextResponse } from "next/server";
import { listPurchaseOrderHistory } from "@/app/lib/purchase-orders";
import {
  purchaseOrderErrorResponse,
  requireProcurementView,
} from "@/app/lib/purchase-order-http";

/** GET /api/procurement/purchase-orders/:id/history — audit trail (PO + receipts). */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireProcurementView(req);
  if ("error" in gate && gate.error) return gate.error;
  try {
    const { id } = await params;
    return NextResponse.json({ history: await listPurchaseOrderHistory(id) });
  } catch (error) {
    return purchaseOrderErrorResponse(error);
  }
}
