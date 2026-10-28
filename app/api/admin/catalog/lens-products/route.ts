import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "../../../../lib/session-auth";
import {
  createLensProduct,
  LensProductServiceError,
  listLensProducts,
} from "../../../../lib/catalog/lens-product-service";

function requireAdmin(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) return { error: auth.error };
  if (auth.session.role !== "ADMIN") {
    return { error: NextResponse.json({ error: "Forbidden." }, { status: 403 }) };
  }
  return { session: auth.session };
}

// GET /api/admin/catalog/lens-products
export async function GET(req: NextRequest) {
  const auth = requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const sp = new URL(req.url).searchParams;
    const isActiveRaw = sp.get("isActive");
    let isActive: boolean | null = null;
    if (isActiveRaw === "true") isActive = true;
    if (isActiveRaw === "false") isActive = false;

    const result = await listLensProducts({
      q: sp.get("q") ?? undefined,
      familyId: sp.get("familyId") ?? undefined,
      baseId: sp.get("baseId") ?? undefined,
      materialId: sp.get("materialId") ?? undefined,
      isActive,
      page: Number(sp.get("page") ?? "1") || 1,
      limit: Number(sp.get("limit") ?? "20") || 20,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/admin/catalog/lens-products", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// POST /api/admin/catalog/lens-products
export async function POST(req: NextRequest) {
  const auth = requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const body = await req.json();
    const product = await createLensProduct({
      // skuCode is generated server-side from attribute codes + range
      name: String(body.name ?? ""),
      familyId: String(body.familyId ?? ""),
      baseId: String(body.baseId ?? ""),
      materialId: String(body.materialId ?? ""),
      indexId: body.indexId ?? null,
      coatingId: body.coatingId ?? null,
      colorId: body.colorId ?? null,
      rangeType: body.rangeType,
      sphMin: Number(body.sphMin),
      sphMax: Number(body.sphMax),
      cylMin: Number(body.cylMin),
      cylMax: Number(body.cylMax),
      addMin: body.addMin != null ? Number(body.addMin) : null,
      addMax: body.addMax != null ? Number(body.addMax) : null,
      axis: body.axis != null ? Number(body.axis) : null,
      eye: body.eye ?? null,
      defaultPrice: body.defaultPrice != null ? Number(body.defaultPrice) : null,
      isActive: body.isActive,
      actorUserId: auth.session.userId,
    });
    return NextResponse.json({ product }, { status: 201 });
  } catch (error) {
    if (error instanceof LensProductServiceError) {
      return NextResponse.json(
        { error: error.message, code: error.code, details: error.details },
        { status: error.status }
      );
    }
    console.error("POST /api/admin/catalog/lens-products", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
