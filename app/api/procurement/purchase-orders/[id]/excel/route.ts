import { NextRequest, NextResponse } from "next/server";
import {
  buildPurchaseOrderDocument,
  getPurchaseOrder,
  readBuyerSettings,
} from "@/app/lib/purchase-orders";
import { buildPurchaseOrderWorkbookBuffer } from "@/app/lib/purchase-order-xlsx";
import { purchaseOrderFileStem } from "@/app/lib/purchase-order-document";
import {
  purchaseOrderErrorResponse,
  requireProcurementView,
} from "@/app/lib/purchase-order-http";

/** GET /api/procurement/purchase-orders/:id/excel — .xlsx PO with supplier details. */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireProcurementView(req);
  if ("error" in gate && gate.error) return gate.error;

  try {
    const { id } = await params;
    const po = await getPurchaseOrder(id);
    if (!po) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    const buffer = await buildPurchaseOrderWorkbookBuffer(
      buildPurchaseOrderDocument(po, await readBuyerSettings())
    );
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${purchaseOrderFileStem(po.publicId)}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return purchaseOrderErrorResponse(error);
  }
}
