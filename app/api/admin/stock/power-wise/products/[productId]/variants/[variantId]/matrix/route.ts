import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "@/app/lib/session-auth";
import {
  getPowerWiseVariantMatrix,
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

type Ctx = { params: Promise<{ productId: string; variantId: string }> };

/** GET /api/admin/stock/power-wise/products/:productId/variants/:variantId/matrix */
export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const { productId, variantId } = await ctx.params;
    const data = await getPowerWiseVariantMatrix(productId, variantId);
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof PowerWiseStockError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error(
      "GET /api/admin/stock/power-wise/products/:productId/variants/:variantId/matrix",
      error
    );
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
