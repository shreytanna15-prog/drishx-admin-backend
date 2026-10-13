import { NextRequest, NextResponse } from "next/server";
import {
  buildPurchaseOrderDocument,
  getPurchaseOrder,
  readBuyerSettings,
} from "@/app/lib/purchase-orders";
import { renderPurchaseOrderPdf } from "@/app/lib/purchase-order-pdf";
import { purchaseOrderFileStem } from "@/app/lib/purchase-order-document";
import {
  purchaseOrderErrorResponse,
  requireProcurementView,
} from "@/app/lib/purchase-order-http";

/**
 * GET /api/procurement/purchase-orders/:id/pdf
 * Real application/pdf document with buyer, supplier and power-wise lines.
 * Read-only: generating the PDF never changes the PO status.
 */
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
    const pdf = renderPurchaseOrderPdf(
      buildPurchaseOrderDocument(po, await readBuyerSettings())
    );
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${purchaseOrderFileStem(po.publicId)}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return purchaseOrderErrorResponse(error);
  }
}
