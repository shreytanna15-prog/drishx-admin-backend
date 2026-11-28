import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "@/app/lib/session-auth";
import {
  resolveStorefrontMembership,
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

type Ctx = { params: Promise<{ id: string }> };

// GET /api/admin/storefront/cards/:id/products
export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const { id } = await ctx.params;
    const sp = req.nextUrl.searchParams;
    const result = await resolveStorefrontMembership(id, {
      q: sp.get("q") ?? undefined,
      includeInactiveProducts: sp.get("includeInactiveProducts") === "true",
      includeExcluded: true,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof StorefrontCatalogError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error("GET /api/admin/storefront/cards/[id]/products", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}