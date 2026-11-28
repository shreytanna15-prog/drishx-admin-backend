import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "@/app/lib/session-auth";
import {
  createStorefrontCard,
  listStorefrontCards,
  StorefrontCatalogError,
} from "@/app/lib/storefront/storefront-catalog";

function requireAdmin(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) return { error: auth.error };
  if (auth.session.role !== "ADMIN") {
    return { error: NextResponse.json({ error: "Forbidden." }, { status: 403 }) };
  }
  return { session: auth.session };
}

// GET /api/admin/storefront/cards?familyId=|&familyCode=SV
export async function GET(req: NextRequest) {
  const auth = requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const sp = req.nextUrl.searchParams;
    const items = await listStorefrontCards({
      familyId: sp.get("familyId") ?? undefined,
      familyCode: sp.get("familyCode") ?? sp.get("family") ?? undefined,
      includeInactive: sp.get("includeInactive") !== "false",
    });
    return NextResponse.json({ items });
  } catch (error) {
    if (error instanceof StorefrontCatalogError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error("GET /api/admin/storefront/cards", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// POST /api/admin/storefront/cards
export async function POST(req: NextRequest) {
  const auth = requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const body = (await req.json()) as {
      familyId?: string;
      name?: string;
      description?: string | null;
      sortOrder?: number;
      filters?: {
        baseId?: string | null;
        materialId?: string | null;
        indexId?: string | null;
        coatingId?: string | null;
        colorId?: string | null;
        diameterId?: string | null;
        progressiveTypeId?: string | null;
      };
    };
    const item = await createStorefrontCard({
      familyId: String(body.familyId ?? ""),
      name: String(body.name ?? ""),
      description: body.description,
      sortOrder: body.sortOrder,
      filters: body.filters,
    });
    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    if (error instanceof StorefrontCatalogError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error("POST /api/admin/storefront/cards", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
