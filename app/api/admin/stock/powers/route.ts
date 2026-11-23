import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "@/app/lib/session-auth";
import { listCatalogStockPositions } from "@/app/lib/catalog/catalog-stock-position";

function requireAdmin(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) return { error: auth.error };
  if (auth.session.role !== "ADMIN") {
    return { error: NextResponse.json({ error: "Forbidden." }, { status: 403 }) };
  }
  return { session: auth.session };
}

/** GET /api/admin/stock/powers — paginated catalog stock leaves with position. */
export async function GET(req: NextRequest) {
  const auth = requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const sp = req.nextUrl.searchParams;
    const shortageOnly =
      sp.get("shortageOnly") === "1" || sp.get("shortageOnly") === "true";
    const data = await listCatalogStockPositions({
      q: sp.get("q") ?? undefined,
      productId: sp.get("productId") ?? undefined,
      familyCode: sp.get("familyCode") ?? undefined,
      shortageOnly,
      page: Number(sp.get("page") ?? 1) || 1,
      limit: Number(sp.get("limit") ?? 20) || 20,
    });
    return NextResponse.json(data);
  } catch (error) {
    console.error("GET /api/admin/stock/powers", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
