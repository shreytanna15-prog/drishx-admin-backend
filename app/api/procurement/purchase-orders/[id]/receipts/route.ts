import { NextRequest, NextResponse } from "next/server";
import { buildAuditRequestContext } from "@/app/lib/audit";
import {
  createGoodsReceiptWithDocuments,
  GoodsReceiptError,
  listGoodsReceiptsForPo,
  parseBillSummaries,
  serializeGoodsReceipt,
} from "@/app/lib/goods-receipts";
import {
  purchaseOrderErrorResponse,
  requireProcurementIntake,
  requireProcurementView,
} from "@/app/lib/purchase-order-http";
import { MAX_PROCUREMENT_DOC_BYTES } from "@/app/lib/procurement-documents";
import { supabaseProcurementStorage } from "@/app/lib/procurement-storage";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/procurement/purchase-orders/:id/receipts */
export async function GET(req: NextRequest, ctx: Ctx) {
  const gate = await requireProcurementView(req);
  if ("error" in gate && gate.error) return gate.error;
  try {
    const { id } = await ctx.params;
    const receipts = await listGoodsReceiptsForPo(id);
    return NextResponse.json({
      receipts: receipts.map((r) => ({
        id: r.id,
        publicId: r.publicId,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
        confirmedAt: r.confirmedAt?.toISOString() ?? null,
        acceptedUnits: r.lines.reduce((s, l) => s + l.acceptedQuantity, 0),
        billFileName: r.billFileName,
        billStored: Boolean(r.billStoragePath),
        excelFileName: r.excelFileName,
        excelStored: Boolean(r.excelStoragePath),
        courier: r.courier,
        awb: r.awb,
        purchaseBill: r.purchaseBill,
      })),
    });
  } catch (error) {
    return purchaseOrderErrorResponse(error);
  }
}

function parseJsonField(form: FormData, name: string): unknown {
  const raw = form.get(name);
  if (typeof raw !== "string" || !raw.trim()) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    throw new GoodsReceiptError(`${name} must be valid JSON.`, 400, "INVALID_JSON");
  }
}

async function readUpload(form: FormData, field: "excel" | "bill") {
  const file = form.get(field);
  const label = field === "excel" ? "Power-wise Excel" : "Supplier bill";
  if (!(file instanceof File) || file.size <= 0) {
    throw new GoodsReceiptError(`${label} is required.`, 400, "DOCUMENT_REQUIRED");
  }
  if (file.size > MAX_PROCUREMENT_DOC_BYTES) {
    throw new GoodsReceiptError(`${label} is larger than 12 MB.`, 400, "DOCUMENT_TOO_LARGE");
  }
  return { buffer: new Uint8Array(await file.arrayBuffer()), fileName: file.name || null };
}

/**
 * POST multipart: excel (required .xlsx), bill (required PDF/image),
 * billSummaries JSON, shipment JSON, lineActions JSON.
 * Stores both documents privately, then creates a draft GRN.
 * Never posts stock. Access: ADMIN | EMPLOYEE (procurement.intake).
 */
export async function POST(req: NextRequest, ctx: Ctx) {
  const gate = await requireProcurementIntake(req);
  if ("error" in gate && gate.error) return gate.error;
  const { actor } = gate;

  try {
    const { id: purchaseOrderId } = await ctx.params;
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      throw new GoodsReceiptError("Expected multipart form data.", 400, "INVALID_FORM");
    }
    const excel = await readUpload(form, "excel");
    const bill = await readUpload(form, "bill");
    const billSummaries = parseBillSummaries(parseJsonField(form, "billSummaries"));

    const shipmentRaw = parseJsonField(form, "shipment");
    const s = (
      shipmentRaw && typeof shipmentRaw === "object" ? shipmentRaw : {}
    ) as Record<string, unknown>;
    const dispatchDate =
      typeof s.dispatchDate === "string" && s.dispatchDate.trim()
        ? new Date(s.dispatchDate)
        : null;
    const packageCount =
      s.packageCount === undefined || s.packageCount === null || s.packageCount === ""
        ? null
        : Number(s.packageCount);

    const actionsRaw = parseJsonField(form, "lineActions");
    const lineActions =
      actionsRaw && typeof actionsRaw === "object" && !Array.isArray(actionsRaw)
        ? Object.fromEntries(
            Object.entries(actionsRaw as Record<string, unknown>).filter(
              (entry): entry is [string, string] => typeof entry[1] === "string"
            )
          )
        : undefined;

    const created = await createGoodsReceiptWithDocuments({
      purchaseOrderId,
      excel,
      bill,
      billSummaries,
      shipment: {
        courier: typeof s.courier === "string" ? s.courier : null,
        awb: typeof s.awb === "string" ? s.awb : null,
        notes: typeof s.notes === "string" ? s.notes : null,
        packageCount,
        dispatchDate,
      },
      lineActions,
      storage: supabaseProcurementStorage,
      actor,
      request: buildAuditRequestContext(req),
    });

    return NextResponse.json(
      { receipt: serializeGoodsReceipt(created) },
      { status: 201 }
    );
  } catch (error) {
    return purchaseOrderErrorResponse(error);
  }
}
