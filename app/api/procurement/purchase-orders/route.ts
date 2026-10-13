import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import { buildAuditRequestContext } from "@/app/lib/audit";
import {
  createDraftPurchaseOrder,
  listPurchaseOrders,
  serializePurchaseOrder,
  getPurchaseOrder,
} from "@/app/lib/purchase-orders";
import {
  parseDraftLines,
  parsePoStatus,
  purchaseOrderErrorResponse,
  requireProcurementView,
} from "@/app/lib/purchase-order-http";
import { MAIN_WAREHOUSE_CODE } from "@/app/lib/purchase-order-math";

/**
 * GET /api/procurement/purchase-orders
 * Access: ADMIN | EMPLOYEE (procurement.view)
 */
export async function GET(req: NextRequest) {
  const gate = await requireProcurementView(req);
  if ("error" in gate && gate.error) return gate.error;

  const status = parsePoStatus(req.nextUrl.searchParams.get("status"));
  if (req.nextUrl.searchParams.get("status") && !status) {
    return NextResponse.json({ error: "Invalid status filter." }, { status: 400 });
  }
  const limit = Math.min(
    Math.max(Number(req.nextUrl.searchParams.get("limit")) || 100, 1),
    300
  );

  try {
    const rows = await listPurchaseOrders({ status, limit });
    const suppliers = await prisma.supplier.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({
      purchaseOrders: rows.map((po) => ({
        id: po.id,
        publicId: po.publicId,
        status: po.status,
        supplierId: po.supplierId,
        supplier: po.supplier,
        warehouseCode: po.warehouseCode,
        expectedDelivery: po.expectedDelivery?.toISOString() ?? null,
        totalAmount: Number(po.totalAmount),
        lineCount: po.lines.length,
        createdAt: po.createdAt.toISOString(),
        updatedAt: po.updatedAt.toISOString(),
      })),
      suppliers,
      warehouseCodes: [MAIN_WAREHOUSE_CODE],
      count: rows.length,
    });
  } catch (error) {
    return purchaseOrderErrorResponse(error);
  }
}

/**
 * POST /api/procurement/purchase-orders
 * Create draft PO. Access: ADMIN | EMPLOYEE (procurement.view)
 */
export async function POST(req: NextRequest) {
  const gate = await requireProcurementView(req);
  if ("error" in gate && gate.error) return gate.error;
  const { actor } = gate;

  try {
    const body = await req.json();
    if (typeof body?.supplierId !== "string" || !body.supplierId.trim()) {
      return NextResponse.json({ error: "supplierId is required." }, { status: 400 });
    }
    const lines = parseDraftLines(body.lines);
    let expectedDelivery: Date | null = null;
    if (body.expectedDelivery) {
      expectedDelivery = new Date(body.expectedDelivery);
      if (Number.isNaN(expectedDelivery.getTime())) {
        return NextResponse.json(
          { error: "expectedDelivery is invalid." },
          { status: 400 }
        );
      }
    }

    const created = await createDraftPurchaseOrder({
      supplierId: body.supplierId.trim(),
      warehouseCode:
        typeof body.warehouseCode === "string"
          ? body.warehouseCode
          : MAIN_WAREHOUSE_CODE,
      expectedDelivery,
      notes: typeof body.notes === "string" ? body.notes : null,
      lines,
      actor,
      request: buildAuditRequestContext(req),
    });

    // Re-fetch with full include for serialize
    const full = (await getPurchaseOrder(created.id)) ?? created;
    return NextResponse.json(
      { purchaseOrder: serializePurchaseOrder(full) },
      { status: 201 }
    );
  } catch (error) {
    return purchaseOrderErrorResponse(error);
  }
}
