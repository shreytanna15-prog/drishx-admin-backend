import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "../../../../../lib/session-auth";
import {
  addLensProductVariants,
  getLensProduct,
  LensProductServiceError,
} from "../../../../../lib/catalog/lens-product-service";

function requireAdmin(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) return { error: auth.error };
  if (auth.session.role !== "ADMIN") {
    return { error: NextResponse.json({ error: "Forbidden." }, { status: 403 }) };
  }
  return { session: auth.session };
}

type Ctx = { params: Promise<{ id: string }> };

// GET /api/admin/catalog/lens-products/:id  (parent + variants)
export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const { id } = await ctx.params;
    const product = await getLensProduct(id);
    return NextResponse.json({ product });
  } catch (error) {
    if (error instanceof LensProductServiceError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error("GET /api/admin/catalog/lens-products/:id", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// POST /api/admin/catalog/lens-products/:id  — add power-range variants
export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const powerRangeIds = Array.isArray(body?.powerRangeIds)
      ? body.powerRangeIds.map((x: unknown) => String(x ?? "").trim()).filter(Boolean)
      : [];
    const product = await addLensProductVariants({
      productId: id,
      powerRangeIds,
      defaultPrice: body.defaultPrice != null ? Number(body.defaultPrice) : null,
      actorUserId: auth.session.userId,
    });
    return NextResponse.json({ product });
  } catch (error) {
    if (error instanceof LensProductServiceError) {
      return NextResponse.json(
        { error: error.message, code: error.code, details: error.details },
        { status: error.status }
      );
    }
    console.error("POST /api/admin/catalog/lens-products/:id", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
