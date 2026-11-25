import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "@/app/lib/session-auth";
import { actorFromSession } from "@/app/lib/audit";
import {
  CatalogStockCheckError,
  saveCatalogStockCheckCounts,
} from "@/app/lib/catalog/catalog-stock-check";

function requireStaff(req: NextRequest) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) return { error: auth.error };
  if (auth.session.role !== "ADMIN" && auth.session.role !== "EMPLOYEE") {
    return { error: NextResponse.json({ error: "Forbidden." }, { status: 403 }) };
  }
  return { session: auth.session };
}

type Ctx = { params: Promise<{ id: string }> };

/** PATCH — Employee submits blind counted qty; Admin may enter/override. */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const auth = requireStaff(req);
  if (auth.error) return auth.error;

  try {
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => null)) as {
      lines?: Array<{ powerId: string; countedQty: number; notes?: string }>;
    } | null;
    const session = await saveCatalogStockCheckCounts({
      sessionId: id,
      lines: body?.lines ?? [],
      asAdmin: auth.session.role === "ADMIN",
      actor: actorFromSession(auth.session),
    });
    return NextResponse.json({ session });
  } catch (error) {
    if (error instanceof CatalogStockCheckError) {
      return NextResponse.json(
        { error: error.message, code: error.code, details: error.details },
        { status: error.status }
      );
    }
    console.error("PATCH /api/admin/stock/check-sessions/:id/counts", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
