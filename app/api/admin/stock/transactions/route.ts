import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "@/app/lib/session-auth";
import { listCatalogStockTransactions } from "@/app/lib/catalog/catalog-stock-transactions";

function requireAdmin(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) return { error: auth.error };
  if (auth.session.role !== "ADMIN") {
    return { error: NextResponse.json({ error: "Forbidden." }, { status: 403 }) };
  }
  return { session: auth.session };
}

/** GET /api/admin/stock/transactions — catalog stock movement ledger. */
export async function GET(req: NextRequest) {
  const auth = requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const sp = req.nextUrl.searchParams;
    const data = await listCatalogStockTransactions({
      q: sp.get("q") ?? undefined,
      powerId: sp.get("powerId") ?? undefined,
      productId: sp.get("productId") ?? undefined,
      movementType: sp.get("movementType") ?? undefined,
      from: sp.get("from") ?? undefined,
      to: sp.get("to") ?? undefined,
      page: Number(sp.get("page") ?? 1) || 1,
      limit: Number(sp.get("limit") ?? 30) || 30,
    });
    return NextResponse.json(data);
  } catch (error) {
    console.error("GET /api/admin/stock/transactions", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
