import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "@/app/lib/session-auth";
import {
  listPowerWiseVariants,
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

type Ctx = { params: Promise<{ productId: string }> };

/** GET /api/admin/stock/power-wise/products/:productId/variants */
export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const { productId } = await ctx.params;
    const sp = req.nextUrl.searchParams;
    const axisRaw = sp.get("axis");
    const data = await listPowerWiseVariants(productId, {
      q: sp.get("q") ?? undefined,
      includeInactive: sp.get("includeInactive") === "true",
      axis: axisRaw != null && axisRaw !== "" ? Number(axisRaw) : undefined,
    });
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof PowerWiseStockError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error(
      "GET /api/admin/stock/power-wise/products/:productId/variants",
      error
    );
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
