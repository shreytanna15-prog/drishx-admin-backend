import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "@/app/lib/session-auth";
import { getCatalogStockOverview } from "@/app/lib/catalog/catalog-stock-position";

function requireAdmin(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) return { error: auth.error };
  if (auth.session.role !== "ADMIN") {
    return { error: NextResponse.json({ error: "Forbidden." }, { status: 403 }) };
  }
  return { session: auth.session };
}

/** GET /api/admin/stock/overview — catalog leaf aggregates + top shortages. */
export async function GET(req: NextRequest) {
  const auth = requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const overview = await getCatalogStockOverview();
    return NextResponse.json({ overview });
  } catch (error) {
    console.error("GET /api/admin/stock/overview", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
