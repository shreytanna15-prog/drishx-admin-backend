import { NextRequest, NextResponse } from "next/server";
import { buildAuditRequestContext } from "@/app/lib/audit";
import {
  getPurchaseOrder,
  replaceDraftLines,
  serializePurchaseOrder,
} from "@/app/lib/purchase-orders";
import {
  parseDraftLines,
  purchaseOrderErrorResponse,
  requireProcurementView,
} from "@/app/lib/purchase-order-http";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/procurement/purchase-orders/:id
 */
export async function GET(req: NextRequest, ctx: Ctx) {
  const gate = await requireProcurementView(req);
  if ("error" in gate && gate.error) return gate.error;

  try {
    const { id } = await ctx.params;
    const po = await getPurchaseOrder(id);
    if (!po) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    return NextResponse.json({ purchaseOrder: serializePurchaseOrder(po) });
  } catch (error) {
    return purchaseOrderErrorResponse(error);
  }
}

/**
 * PATCH /api/procurement/purchase-orders/:id
 * Replace draft header + lines.
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const gate = await requireProcurementView(req);
  if ("error" in gate && gate.error) return gate.error;
  const { actor } = gate;

  try {
    const { id } = await ctx.params;
    const body = await req.json();
    const lines = parseDraftLines(body.lines);

    let expectedDelivery: Date | null | undefined = undefined;
    if (body.expectedDelivery === null) expectedDelivery = null;
    else if (body.expectedDelivery != null) {
      expectedDelivery = new Date(body.expectedDelivery);
      if (Number.isNaN(expectedDelivery.getTime())) {
        return NextResponse.json(
          { error: "expectedDelivery is invalid." },
          { status: 400 }
        );
      }
    }

    const updated = await replaceDraftLines({
      purchaseOrderId: id,
      supplierId:
        typeof body.supplierId === "string" ? body.supplierId.trim() : undefined,
      warehouseCode:
        typeof body.warehouseCode === "string" ? body.warehouseCode : undefined,
      expectedDelivery,
      notes: typeof body.notes === "string" ? body.notes : undefined,
      lines,
      actor,
      request: buildAuditRequestContext(req),
    });

    return NextResponse.json({ purchaseOrder: serializePurchaseOrder(updated) });
  } catch (error) {
    return purchaseOrderErrorResponse(error);
  }
}
