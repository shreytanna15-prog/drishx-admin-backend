import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "../../../../../lib/session-auth";
import {
  getLensProduct,
  LensProductServiceError,
  updateLensProduct,
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

// GET /api/admin/catalog/lens-products/:id
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

// PATCH /api/admin/catalog/lens-products/:id
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const product = await updateLensProduct({
      id,
      skuCode: body.skuCode != null ? String(body.skuCode) : undefined,
      name: body.name != null ? String(body.name) : undefined,
      familyId: body.familyId,
      baseId: body.baseId,
      materialId: body.materialId,
      indexId: body.indexId,
      coatingId: body.coatingId,
      colorId: body.colorId,
      rangeType: body.rangeType,
      sphMin: body.sphMin != null ? Number(body.sphMin) : undefined,
      sphMax: body.sphMax != null ? Number(body.sphMax) : undefined,
      cylMin: body.cylMin != null ? Number(body.cylMin) : undefined,
      cylMax: body.cylMax != null ? Number(body.cylMax) : undefined,
      addMin: body.addMin !== undefined ? (body.addMin == null ? null : Number(body.addMin)) : undefined,
      addMax: body.addMax !== undefined ? (body.addMax == null ? null : Number(body.addMax)) : undefined,
      axis: body.axis !== undefined ? (body.axis == null ? null : Number(body.axis)) : undefined,
      eye: body.eye,
      defaultPrice:
        body.defaultPrice !== undefined
          ? body.defaultPrice == null
            ? null
            : Number(body.defaultPrice)
          : undefined,
      isActive: body.isActive,
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
