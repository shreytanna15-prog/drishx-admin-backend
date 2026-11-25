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
import { resolveDraftLineCatalogIdentity } from "@/app/lib/catalog/catalog-po-resolve";
import { normalizeStockPower } from "@/app/lib/catalog/lens-product-stock-core";
import { Prisma } from "@prisma/client";

/**
 * GET /api/procurement/purchase-orders/import
 * Downloads the import template, pre-filled with the open reorder queue.
 */
export async function GET(req: NextRequest) {
  const gate = await requireProcurementView(req);
  if ("error" in gate && gate.error) return gate.error;
  try {
    const queue = await listOpenProcurementQueue();
    const byPower = new Map<string, {
      lensProductPowerId: string | null;
      skuCode: string | null;
      sph: number | null;
      cyl: number | null;
      lensType: string | null;
      lensId: string | null;
      product: string | null;
      power: string | null;
      required: number;
    }>();
    for (const item of queue) {
      if (item.openPurchaseOrder) continue;
      const key = item.lensProductPowerId
        ? `power:${item.lensProductPowerId}`
        : powerKey(item.lensType!, item.lensId!);
      const existing = byPower.get(key);
      if (existing) existing.required += item.unallocatedQuantity;
      else
        byPower.set(key, {
          lensProductPowerId: item.lensProductPowerId,
          skuCode: item.skuCode ?? null,
          sph: item.sph ?? null,
          cyl: item.cyl ?? null,
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
      where: {
        OR: parsed.rows.flatMap((r) => [
          ...(r.lensProductPowerId ? [{ lensProductPowerId: r.lensProductPowerId }] : []),
          ...(r.lensType && r.lensId ? [{ lensType: r.lensType, lensId: r.lensId }] : []),
        ]),
      },
      include: { purchaseOrder: { select: { publicId: true } } },
    });
    const lockByPower = new Map<string, string>();
    for (const lock of locks) {
      if (lock.lensProductPowerId) lockByPower.set(`power:${lock.lensProductPowerId}`, lock.purchaseOrder.publicId);
      if (lock.lensType && lock.lensId) lockByPower.set(powerKey(lock.lensType, lock.lensId), lock.purchaseOrder.publicId);
    }

    const lines = [];
    for (const row of parsed.rows) {
      let powerId = row.lensProductPowerId;
      if (!powerId && row.skuCode && row.sph != null && row.cyl != null) {
        const sph = new Prisma.Decimal(normalizeStockPower(row.sph).toFixed(2));
        const cyl = new Prisma.Decimal(normalizeStockPower(row.cyl).toFixed(2));
        const leaf = await prisma.lensProductPower.findFirst({
          where: {
            sph,
            cyl,
            lensProductVariant: { skuCode: row.skuCode.trim() },
          },
          select: { id: true },
        });
        if (!leaf) {
          errors.push(`Row ${row.rowNumber}: no catalog leaf for SKU ${row.skuCode} SPH ${row.sph} CYL ${row.cyl}.`);
          continue;
        }
        powerId = leaf.id;
      }
      if (powerId) {
        const catalog = await resolveDraftLineCatalogIdentity(prisma, {
          ...row,
          lensProductPowerId: powerId,
        });
        if (!catalog) {
          errors.push(`Row ${row.rowNumber}: catalog stock leaf was not found.`);
          continue;
        }
        if (row.lensType && row.lensId &&
          (catalog.legacyLensType !== row.lensType || catalog.legacyLensId !== row.lensId)) {
          errors.push(`Row ${row.rowNumber}: catalog power and legacy lens columns identify different stock.`);
          continue;
        }
        const openPo = lockByPower.get(`power:${catalog.lensProductPowerId}`) ?? null;
        if (openPo) warnings.push(`Row ${row.rowNumber}: ${openPo} is still open for this power.`);
        lines.push({
          lensType: catalog.legacyLensType,
          lensId: catalog.legacyLensId,
          lensProductPowerId: catalog.lensProductPowerId,
          lensProductVariantId: catalog.lensProductVariantId,
          sph: catalog.sph,
          cyl: catalog.cyl,
          requiredQuantity: row.requiredQuantity,
          poQuantity: row.poQuantity,
          rate: row.rate,
          productLabel: `${catalog.skuCode} · ${catalog.productLabel}`,
          rangeLabel: catalog.rangeLabel,
          powerLabel: catalog.powerLabel,
          openPurchaseOrder: openPo,
        });
        continue;
      }
      if (!row.lensType || !row.lensId) continue;
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
        lensProductPowerId: null,
        lensProductVariantId: null,
        sph: null,
        cyl: null,
        requiredQuantity: row.requiredQuantity,
        poQuantity: row.poQuantity,
        rate: row.rate,
        productLabel: [lens.brand, lens.item, lens.coating].filter(Boolean).join(" · ") || "Lens",
        rangeLabel: null,
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
