import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "@/app/lib/session-auth";
import { LensProductServiceError } from "@/app/lib/catalog/lens-product-service";
import {
  CatalogStockError,
  getCatalogProductMatrixStock,
} from "@/app/lib/catalog/lens-product-stock";

function requireAdmin(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) return { error: auth.error };
  if (auth.session.role !== "ADMIN") {
    return { error: NextResponse.json({ error: "Forbidden." }, { status: 403 }) };
  }
  return { session: auth.session };
}

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/admin/catalog/lens-products/:id/matrix
 * Family sheets + live Current / Threshold / Target leaves (0 when no leaf).
 */
export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const { id } = await ctx.params;
    const data = await getCatalogProductMatrixStock(id);
    return NextResponse.json(data);
  } catch (error) {
    if (error instanceof LensProductServiceError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    if (error instanceof CatalogStockError) {
      return NextResponse.json(
        { error: error.message, code: error.code, details: error.details },
        { status: error.status }
      );
    }
    console.error("GET /api/admin/catalog/lens-products/:id/matrix", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
