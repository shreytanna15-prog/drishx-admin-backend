import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "@/app/lib/session-auth";
import {
  CatalogStockCheckError,
  getCatalogStockCheckSession,
} from "@/app/lib/catalog/catalog-stock-check";

function requireAdmin(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) return { error: auth.error };
  if (auth.session.role !== "ADMIN") {
    return { error: NextResponse.json({ error: "Forbidden." }, { status: 403 }) };
  }
  return { session: auth.session };
}

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/admin/stock/check-sessions/:id — includes system qty. */
export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const { id } = await ctx.params;
    const session = await getCatalogStockCheckSession(id, {
      includeSystemQty: true,
    });
    return NextResponse.json({ session });
  } catch (error) {
    if (error instanceof CatalogStockCheckError) {
      return NextResponse.json(
        { error: error.message, code: error.code, details: error.details },
        { status: error.status }
      );
    }
    console.error("GET /api/admin/stock/check-sessions/:id", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
