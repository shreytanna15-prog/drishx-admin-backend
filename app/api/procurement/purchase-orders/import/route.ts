import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/app/lib/prisma";
import {
  buildPoImportTemplate,
  parsePoImportWorkbook,
} from "@/app/lib/purchase-order-import";
import { listOpenProcurementQueue, powerKey } from "@/app/lib/purchase-orders";
import { formatLensPower, readLensDescriptor } from "@/app/lib/procurement-lens";
import {
  purchaseOrderErrorResponse,
  requireProcurementView,
} from "@/app/lib/purchase-order-http";
import { MAX_PROCUREMENT_DOC_BYTES } from "@/app/lib/procurement-documents";

/**
 * GET /api/procurement/purchase-orders/import
 * Downloads the import template, pre-filled with the open reorder queue.
 */
export async function GET(req: NextRequest) {
  const gate = await requireProcurementView(req);
  if ("error" in gate && gate.error) return gate.error;
  try {
    const queue = await listOpenProcurementQueue();
    const byPower = new Map<string, { lensType: string; lensId: string; product: string | null; power: string | null; required: number }>();
    for (const item of queue) {
      if (item.openPurchaseOrder) continue;
      const key = powerKey(item.lensType, item.lensId);
      const existing = byPower.get(key);
      if (existing) existing.required += item.unallocatedQuantity;
      else
        byPower.set(key, {
          lensType: item.lensType,
          lensId: item.lensId,
          product: item.productLabel,
          power: item.powerLabel,
          required: item.unallocatedQuantity,
        });
    }
    const buffer = await buildPoImportTemplate([...byPower.values()]);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="purchase-order-import-template.xlsx"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return purchaseOrderErrorResponse(error);
  }
}

/**
 * POST /api/procurement/purchase-orders/import  (multipart: file)
 * Parses and validates lines against the catalog. Creates nothing — the
 * returned lines are added to the draft in the Create PO wizard.
 */
export async function POST(req: NextRequest) {
  const gate = await requireProcurementView(req);
  if ("error" in gate && gate.error) return gate.error;
  try {
    let form: FormData;
    try {
      form = await req.formData();
    } catch {
      return NextResponse.json({ error: "Expected multipart form data." }, { status: 400 });
    }
    const file = form.get("file");
    if (!(file instanceof File) || file.size <= 0) {
      return NextResponse.json({ error: "Choose an .xlsx file to import." }, { status: 400 });
    }
    if (file.size > MAX_PROCUREMENT_DOC_BYTES) {
      return NextResponse.json({ error: "File is larger than 12 MB." }, { status: 400 });
    }
    const parsed = await parsePoImportWorkbook(new Uint8Array(await file.arrayBuffer()));
    if (parsed.errors.length) {
      return NextResponse.json(
        { error: "The import file has errors. Nothing was added.", code: "PO_IMPORT_INVALID", errors: parsed.errors, warnings: parsed.warnings },
        { status: 400 }
      );
    }

    const errors: string[] = [];
    const warnings = [...parsed.warnings];
    const locks = await prisma.openPurchaseOrderPower.findMany({
      where: { OR: parsed.rows.map((r) => ({ lensType: r.lensType, lensId: r.lensId })) },
      include: { purchaseOrder: { select: { publicId: true } } },
    });
    const lockByPower = new Map(locks.map((l) => [powerKey(l.lensType, l.lensId), l.purchaseOrder.publicId]));

    const lines = [];
    for (const row of parsed.rows) {
      const lens = await readLensDescriptor(prisma, row.lensType, row.lensId);
      if (!lens) {
        errors.push(`Row ${row.rowNumber}: lens ${row.lensId} was not found in the ${row.lensType} catalog.`);
        continue;
      }
      if (lens.isDisabled) {
        warnings.push(`Row ${row.rowNumber}: this power is disabled in the catalog.`);
      }
      const openPo = lockByPower.get(powerKey(row.lensType, row.lensId));
      if (openPo) {
        warnings.push(
          `Row ${row.rowNumber}: ${openPo} is still open for this power — the new PO cannot be approved until it is closed.`
        );
      }
      lines.push({
        lensType: row.lensType,
        lensId: row.lensId,
        requiredQuantity: row.requiredQuantity,
        poQuantity: row.poQuantity,
        rate: row.rate,
        productLabel: [lens.brand, lens.item, lens.coating].filter(Boolean).join(" · ") || "Lens",
        powerLabel: formatLensPower(lens),
        openPurchaseOrder: openPo ?? null,
      });
    }
    if (errors.length) {
      return NextResponse.json(
        { error: "Some rows could not be matched to the catalog. Nothing was added.", code: "PO_IMPORT_INVALID", errors, warnings },
        { status: 400 }
      );
    }
    return NextResponse.json({ lines, warnings });
  } catch (error) {
    return purchaseOrderErrorResponse(error);
  }
}
