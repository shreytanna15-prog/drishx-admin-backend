import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "@/app/lib/session-auth";
import {
  listPinCandidates,
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

// GET /api/admin/storefront/products/pin-candidates?familyId=&cardId=
export async function GET(req: NextRequest) {
  const auth = requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const sp = req.nextUrl.searchParams;
    const familyId = sp.get("familyId")?.trim() ?? "";
    const cardId = sp.get("cardId")?.trim() ?? "";
    const items = await listPinCandidates({
      familyId,
      cardId,
      q: sp.get("q") ?? undefined,
      limit: Number(sp.get("limit") ?? "50") || 50,
    });
    return NextResponse.json({ items });
  } catch (error) {
    if (error instanceof StorefrontCatalogError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error("GET /api/admin/storefront/products/pin-candidates", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}