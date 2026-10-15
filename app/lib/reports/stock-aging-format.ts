/**
 * Stock aging helpers.
 *
 * Lot-level remaining-stock age cannot be reconstructed from current data.
 * When a last-receipt date exists we expose a **last-receipt recency** bucket
 * (0–30 / 31–60 / 61–90 / 90+), explicitly labeled as an approximation — not
 * the exact age of all on-hand units. Quantities with no receipt history are
 * Unknown. Receipt dates are never fabricated.
 */

import { agingBucket } from "./aging";

export type StockAgingInputRow = {
  lensType: string;
  lensId: string;
  label: string;
  power: string;
  onHand: number;
  unitCost: number | null;
  lastReceiptAt: Date | null;
};

export type StockAgingBucket =
  | "0-30"
  | "31-60"
  | "61-90"
  | "90+"
  | "Unknown";

export function classifyLastReceiptRecency(
  lastReceiptAt: Date | null,
  now: Date = new Date()
): StockAgingBucket {
  if (!lastReceiptAt) return "Unknown";
  return agingBucket(lastReceiptAt, now);
}

/** @deprecated Use classifyLastReceiptRecency — exact stock age is not supported. */
export function classifyStockAge(
  lastReceiptAt: Date | null,
  now: Date = new Date()
): StockAgingBucket {
  return classifyLastReceiptRecency(lastReceiptAt, now);
}

export function daysSinceReceipt(
  lastReceiptAt: Date | null,
  now: Date = new Date()
): number | null {
  if (!lastReceiptAt) return null;
  return Math.floor(
    (now.getTime() - lastReceiptAt.getTime()) / (1000 * 60 * 60 * 24)
  );
}

export function mergeLastReceiptDates(
  a: Date | null | undefined,
  b: Date | null | undefined
): Date | null {
  if (!a) return b ?? null;
  if (!b) return a;
  return a.getTime() >= b.getTime() ? a : b;
}

export function buildStockAgingRows(
  inputs: StockAgingInputRow[],
  now: Date = new Date()
) {
  return inputs
    .filter((r) => r.onHand > 0)
    .map((r) => {
      const bucket = classifyLastReceiptRecency(r.lastReceiptAt, now);
      const days = daysSinceReceipt(r.lastReceiptAt, now);
      const costVal =
        r.unitCost != null && Number.isFinite(r.unitCost)
          ? Math.round(r.unitCost * r.onHand * 100) / 100
          : null;
      const isUnknown = bucket === "Unknown";
      return {
        lensType: r.lensType,
        label: r.label,
        power: r.power,
        onHand: r.onHand,
        lastReceiptAt: r.lastReceiptAt
          ? r.lastReceiptAt.toISOString().slice(0, 10)
          : null,
        daysSinceLastReceipt: days,
        recencyBucket: bucket,
        /** Exact remaining-stock age is unverifiable without lot tracking. */
        ageMeasure: isUnknown
          ? "Unknown"
          : "Last-receipt recency (not lot-level stock age)",
        historyStatus: isUnknown
          ? "No receipt history — age Unknown"
          : "Approximation from last known receipt only",
        unitCost: r.unitCost,
        costValuation: costVal,
      };
    })
    .toSorted((a, b) => {
      const order: Record<StockAgingBucket, number> = {
        Unknown: 0,
        "90+": 1,
        "61-90": 2,
        "31-60": 3,
        "0-30": 4,
      };
      const ao = order[a.recencyBucket as StockAgingBucket] ?? 9;
      const bo = order[b.recencyBucket as StockAgingBucket] ?? 9;
      return (
        ao - bo ||
        (b.daysSinceLastReceipt ?? -1) - (a.daysSinceLastReceipt ?? -1) ||
        a.label.localeCompare(b.label)
      );
    });
}

export function summarizeStockAging(
  rows: ReturnType<typeof buildStockAgingRows>
) {
  const byBucket: Record<StockAgingBucket, { skus: number; onHand: number }> = {
    "0-30": { skus: 0, onHand: 0 },
    "31-60": { skus: 0, onHand: 0 },
    "61-90": { skus: 0, onHand: 0 },
    "90+": { skus: 0, onHand: 0 },
    Unknown: { skus: 0, onHand: 0 },
  };
  for (const row of rows) {
    const b = row.recencyBucket as StockAgingBucket;
    byBucket[b].skus += 1;
    byBucket[b].onHand += row.onHand;
  }
  return byBucket;
}

export const STOCK_AGING_COLUMNS = [
  { key: "recencyBucket", label: "Recency bucket" },
  { key: "ageMeasure", label: "Age measure" },
  { key: "historyStatus", label: "History" },
  { key: "lensType", label: "Lens type" },
  { key: "label", label: "Product" },
  { key: "power", label: "Power" },
  { key: "onHand", label: "On hand", align: "right" as const },
  { key: "lastReceiptAt", label: "Last receipt" },
  { key: "daysSinceLastReceipt", label: "Days since receipt", align: "right" as const },
  { key: "unitCost", label: "Unit cost", align: "right" as const },
  { key: "costValuation", label: "Cost valuation", align: "right" as const },
];
