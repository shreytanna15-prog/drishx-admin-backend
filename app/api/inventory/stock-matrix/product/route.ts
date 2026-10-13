import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "@/app/lib/session-auth";
import { requireStaffPermission } from "@/app/lib/staff-access";
import {
  getProductMatrix,
  isMatrixLensType,
  StockMatrixError,
} from "@/app/lib/stock-matrix-data";

/**
 * GET /api/inventory/stock-matrix/product?lensType=&key=
 * One product's SPH × CYL matrix: current (read-only), threshold, target.
 */
export async function GET(req: NextRequest) {
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

  const lensType = req.nextUrl.searchParams.get("lensType");
  const key = req.nextUrl.searchParams.get("key");
  if (!isMatrixLensType(lensType) || !key || key.length > 2000) {
    return NextResponse.json({ error: "lensType and key are required." }, { status: 400 });
  }
  try {
    const product = await getProductMatrix({ lensType, key });
    return NextResponse.json({ ...product, canEdit: session.role === "ADMIN" });
  } catch (error) {
    if (error instanceof StockMatrixError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("GET /api/inventory/stock-matrix/product error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
