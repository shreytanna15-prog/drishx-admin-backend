import { NextRequest, NextResponse } from "next/server";
import { listOpenProcurementQueue } from "@/app/lib/purchase-orders";
import {
  purchaseOrderErrorResponse,
  requireProcurementView,
} from "@/app/lib/purchase-order-http";

/**
 * GET /api/procurement/purchase-orders/queue
 * Unallocated open procurement requests for the PO wizard.
 */
export async function GET(req: NextRequest) {
  const gate = await requireProcurementView(req);
  if ("error" in gate && gate.error) return gate.error;

  try {
    const queue = await listOpenProcurementQueue();
    return NextResponse.json({ queue, count: queue.length });
  } catch (error) {
    return purchaseOrderErrorResponse(error);
  }
}
