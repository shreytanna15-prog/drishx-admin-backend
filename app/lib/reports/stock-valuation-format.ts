import { LensType } from "@prisma/client";
import {
  DISABLED_COUNT_SCOPE,
  INVENTORY_LENS_FAMILIES_LABEL,
  INVENTORY_REPORT_ROW_LIMIT,
  SUPPORTED_INVENTORY_REPORT_LENS_TYPES,
  formatInventoryPowerLabel,
  type InventoryCatalogRowInput,
} from "./inventory-stock-format";
import type { ReportCardsPayload, ReportColumn } from "./types";

/**
 * Families that expose Prisma `costPrice` (optional Decimal?).
 * OriVision, Magnus, and Bifocal have no cost field in schema.
 */
export const COST_PRICE_FIELD_LENS_TYPES: readonly LensType[] = [
  LensType.SINGLE_VISION,
  LensType.KRYPTOK,
  LensType.PROGRESSIVE,
] as const;

export const NO_COST_PRICE_FIELD_LENS_TYPES: readonly LensType[] = [
  LensType.ORI_VISION,
  LensType.MAGNUS,
  LensType.BIFOCAL,
] as const;

export const COST_PRICE_FIELD_SCOPE =
  "Cost price field exists on SINGLE_VISION, KRYPTOK, and PROGRESSIVE only (optional costPrice). ORI_VISION, MAGNUS, and BIFOCAL have no costPrice column — cost valuation is unavailable for those families.";

export const SELLING_PRICE_FIELD_SCOPE =
  "Selling price = catalog `price` on all six lens families (required Decimal in schema).";

export function lensFamilyHasCostPriceField(
  lensType: LensType | string
): boolean {
  return (COST_PRICE_FIELD_LENS_TYPES as readonly string[]).includes(lensType);
}

/** Finite unit cost when the family supports costPrice and a value is present. */
export function resolveUnitCostPrice(
  row: Pick<InventoryCatalogRowInput, "lensType" | "costPrice">
): number | null {
  if (!lensFamilyHasCostPriceField(row.lensType)) return null;
  const n = row.costPrice;
  if (n == null || !Number.isFinite(n)) return null;
  return n;
}

/** Finite unit selling price from catalog `price`. */
export function resolveUnitSellingPrice(
  row: Pick<InventoryCatalogRowInput, "sellingPrice">
): number | null {
  const n = row.sellingPrice;
  if (n == null || !Number.isFinite(n)) return null;
  return n;
}

/**
 * Line valuation = onHand × unit. Returns null when unit price is unknown
 * (never treat missing price as zero). Zero on-hand with known unit → 0.
 */
export function lineValuation(
  onHand: number,
  unitPrice: number | null
): number | null {
  if (unitPrice == null) return null;
  if (!Number.isFinite(onHand) || !Number.isFinite(unitPrice)) return null;
  return onHand * unitPrice;
}

export type StockValuationLine = {
  lensType: LensType;
  lensId: string;
  category: string;
  brand: string;
  item: string;
  coating: string;
  power: string;
  onHand: number;
  unitCost: number | null;
  unitSelling: number | null;
  costValuation: number | null;
  sellingValuation: number | null;
  costStatus: string;
  sellingStatus: string;
};

export type StockValuationTotals = {
  enabledSkuCount: number;
  disabledProductCount: number;
  totalOnHandEnabled: number;
  /** Sum of onHand × cost for SKUs with known unit cost only. */
  costKnownSubtotal: number;
  /** Sum of onHand × selling for SKUs with known unit selling only. */
  sellingKnownSubtotal: number;
  costValuationComplete: boolean;
  sellingValuationComplete: boolean;
  skusWithKnownCost: number;
  skusWithMissingCost: number;
  skusMissingCostOnStocked: number;
  skusMissingCostOnZeroStock: number;
  skusWithKnownSelling: number;
  skusWithMissingSelling: number;
  skusMissingSellingOnStocked: number;
  skusMissingSellingOnZeroStock: number;
  onHandCoveredByKnownCost: number;
  onHandCoveredByKnownSelling: number;
  onHandMissingCost: number;
  onHandMissingSelling: number;
  familiesWithoutCostField: string;
  costCoverageNote: string;
  sellingCoverageNote: string;
};

