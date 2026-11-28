import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "@/app/lib/session-auth";
import {
  exportPowerWiseVariantMatrix,
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

/** GET /api/admin/stock/power-wise/products/:productId/variants/:variantId/export?format=xlsx|pdf */
export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const { productId, variantId } = await ctx.params;
    const formatRaw = (req.nextUrl.searchParams.get("format") ?? "xlsx")
      .trim()
      .toLowerCase();
    if (formatRaw !== "xlsx" && formatRaw !== "pdf") {
      return NextResponse.json(
        { error: "format must be xlsx or pdf.", code: "VALIDATION" },
        { status: 400 }
      );
    }

    const exported = await exportPowerWiseVariantMatrix(
      productId,
      variantId,
      formatRaw
    );

    return new NextResponse(new Uint8Array(exported.buffer), {
      status: 200,
      headers: {
        "Content-Type": exported.contentType,
        "Content-Disposition": `attachment; filename="${exported.fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof PowerWiseStockError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error(
      "GET /api/admin/stock/power-wise/products/:productId/variants/:variantId/export",
      error
    );
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
