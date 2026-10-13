import { NextRequest, NextResponse } from "next/server";
import { getSessionOrUnauthorized } from "@/app/lib/session-auth";
import { requireStaffPermission } from "@/app/lib/staff-access";
import {
  getMatrixFilterOptions,
  isMatrixLensType,
  listMatrixProducts,
  StockMatrixError,
} from "@/app/lib/stock-matrix-data";

/**
 * GET /api/inventory/stock-matrix
 *   ?lensType=SINGLE_VISION&category=&brand=&index=&coating=&search=&page=&pageSize=
 * Paginated product list for the power matrix + filter options.
 * Access: ADMIN | EMPLOYEE (inventory.view). Editing is admin-only (`canEdit`).
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

  const params = req.nextUrl.searchParams;
  const lensType = params.get("lensType") || "SINGLE_VISION";
  if (!isMatrixLensType(lensType)) {
    return NextResponse.json({ error: "Invalid lensType." }, { status: 400 });
  }
  const text = (name: string) => {
    const value = params.get(name)?.trim();
    return value ? value.slice(0, 120) : null;
  };

  try {
    const filters = {
      category: text("category"),
      brand: text("brand"),
      index: text("index"),
      coating: text("coating"),
      search: text("search"),
    };
    const [list, options] = await Promise.all([
      listMatrixProducts({
        lensType,
        filters,
        page: Number(params.get("page")) || 1,
        pageSize: Number(params.get("pageSize")) || 20,
      }),
      getMatrixFilterOptions(lensType, filters.category),
    ]);
    return NextResponse.json({ ...list, options, canEdit: session.role === "ADMIN" });
  } catch (error) {
    if (error instanceof StockMatrixError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
    }
    console.error("GET /api/inventory/stock-matrix error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
