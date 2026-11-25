import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "@/app/lib/session-auth";
import {
  CatalogStockCheckError,
  getCatalogStockCheckSession,
} from "@/app/lib/catalog/catalog-stock-check";

function requireStaff(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) return { error: auth.error };
  if (auth.session.role !== "ADMIN" && auth.session.role !== "EMPLOYEE") {
    return { error: NextResponse.json({ error: "Forbidden." }, { status: 403 }) };
  }
  return { session: auth.session };
}

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/admin/stock/check-sessions/:id — system qty included for ADMIN only; stripped for EMPLOYEE. */
export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = requireStaff(req);
  if (auth.error) return auth.error;

  try {
    const { id } = await ctx.params;
    const session = await getCatalogStockCheckSession(id, {
      includeSystemQty: auth.session.role === "ADMIN",
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
