import { NextRequest, NextResponse } from "next/server";
import { buildAuditRequestContext } from "@/app/lib/audit";
import {
  createSupplier,
  listSuppliers,
  readJsonBody,
  requireSupplierEdit,
  requireSupplierView,
  serializeSupplier,
  supplierErrorResponse,
} from "@/app/lib/suppliers";

/**
 * GET /api/procurement/suppliers?search=&includeInactive=true&page=&pageSize=
 * ADMIN, or EMPLOYEE with procurement.view.
 */
export async function GET(req: NextRequest) {
  const gate = await requireSupplierView(req);
  if ("error" in gate) return gate.error;

  try {
    const sp = req.nextUrl.searchParams;
    const page = Number(sp.get("page") ?? "1");
    const pageSize = Number(sp.get("pageSize") ?? "");
    const result = await listSuppliers({
      search: sp.get("search"),
      includeInactive: sp.get("includeInactive") === "true",
      page: Number.isFinite(page) ? page : 1,
      pageSize: Number.isFinite(pageSize) && pageSize > 0 ? pageSize : undefined,
    });
    return NextResponse.json({
      suppliers: result.suppliers.map(serializeSupplier),
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      canEdit: gate.canEdit,
    });
  } catch (error) {
    return supplierErrorResponse(error, "GET /api/procurement/suppliers");
  }
}

/**
 * POST /api/procurement/suppliers — ADMIN only.
 */
export async function POST(req: NextRequest) {
  const gate = await requireSupplierEdit(req);
  if ("error" in gate) return gate.error;

  try {
    const body = await readJsonBody(req);
    const supplier = await createSupplier(
      body,
      gate.actor,
      buildAuditRequestContext(req)
    );
    return NextResponse.json({ supplier: serializeSupplier(supplier) }, { status: 201 });
  } catch (error) {
    return supplierErrorResponse(error, "POST /api/procurement/suppliers");
  }
}
