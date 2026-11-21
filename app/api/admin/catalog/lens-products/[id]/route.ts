import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "../../../../../lib/session-auth";
import {
  addLensProductVariants,
  getLensProduct,
  LensProductServiceError,
  updateLensProductParent,
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

// PATCH /api/admin/catalog/lens-products/:id  — update parent attrs (coating)
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const { id } = await ctx.params;
    const body = await req.json();
    if (!("coatingId" in (body ?? {}))) {
      return NextResponse.json(
        { error: "coatingId is required.", code: "VALIDATION" },
        { status: 400 }
      );
    }
    const coatingId =
      body.coatingId == null || String(body.coatingId).trim() === ""
        ? null
        : String(body.coatingId).trim();
    const product = await updateLensProductParent({
      productId: id,
      coatingId,
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
    console.error("PATCH /api/admin/catalog/lens-products/:id", error);
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
    const axisIds = Array.isArray(body?.axisIds)
      ? body.axisIds.map((x: unknown) => String(x ?? "").trim()).filter(Boolean)
      : [];
    const additionIds = Array.isArray(body?.additionIds)
      ? body.additionIds.map((x: unknown) => String(x ?? "").trim()).filter(Boolean)
      : [];
    const product = await addLensProductVariants({
      productId: id,
      powerRangeIds,
      axisIds,
      additionIds,
      purchasePrice:
        body.purchasePrice != null ? Number(body.purchasePrice) : null,
      sellingPrice: body.sellingPrice != null ? Number(body.sellingPrice) : null,
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
