import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "@/app/lib/session-auth";
import { actorFromSession, buildAuditRequestContext } from "@/app/lib/audit";
import {
  CatalogStockBlockError,
  setCatalogPowerBlockedQty,
} from "@/app/lib/catalog/catalog-stock-block";
import { CatalogStockFreezeError } from "@/app/lib/catalog/catalog-stock-freeze";

function requireAdmin(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) return { error: auth.error };
  if (auth.session.role !== "ADMIN") {
    return { error: NextResponse.json({ error: "Forbidden." }, { status: 403 }) };
  }
  return { session: auth.session };
}

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/admin/stock/powers/:id/block — set discrepancy blockedQty. */
export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const { id } = await ctx.params;
    const body = (await req.json()) as {
      blockedQty?: number;
      reasonText?: string | null;
    };
    if (body.blockedQty == null || !Number.isInteger(body.blockedQty)) {
      return NextResponse.json(
        { error: "blockedQty (whole number) is required." },
        { status: 400 }
      );
    }
    const power = await setCatalogPowerBlockedQty({
      powerId: id,
      blockedQty: body.blockedQty,
      reasonText: body.reasonText,
      actor: actorFromSession(auth.session),
      request: buildAuditRequestContext(req),
    });
    return NextResponse.json({ power });
  } catch (error) {
    if (
      error instanceof CatalogStockBlockError ||
      error instanceof CatalogStockFreezeError
    ) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status }
      );
    }
    console.error("POST /api/admin/stock/powers/[id]/block", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
