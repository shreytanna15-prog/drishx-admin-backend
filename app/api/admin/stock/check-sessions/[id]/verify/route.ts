import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "@/app/lib/session-auth";
import { actorFromSession, buildAuditRequestContext } from "@/app/lib/audit";
import { CatalogStockAdjustmentError } from "@/app/lib/catalog/catalog-stock-adjustment";
import {
  CatalogStockCheckError,
  verifyCatalogStockCheck,
} from "@/app/lib/catalog/catalog-stock-check";

function requireAdmin(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) return { error: auth.error };
  if (auth.session.role !== "ADMIN") {
    return { error: NextResponse.json({ error: "Forbidden." }, { status: 403 }) };
  }
  return { session: auth.session };
}

type Ctx = { params: Promise<{ id: string }> };

/** POST — apply adjustments from counts, lift freeze. */
export async function POST(req: NextRequest, ctx: Ctx) {
  const auth = requireAdmin(req);
  if (auth.error) return auth.error;

  try {
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => ({}))) as {
      lineOverrides?: Array<{ powerId: string; countedQty: number }>;
    };
    const session = await verifyCatalogStockCheck({
      sessionId: id,
      lineOverrides: body.lineOverrides,
      actor: actorFromSession(auth.session),
      request: buildAuditRequestContext(req),
    });
    return NextResponse.json({ session });
  } catch (error) {
    if (
      error instanceof CatalogStockCheckError ||
      error instanceof CatalogStockAdjustmentError
    ) {
      return NextResponse.json(
        { error: error.message, code: error.code, details: error.details },
        { status: error.status }
      );
    }
    console.error("POST /api/admin/stock/check-sessions/:id/verify", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