function displayOrDash(value: string | null | undefined): string {
  const t = value?.trim();
  return t ? t : "—";
}

function costStatusLabel(
  lensType: LensType,
  unitCost: number | null
): string {
  if (!lensFamilyHasCostPriceField(lensType)) {
    return "Unavailable (no costPrice field)";
  }
  if (unitCost == null) return "Missing costPrice";
  return "Known";
}

function sellingStatusLabel(unitSelling: number | null): string {
  if (unitSelling == null) return "Missing price";
  return "Known";
}

export function buildStockValuationLines(
  catalog: InventoryCatalogRowInput[]
): {
  lines: StockValuationLine[];
  disabledProductCount: number;
} {
  let disabledProductCount = 0;
  const lines: StockValuationLine[] = [];

  for (const row of catalog) {
    if (row.isDisabled) {
      disabledProductCount += 1;
      continue;
    }
    const unitCost = resolveUnitCostPrice(row);
    const unitSelling = resolveUnitSellingPrice(row);
    lines.push({
      lensType: row.lensType,
      lensId: row.lensId,
      category: displayOrDash(row.category),
      brand: displayOrDash(row.brand),
      item: displayOrDash(row.item),
      coating: displayOrDash(row.coating),
      power: formatInventoryPowerLabel(row),
      onHand: row.onHand,
      unitCost,
      unitSelling,
      costValuation: lineValuation(row.onHand, unitCost),
      sellingValuation: lineValuation(row.onHand, unitSelling),
      costStatus: costStatusLabel(row.lensType, unitCost),
      sellingStatus: sellingStatusLabel(unitSelling),
    });
  }

  return { lines, disabledProductCount };
}

export function summarizeStockValuation(
  lines: StockValuationLine[],
  disabledProductCount: number
): StockValuationTotals {
  let costKnownSubtotal = 0;
  let sellingKnownSubtotal = 0;
  let totalOnHandEnabled = 0;
  let skusWithKnownCost = 0;
  let skusWithMissingCost = 0;
  let skusMissingCostOnStocked = 0;
  let skusMissingCostOnZeroStock = 0;
  let skusWithKnownSelling = 0;
  let skusWithMissingSelling = 0;
  let skusMissingSellingOnStocked = 0;
  let skusMissingSellingOnZeroStock = 0;
  let onHandCoveredByKnownCost = 0;
  let onHandCoveredByKnownSelling = 0;
  let onHandMissingCost = 0;
  let onHandMissingSelling = 0;

  for (const line of lines) {
    const stocked = line.onHand > 0;
    totalOnHandEnabled += line.onHand;

    if (line.unitCost != null) {
      skusWithKnownCost += 1;
      costKnownSubtotal += line.costValuation ?? 0;
      onHandCoveredByKnownCost += line.onHand;
    } else {
      skusWithMissingCost += 1;
      onHandMissingCost += line.onHand;
      if (stocked) skusMissingCostOnStocked += 1;
      else skusMissingCostOnZeroStock += 1;
    }

    if (line.unitSelling != null) {
      skusWithKnownSelling += 1;
      sellingKnownSubtotal += line.sellingValuation ?? 0;
      onHandCoveredByKnownSelling += line.onHand;
    } else {
      skusWithMissingSelling += 1;
      onHandMissingSelling += line.onHand;
      if (stocked) skusMissingSellingOnStocked += 1;
      else skusMissingSellingOnZeroStock += 1;
    }
  }

  const costValuationComplete =
    lines.length > 0 && skusWithMissingCost === 0;
  const sellingValuationComplete =
    lines.length > 0 && skusWithMissingSelling === 0;

  const familiesWithoutCostField = NO_COST_PRICE_FIELD_LENS_TYPES.join(", ");

  const costCoverageNote = costValuationComplete
    ? "Cost valuation is complete for all enabled SKUs (every SKU has a known unit cost)."
    : skusWithMissingCost > 0
      ? `Cost valuation is a known subtotal only — incomplete. ${skusWithMissingCost} enabled SKU(s) lack a usable cost (${skusMissingCostOnStocked} with on-hand > 0). Families without a costPrice field: ${familiesWithoutCostField}. Missing cost is never treated as ₹0.`
      : "No enabled catalog rows.";

  const sellingCoverageNote = sellingValuationComplete
    ? "Selling valuation is complete for all enabled SKUs (every SKU has a known catalog price)."
    : skusWithMissingSelling > 0
      ? `Selling valuation is a known subtotal only — incomplete. ${skusWithMissingSelling} enabled SKU(s) lack a usable selling price (${skusMissingSellingOnStocked} with on-hand > 0). Missing selling price is never treated as ₹0.`
      : "No enabled catalog rows.";

  return {
    enabledSkuCount: lines.length,
    disabledProductCount,
    totalOnHandEnabled,
    costKnownSubtotal,
    sellingKnownSubtotal,
    costValuationComplete,
    sellingValuationComplete,
    skusWithKnownCost,
    skusWithMissingCost,
    skusMissingCostOnStocked,
    skusMissingCostOnZeroStock,
    skusWithKnownSelling,
    skusWithMissingSelling,
    skusMissingSellingOnStocked,
    skusMissingSellingOnZeroStock,
    onHandCoveredByKnownCost,
    onHandCoveredByKnownSelling,
    onHandMissingCost,
    onHandMissingSelling,
    familiesWithoutCostField,
    costCoverageNote,
    sellingCoverageNote,
  };
}

