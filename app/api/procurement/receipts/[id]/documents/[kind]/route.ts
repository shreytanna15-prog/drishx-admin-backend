import { NextRequest, NextResponse } from "next/server";
import { getReceiptDocumentRef } from "@/app/lib/goods-receipts";
import { signProcurementDocumentUrl } from "@/app/lib/procurement-storage";
import {
  purchaseOrderErrorResponse,
  requireProcurementView,
} from "@/app/lib/purchase-order-http";

/**
 * GET /api/procurement/receipts/:id/documents/:kind   (kind = bill | excel)
 * Returns a 5-minute signed URL for an authorized viewer. Objects live in a
 * private bucket and are never publicly addressable.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; kind: string }> }
) {
  const gate = await requireProcurementView(req);
  if ("error" in gate && gate.error) return gate.error;
  try {
    const { id, kind } = await params;
    if (kind !== "bill" && kind !== "excel") {
      return NextResponse.json({ error: "Unknown document." }, { status: 404 });
    }
    const ref = await getReceiptDocumentRef(id, kind);
    const url = await signProcurementDocumentUrl(ref.objectPath, ref.fileName);
    return NextResponse.json(
      { url, fileName: ref.fileName, expiresInSeconds: 300 },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return purchaseOrderErrorResponse(error);
  }
}
