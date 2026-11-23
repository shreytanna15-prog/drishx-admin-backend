import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "@/app/lib/session-auth";
import { getCatalogStockPosition } from "@/app/lib/catalog/catalog-stock-position";

function requireAdmin(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) return { error: auth.error };
  if (auth.session.role !== "ADMIN") {
    return { error: NextResponse.json({ error: "Forbidden." }, { status: 403 }) };
  }
  return { session: auth.session };
}

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/admin/stock/powers/:id */
export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const { id } = await ctx.params;
    const power = await getCatalogStockPosition(id);
    if (!power) {
      return NextResponse.json({ error: "Stock leaf not found." }, { status: 404 });
    }
    return NextResponse.json({ power });
  } catch (error) {
    console.error("GET /api/admin/stock/powers/[id]", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