const VALUATION_COLUMNS: ReportColumn[] = [
  { key: "lensType", label: "Lens type" },
  { key: "category", label: "Category" },
  { key: "brand", label: "Brand" },
  { key: "item", label: "Item" },
  { key: "coating", label: "Coating" },
  { key: "power", label: "Power" },
  { key: "onHand", label: "On hand", align: "right" },
  { key: "unitCost", label: "Unit cost", align: "right" },
  { key: "costValuation", label: "Cost valuation", align: "right" },
  { key: "costStatus", label: "Cost status" },
  { key: "unitSelling", label: "Unit selling", align: "right" },
  { key: "sellingValuation", label: "Selling valuation", align: "right" },
  { key: "sellingStatus", label: "Selling status" },
];

/**
 * Detail rows: enabled SKUs with on-hand > 0 that have at least one known
 * unit price (cost and/or selling). Zero-stock and fully unpriced SKUs are
 * covered in summary counts only so the table stays actionable.
 */
export function selectStockValuationDetailRows(
  lines: StockValuationLine[]
): StockValuationLine[] {
  return lines
    .filter(
      (line) =>
        line.onHand > 0 &&
        (line.unitCost != null || line.unitSelling != null)
    )
    .toSorted((a, b) => {
      const aVal = Math.max(a.sellingValuation ?? 0, a.costValuation ?? 0);
      const bVal = Math.max(b.sellingValuation ?? 0, b.costValuation ?? 0);
      if (bVal !== aVal) return bVal - aVal;
      if (b.onHand !== a.onHand) return b.onHand - a.onHand;
      return a.lensType.localeCompare(b.lensType);
    });
}

function cellMoneyOrNull(value: number | null): number | null {
  return value;
}

