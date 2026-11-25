import { NextRequest, NextResponse } from "next/server";
import { listCatalogStockPositions } from "@/app/lib/catalog/catalog-stock-position";
import { purchaseOrderErrorResponse, requireProcurementView } from "@/app/lib/purchase-order-http";

/** Search catalog stock leaves for manually added purchase-order lines. */
export async function GET(req: NextRequest) {
  const gate = await requireProcurementView(req);
  if ("error" in gate && gate.error) return gate.error;

  try {
    const sp = req.nextUrl.searchParams;
    const result = await listCatalogStockPositions({
      q: sp.get("q") ?? undefined,
      page: Number(sp.get("page") ?? 1) || 1,
      limit: 20,
    });
    return NextResponse.json(result);
  } catch (error) {
    return purchaseOrderErrorResponse(error);
  }
}
