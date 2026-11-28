import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "@/app/lib/session-auth";
import {
  listPowerWiseProducts,
  PowerWiseStockError,
} from "@/app/lib/catalog/power-wise-stock";

function requireAdmin(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) return { error: auth.error };
  if (auth.session.role !== "ADMIN") {
    return { error: NextResponse.json({ error: "Forbidden." }, { status: 403 }) };
  }
  return { session: auth.session };
}

/** GET /api/admin/stock/power-wise/products — parent stock cards. */
export async function GET(req: NextRequest) {
  const auth = requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const sp = req.nextUrl.searchParams;
    const products = await listPowerWiseProducts({
      q: sp.get("q") ?? undefined,
      familyCode: sp.get("familyCode") ?? undefined,
      familyId: sp.get("familyId") ?? undefined,
      baseId: sp.get("baseId") ?? undefined,
      materialId: sp.get("materialId") ?? undefined,
      indexId: sp.get("indexId") ?? undefined,
      coatingId: sp.get("coatingId") ?? undefined,
      colorId: sp.get("colorId") ?? undefined,
      diameterId: sp.get("diameterId") ?? undefined,
      progressiveTypeId: sp.get("progressiveTypeId") ?? undefined,
      shortageOnly: sp.get("shortageOnly") === "true",
    });
    return NextResponse.json({ products });
  } catch (error) {
    if (error instanceof PowerWiseStockError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error("GET /api/admin/stock/power-wise/products", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
