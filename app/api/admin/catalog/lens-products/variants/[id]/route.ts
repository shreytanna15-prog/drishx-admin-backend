import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "../../../../../../lib/session-auth";
import {
  getLensProductVariant,
  LensProductServiceError,
  updateLensProductVariant,
} from "../../../../../../lib/catalog/lens-product-service";

function requireAdmin(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) return { error: auth.error };
  if (auth.session.role !== "ADMIN") {
    return { error: NextResponse.json({ error: "Forbidden." }, { status: 403 }) };
  }
  return { session: auth.session };
}

type Ctx = { params: Promise<{ id: string }> };

// GET /api/admin/catalog/lens-products/variants/:id
export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const { id } = await ctx.params;
    const variant = await getLensProductVariant(id);
    return NextResponse.json({ variant });
  } catch (error) {
    if (error instanceof LensProductServiceError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error("GET /api/admin/catalog/lens-products/variants/:id", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// PATCH /api/admin/catalog/lens-products/variants/:id
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const variant = await updateLensProductVariant({
      id,
      purchasePrice:
        body.purchasePrice !== undefined
          ? body.purchasePrice == null
            ? null
            : Number(body.purchasePrice)
          : undefined,
      sellingPrice:
        body.sellingPrice !== undefined
          ? body.sellingPrice == null
            ? null
            : Number(body.sellingPrice)
          : undefined,
      isActive: body.isActive,
      actorUserId: auth.session.userId,
    });
    return NextResponse.json({ variant });
  } catch (error) {
    if (error instanceof LensProductServiceError) {
      return NextResponse.json(
        { error: error.message, code: error.code, details: error.details },
        { status: error.status }
      );
    }
    console.error("PATCH /api/admin/catalog/lens-products/variants/:id", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
