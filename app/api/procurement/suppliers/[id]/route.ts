import { NextRequest, NextResponse } from "next/server";
import { buildAuditRequestContext } from "@/app/lib/audit";
import {
  getSupplier,
  readJsonBody,
  requireSupplierEdit,
  requireSupplierView,
  serializeSupplier,
  supplierErrorResponse,
  updateSupplier,
} from "@/app/lib/suppliers";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/procurement/suppliers/:id
 */
export async function GET(req: NextRequest, ctx: Ctx) {
  const gate = await requireSupplierView(req);
  if ("error" in gate) return gate.error;

  try {
    const { id } = await ctx.params;
    const supplier = await getSupplier(id);
    if (!supplier) {
      return NextResponse.json(
        { error: "Supplier not found.", code: "SUPPLIER_NOT_FOUND" },
        { status: 404 }
      );
    }
    return NextResponse.json({
      supplier: serializeSupplier(supplier),
      canEdit: gate.canEdit,
    });
  } catch (error) {
    return supplierErrorResponse(error, "GET /api/procurement/suppliers/[id]");
  }
}

/**
 * PATCH /api/procurement/suppliers/:id — ADMIN only. Partial update; also
 * accepts `{ isActive: boolean }` to deactivate / reactivate.
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const gate = await requireSupplierEdit(req);
  if ("error" in gate) return gate.error;

  try {
    const { id } = await ctx.params;
    const body = await readJsonBody(req);
    const { supplier, warning } = await updateSupplier(
      id,
      body,
      gate.actor,
      buildAuditRequestContext(req)
    );
    return NextResponse.json({ supplier: serializeSupplier(supplier), warning });
  } catch (error) {
    return supplierErrorResponse(error, "PATCH /api/procurement/suppliers/[id]");
  }
}
