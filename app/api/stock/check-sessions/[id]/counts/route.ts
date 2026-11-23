import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "@/app/lib/session-auth";
import { actorFromSession } from "@/app/lib/audit";
import { requireStaffPermission } from "@/app/lib/staff-access";
import {
  CatalogStockCheckError,
  getCatalogStockCheckSession,
  saveCatalogStockCheckCounts,
} from "@/app/lib/catalog/catalog-stock-check";

/**
 * PATCH /api/stock/check-sessions/:id/counts
 * Employee enters counted qty only (no system qty in response).
 */
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
) {
  const auth = getSessionOrUnauthorized(req);
  if (!auth.session) return auth.error;
  const session = auth.session;
  if (session.role !== "ADMIN" && session.role !== "EMPLOYEE") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  if (session.role === "EMPLOYEE") {
    const gate = await requireStaffPermission(session, "inventory.view");
    if ("error" in gate) return gate.error;
  }

  try {
    const { id } = await ctx.params;
    const body = (await req.json().catch(() => null)) as {
      lines?: Array<{ powerId: string; countedQty: number; notes?: string }>;
    } | null;
    await saveCatalogStockCheckCounts({
      sessionId: id,
      lines: body?.lines ?? [],
      asAdmin: session.role === "ADMIN",
      actor: actorFromSession(session),
    });
    const check = await getCatalogStockCheckSession(id, {
      includeSystemQty: session.role === "ADMIN",
    });
    return NextResponse.json({ session: check });
  } catch (error) {
    if (error instanceof CatalogStockCheckError) {
      return NextResponse.json(
        { error: error.message, code: error.code, details: error.details },
        { status: error.status }
      );
    }
    console.error("PATCH /api/stock/check-sessions/:id/counts", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
