import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "@/app/lib/session-auth";
import { buildAuditRequestContext } from "@/app/lib/audit";
import { decideOrderModification } from "@/app/lib/order-modifications";
import { CatalogOrderStockError } from "@/app/lib/catalog/catalog-order-stock";
import { OrderInvoiceCancellationError } from "@/app/lib/finance/void-unpaid-invoice";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; requestId: string }> }
) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) return auth.error;
  if (auth.session.role !== "ADMIN") {
    return NextResponse.json({ error: "Admin only." }, { status: 403 });
  }
  const { id, requestId } = await params;
  try {
    const body = await req.json() as Record<string, unknown>;
    if (body.decision !== "APPROVE" && body.decision !== "REJECT") {
      return NextResponse.json({ error: "Choose APPROVE or REJECT." }, { status: 400 });
    }
    const updated = await decideOrderModification({
      orderId: id, requestId,
      approve: body.decision === "APPROVE",
      reason: typeof body.reason === "string" ? body.reason : "",
      goodsReturnedConfirmed: body.goodsReturnedConfirmed === true,
      session: auth.session, request: buildAuditRequestContext(req),
    });
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof CatalogOrderStockError || error instanceof OrderInvoiceCancellationError) {
      return NextResponse.json({ error: error.message }, { status: error instanceof CatalogOrderStockError ? error.status : 409 });
    }
    console.error("PATCH /api/orders/[id]/modification/[requestId]", error);
    return NextResponse.json({ error: "Could not decide order change." }, { status: 500 });
  }
}
