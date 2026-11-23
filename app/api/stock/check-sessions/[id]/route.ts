import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "@/app/lib/session-auth";
import { requireStaffPermission } from "@/app/lib/staff-access";
import {
  CatalogStockCheckError,
  getCatalogStockCheckSession,
} from "@/app/lib/catalog/catalog-stock-check";

/**
 * GET /api/stock/check-sessions/:id
 * Employee (inventory.view) or Admin. System qty is stripped for employees.
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
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
    const includeSystemQty = session.role === "ADMIN";
    const check = await getCatalogStockCheckSession(id, { includeSystemQty });
    return NextResponse.json({ session: check });
  } catch (error) {
    if (error instanceof CatalogStockCheckError) {
      return NextResponse.json(
        { error: error.message, code: error.code, details: error.details },
        { status: error.status }
      );
    }
    console.error("GET /api/stock/check-sessions/:id", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
