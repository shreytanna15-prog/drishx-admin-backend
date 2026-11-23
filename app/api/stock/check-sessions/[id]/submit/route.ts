import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "@/app/lib/session-auth";
import { actorFromSession, buildAuditRequestContext } from "@/app/lib/audit";
import { requireStaffPermission } from "@/app/lib/staff-access";
import {
  CatalogStockCheckError,
  getCatalogStockCheckSession,
  submitCatalogStockCheck,
} from "@/app/lib/catalog/catalog-stock-check";

/** POST /api/stock/check-sessions/:id/submit — employee submits counts. */
export async function POST(
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
    await submitCatalogStockCheck({
      sessionId: id,
      actor: actorFromSession(session),
      request: buildAuditRequestContext(req),
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
    console.error("POST /api/stock/check-sessions/:id/submit", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
