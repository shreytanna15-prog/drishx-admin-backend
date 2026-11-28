import { NextRequest, NextResponse } from "next/server";
import { StorefrontCardOverrideKind } from "@prisma/client";
import { getSessionOrUnauthorized } from "@/app/lib/session-auth";
import {
  StorefrontCatalogError,
  upsertStorefrontOverride,
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

// POST /api/admin/storefront/cards/:id/overrides
export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const { id } = await ctx.params;
    const body = (await req.json()) as {
      lensProductId?: string;
      kind?: string;
    };
    const lensProductId = String(body.lensProductId ?? "").trim();
    const kindRaw = String(body.kind ?? "").trim().toUpperCase();
    const kind =
      kindRaw === "PIN"
        ? StorefrontCardOverrideKind.PIN
        : kindRaw === "EXCLUDE"
          ? StorefrontCardOverrideKind.EXCLUDE
          : null;
    if (!lensProductId || !kind) {
      return NextResponse.json(
        { error: "lensProductId and kind (PIN|EXCLUDE) are required." },
        { status: 400 }
      );
    }
    await upsertStorefrontOverride({
      cardId: id,
      lensProductId,
      kind,
    });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    if (error instanceof StorefrontCatalogError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error("POST /api/admin/storefront/cards/[id]/overrides", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}