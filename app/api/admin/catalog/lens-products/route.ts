import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "../../../../lib/session-auth";
import {
  createLensProduct,
  LensProductServiceError,
  listLensProducts,
  listLensProductVariants,
  previewLensProductVariants,
} from "../../../../lib/catalog/lens-product-service";

function requireAdmin(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) return { error: auth.error };
  if (auth.session.role !== "ADMIN") {
    return { error: NextResponse.json({ error: "Forbidden." }, { status: 403 }) };
  }
  return { session: auth.session };
}

function parseIdList(body: unknown, key: string): string[] {
  if (!body || typeof body !== "object") return [];
  const raw = (body as Record<string, unknown>)[key];
  if (!Array.isArray(raw)) return [];
  return raw.map((id) => String(id ?? "").trim()).filter(Boolean);
}

function parsePowerRangeIds(body: unknown): string[] {
  if (!body || typeof body !== "object") return [];
  const raw = (body as { powerRangeIds?: unknown; powerRangeId?: unknown })
    .powerRangeIds;
  if (Array.isArray(raw)) {
    return raw.map((id) => String(id ?? "").trim()).filter(Boolean);
  }
  const single = (body as { powerRangeId?: unknown }).powerRangeId;
  if (single) return [String(single).trim()].filter(Boolean);
  return [];
}

function parseVariantExpansionBody(body: unknown) {
  const b = body as Record<string, unknown>;
  return {
    familyId: String(b.familyId ?? ""),
    baseId: String(b.baseId ?? ""),
    materialId: b.materialId ? String(b.materialId) : null,
    indexId: b.indexId ? String(b.indexId) : null,
    colorId: b.colorId ? String(b.colorId) : null,
    diameterId: b.diameterId ? String(b.diameterId) : null,
    progressiveTypeId: b.progressiveTypeId
      ? String(b.progressiveTypeId)
      : null,
    powerRangeIds: parsePowerRangeIds(body),
    axisIds: parseIdList(body, "axisIds"),
    additionIds: parseIdList(body, "additionIds"),
    purchasePrice: b.purchasePrice != null ? Number(b.purchasePrice) : null,
    sellingPrice: b.sellingPrice != null ? Number(b.sellingPrice) : null,
    isActive: b.isActive as boolean | undefined,
  };
}

// GET /api/admin/catalog/lens-products?view=flat|grouped
export async function GET(req: NextRequest) {
  const auth = requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const sp = new URL(req.url).searchParams;
    const isActiveRaw = sp.get("isActive");
    let isActive: boolean | null = null;
    if (isActiveRaw === "true") isActive = true;
    if (isActiveRaw === "false") isActive = false;

    const view = (sp.get("view") ?? "flat").toLowerCase();
    const common = {
      q: sp.get("q") ?? undefined,
      familyId: sp.get("familyId") ?? undefined,
      baseId: sp.get("baseId") ?? undefined,
      materialId: sp.get("materialId") ?? undefined,
      isActive,
      page: Number(sp.get("page") ?? "1") || 1,
      limit: Number(sp.get("limit") ?? "20") || 20,
    };

    if (view === "grouped") {
      const result = await listLensProducts(common);
      return NextResponse.json({ ...result, view: "grouped" });
    }

    const result = await listLensProductVariants({
      ...common,
      powerRangeId: sp.get("powerRangeId") ?? undefined,
    });
    return NextResponse.json({ ...result, view: "flat" });
  } catch (error) {
    console.error("GET /api/admin/catalog/lens-products", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// POST /api/admin/catalog/lens-products
// body.preview === true → preview only
export async function POST(req: NextRequest) {
  const auth = requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const body = await req.json();
    const parsed = parseVariantExpansionBody(body);

    if (body?.preview === true) {
      const preview = await previewLensProductVariants(parsed);
      return NextResponse.json({ preview });
    }

    const product = await createLensProduct({
      ...parsed,
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