export function stockValuationToReportPayload(
  catalog: InventoryCatalogRowInput[],
  options?: { rowLimit?: number }
): ReportCardsPayload {
  const rowLimit = options?.rowLimit ?? INVENTORY_REPORT_ROW_LIMIT;
  const { lines, disabledProductCount } = buildStockValuationLines(catalog);
  const totals = summarizeStockValuation(lines, disabledProductCount);
  const detail = selectStockValuationDetailRows(lines);
  const displayed = detail.slice(0, rowLimit);
  const truncated = detail.length > displayed.length;

  return {
    kind: "cards",
    cards: [
      {
        label: "Cost valuation (known subtotal)",
        value: totals.costKnownSubtotal,
      },
      {
        label: "Selling valuation (known subtotal)",
        value: totals.sellingKnownSubtotal,
      },
      {
        label: "Enabled SKUs",
        value: totals.enabledSkuCount,
      },
      {
        label: "Disabled products",
        value: totals.disabledProductCount,
      },
    ],
    columns: VALUATION_COLUMNS,
    rows: displayed.map((line) => ({
      lensType: line.lensType,
      category: line.category,
      brand: line.brand,
      item: line.item,
      coating: line.coating,
      power: line.power,
      onHand: line.onHand,
      unitCost: cellMoneyOrNull(line.unitCost),
      costValuation: cellMoneyOrNull(line.costValuation),
      costStatus: line.costStatus,
      unitSelling: cellMoneyOrNull(line.unitSelling),
      sellingValuation: cellMoneyOrNull(line.sellingValuation),
      sellingStatus: line.sellingStatus,
    })),
    summary: {
      matchingCount: detail.length,
      returnedCount: displayed.length,
      enabledSkuCount: totals.enabledSkuCount,
      disabledProductCount: totals.disabledProductCount,
      disabledCountScope: DISABLED_COUNT_SCOPE,
      totalOnHand: totals.totalOnHandEnabled,
      costKnownSubtotal: totals.costKnownSubtotal,
      sellingKnownSubtotal: totals.sellingKnownSubtotal,
      costValuationComplete: totals.costValuationComplete ? "yes" : "no",
      sellingValuationComplete: totals.sellingValuationComplete ? "yes" : "no",
      skusWithKnownCost: totals.skusWithKnownCost,
      skusWithMissingCost: totals.skusWithMissingCost,
      skusMissingCostOnStocked: totals.skusMissingCostOnStocked,
      skusMissingCostOnZeroStock: totals.skusMissingCostOnZeroStock,
      skusWithKnownSelling: totals.skusWithKnownSelling,
      skusWithMissingSelling: totals.skusWithMissingSelling,
      skusMissingSellingOnStocked: totals.skusMissingSellingOnStocked,
      skusMissingSellingOnZeroStock: totals.skusMissingSellingOnZeroStock,
      onHandCoveredByKnownCost: totals.onHandCoveredByKnownCost,
      onHandCoveredByKnownSelling: totals.onHandCoveredByKnownSelling,
      onHandMissingCost: totals.onHandMissingCost,
      onHandMissingSelling: totals.onHandMissingSelling,
      familiesWithoutCostField: totals.familiesWithoutCostField,
      costPriceFieldScope: COST_PRICE_FIELD_SCOPE,
      sellingPriceFieldScope: SELLING_PRICE_FIELD_SCOPE,
      costCoverageNote: totals.costCoverageNote,
      sellingCoverageNote: totals.sellingCoverageNote,
      valuationBasis: "onHand × unit price (catalog quantity; not reserved/available)",
      lensFamilies: INVENTORY_LENS_FAMILIES_LABEL,
      coverageNote: truncated
        ? `Table shows first ${displayed.length} of ${detail.length} stocked SKUs with at least one known unit price. Summary totals cover the full enabled catalog.`
        : "Summary totals cover the full enabled catalog. Table lists stocked SKUs (on hand > 0) with at least one known unit price.",
    },
    meta: {
      truncated,
      rowLimit,
      supportedLensTypes: SUPPORTED_INVENTORY_REPORT_LENS_TYPES.join(","),
      mode: "stock-valuation",
      costValuationComplete: totals.costValuationComplete,
      sellingValuationComplete: totals.sellingValuationComplete,
    },
  };
}
