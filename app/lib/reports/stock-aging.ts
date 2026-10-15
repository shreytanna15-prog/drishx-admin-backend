import { LensType } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import { REPORT_EXPORT_ROW_LIMIT } from "./export-format";
import { formatInventoryPowerLabel } from "./inventory-stock-format";
import {
  STOCK_AGING_COLUMNS,
  buildStockAgingRows,
  mergeLastReceiptDates,
  summarizeStockAging,
  type StockAgingInputRow,
} from "./stock-aging-format";
import type { ReportTablePayload } from "./types";

function productLabel(row: {
  brand: string | null;
  item: string | null;
  category: string | null;
  coating: string | null;
}): string {
  return (
    [row.brand, row.item, row.category, row.coating]
      .filter(Boolean)
      .join(" · ") || "—"
  );
}

function numOrNull(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Latest RECEIVED StockMovement per lens, plus confirmed goods-receipt dates.
 * Existing stock without either source remains Unknown — never fabricated.
 */
export async function computeStockAgingReport(options?: {
  rowLimit?: number;
}): Promise<ReportTablePayload> {
  const now = new Date();

  const [sv, kryptok, progressive, movements, grLines] = await Promise.all([
    prisma.singleVisionLens.findMany({
      where: { isDisabled: false, quantity: { gt: 0 } },
      select: {
        id: true,
        brand: true,
        item: true,
        category: true,
        coating: true,
        sph: true,
        cyl: true,
        crossPower: true,
        quantity: true,
        costPrice: true,
      },
    }),
    prisma.kryptokLens.findMany({
      where: { isDisabled: false, quantity: { gt: 0 } },
      select: {
        id: true,
        brand: true,
        item: true,
        category: true,
        coating: true,
        sph: true,
        cyl: true,
        add: true,
        axis: true,
        crossPower: true,
        quantity: true,
        costPrice: true,
      },
    }),
    prisma.progressiveLens.findMany({
      where: { isDisabled: false, quantity: { gt: 0 } },
      select: {
        id: true,
        brand: true,
        item: true,
        category: true,
        coating: true,
        sph: true,
        cyl: true,
        add: true,
        axis: true,
        eye: true,
        quantity: true,
        costPrice: true,
      },
    }),
    prisma.stockMovement.findMany({
      where: { movementType: "RECEIVED" },
      select: {
        lensType: true,
        lensId: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.goodsReceiptLine.findMany({
      where: {
        lensType: { not: null },
        lensId: { not: null },
        acceptedQuantity: { gt: 0 },
        goodsReceipt: { status: "CONFIRMED", confirmedAt: { not: null } },
      },
      select: {
        lensType: true,
        lensId: true,
        goodsReceipt: { select: { confirmedAt: true } },
      },
    }),
  ]);

  const lastReceipt = new Map<string, Date>();
  for (const m of movements) {
    const key = `${m.lensType}::${m.lensId}`;
    if (!lastReceipt.has(key)) {
      lastReceipt.set(key, m.createdAt);
    }
  }
  for (const line of grLines) {
    if (!line.lensType || !line.lensId || !line.goodsReceipt.confirmedAt) {
      continue;
    }
    const key = `${line.lensType}::${line.lensId}`;
    lastReceipt.set(
      key,
      mergeLastReceiptDates(
        lastReceipt.get(key) ?? null,
        line.goodsReceipt.confirmedAt
      )!
    );
  }

  const inputs: StockAgingInputRow[] = [];

  for (const r of sv) {
    inputs.push({
      lensType: LensType.SINGLE_VISION,
      lensId: r.id,
      label: productLabel(r),
      power: formatInventoryPowerLabel({
        sph: numOrNull(r.sph),
        cyl: numOrNull(r.cyl),
        add: null,
        axis: null,
        eye: null,
        crossPower: numOrNull(r.crossPower),
      }),
      onHand: Number(r.quantity) || 0,
      unitCost: numOrNull(r.costPrice),
      lastReceiptAt:
        lastReceipt.get(`${LensType.SINGLE_VISION}::${r.id}`) ?? null,
    });
  }
  for (const r of kryptok) {
    inputs.push({
      lensType: LensType.KRYPTOK,
      lensId: r.id,
      label: productLabel(r),
      power: formatInventoryPowerLabel({
        sph: numOrNull(r.sph),
        cyl: numOrNull(r.cyl),
        add: numOrNull(r.add),
        axis: numOrNull(r.axis),
        eye: null,
        crossPower: numOrNull(r.crossPower),
      }),
      onHand: Number(r.quantity) || 0,
      unitCost: numOrNull(r.costPrice),
      lastReceiptAt: lastReceipt.get(`${LensType.KRYPTOK}::${r.id}`) ?? null,
    });
  }
  for (const r of progressive) {
    inputs.push({
      lensType: LensType.PROGRESSIVE,
      lensId: r.id,
      label: productLabel(r),
      power: formatInventoryPowerLabel({
        sph: numOrNull(r.sph),
        cyl: numOrNull(r.cyl),
        add: numOrNull(r.add),
        axis: numOrNull(r.axis),
        eye: r.eye ?? null,
        crossPower: null,
      }),
      onHand: Number(r.quantity) || 0,
      unitCost: numOrNull(r.costPrice),
      lastReceiptAt:
        lastReceipt.get(`${LensType.PROGRESSIVE}::${r.id}`) ?? null,
    });
  }

  const allRows = buildStockAgingRows(inputs, now);
  const summary = summarizeStockAging(allRows);
  const limit = options?.rowLimit ?? REPORT_EXPORT_ROW_LIMIT;
  const truncated = allRows.length > limit;
  const slice = truncated ? allRows.slice(0, limit) : allRows;

  return {
    kind: "table",
    columns: STOCK_AGING_COLUMNS,
    rows: slice,
    summary: {
      skuCount: slice.length,
      knownHistorySkus:
        summary["0-30"].skus +
        summary["31-60"].skus +
        summary["61-90"].skus +
        summary["90+"].skus,
      unknownHistorySkus: summary.Unknown.skus,
      unknownOnHand: summary.Unknown.onHand,
      truncated: truncated ? 1 : 0,
    },
    meta: {
      rowLimit: limit,
      truncated,
      totalMatching: allRows.length,
      bucket0_30_skus: summary["0-30"].skus,
      bucket31_60_skus: summary["31-60"].skus,
      bucket61_90_skus: summary["61-90"].skus,
      bucket90plus_skus: summary["90+"].skus,
      bucketUnknown_skus: summary.Unknown.skus,
      agingBuckets: "0–30 / 31–60 / 61–90 / 90+ / Unknown",
      ageMeasure:
        "Last-receipt recency only — not lot-level remaining-stock age",
    },
  };
}
