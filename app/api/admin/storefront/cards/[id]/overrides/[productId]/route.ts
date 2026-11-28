import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "@/app/lib/session-auth";
import {
  clearStorefrontOverride,
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

type Ctx = { params: Promise<{ id: string; productId: string }> };

// DELETE /api/admin/storefront/cards/:id/overrides/:productId
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const auth = requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const { id, productId } = await ctx.params;
    const result = await clearStorefrontOverride(id, productId);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof StorefrontCatalogError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error(
      "DELETE /api/admin/storefront/cards/[id]/overrides/[productId]",
      error
    );
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}