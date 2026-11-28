import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "@/app/lib/session-auth";
import {
  deleteStorefrontCard,
  getStorefrontCard,
  StorefrontCatalogError,
  updateStorefrontCard,
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

// GET /api/admin/storefront/cards/:id
export async function GET(req: NextRequest, ctx: Ctx) {
  const auth = requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const { id } = await ctx.params;
    const item = await getStorefrontCard(id);
    return NextResponse.json({ item });
  } catch (error) {
    if (error instanceof StorefrontCatalogError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error("GET /api/admin/storefront/cards/[id]", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// PATCH /api/admin/storefront/cards/:id
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const { id } = await ctx.params;
    const body = (await req.json()) as {
      name?: string;
      description?: string | null;
      sortOrder?: number;
      isActive?: boolean;
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
    const item = await updateStorefrontCard(id, body);
    return NextResponse.json({ item });
  } catch (error) {
    if (error instanceof StorefrontCatalogError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error("PATCH /api/admin/storefront/cards/[id]", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// DELETE /api/admin/storefront/cards/:id
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const auth = requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const { id } = await ctx.params;
    const result = await deleteStorefrontCard(id);
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof StorefrontCatalogError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error("DELETE /api/admin/storefront/cards/[id]", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
