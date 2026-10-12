import { LensType } from "@prisma/client";
import type { ReportColumn, ReportTablePayload } from "./types";

/**
 * Same formulas as order-inventory / procurement getCommittedQuantity /
 * getAvailableQuantity. Kept prisma-free so unit tests do not load the DB client.
 */
export function committedUnitsFromReservation(
  reservedQuantity: number,
  pickedQuantity: number
): number {
  return Math.max(0, reservedQuantity - pickedQuantity);
}

export function availableUnitsFromOnHand(
  onHand: number,
  committed: number
): number {
  return Math.max(0, onHand - committed);
}

/** Soft cap so a single report response stays manageable. */
export const INVENTORY_REPORT_ROW_LIMIT = 2000;

/**
 * All catalog families with quantity + Order FK fields.
 * Reserved/available use Order.reservedQuantity − pickedQuantity via those FKs
 * (same approach as procurement-requests). Operational pick/pack in
 * order-inventory / cart-reservations still only mutates SV/Kryptok/Progressive.
 */
export const SUPPORTED_INVENTORY_REPORT_LENS_TYPES: readonly LensType[] = [
  LensType.SINGLE_VISION,
  LensType.KRYPTOK,
  LensType.PROGRESSIVE,
  LensType.ORI_VISION,
  LensType.MAGNUS,
  LensType.BIFOCAL,
] as const;

export const INVENTORY_LENS_FAMILIES_LABEL =
  "SINGLE_VISION, KRYPTOK, PROGRESSIVE, ORI_VISION, MAGNUS, BIFOCAL";

/** Families that expose catalog isDisabled (others have no disabled flag). */
export const DISABLED_FLAG_LENS_TYPES: readonly LensType[] = [
  LensType.SINGLE_VISION,
  LensType.KRYPTOK,
  LensType.PROGRESSIVE,
] as const;

export const DISABLED_COUNT_SCOPE =
  "Count of catalog rows with isDisabled=true on SINGLE_VISION, KRYPTOK, and PROGRESSIVE only. OriVision, Magnus, and Bifocal have no disabled flag and are always treated as enabled.";

export type InventoryStockReportMode =
  | "current"
  | "reserved"
  | "available"
  | "product"
  | "power"
  | "out-of-stock"
  | "low-stock";

/** Physical empty shelf vs sellable qty exhausted by open reservations. */
export type OutOfStockClass = "physical" | "fully_committed";

export const OUT_OF_STOCK_CLASS_LABEL: Record<OutOfStockClass, string> = {
  physical: "Physical out of stock (on hand ≤ 0)",
  fully_committed: "Fully committed (available ≤ 0, on hand > 0)",
};

/**
 * Classify an enabled SKU for the Out of Stock report.
 * Physical takes precedence when onHand ≤ 0 (available is also ≤ 0 by construction).
 * Returns null when the SKU is neither physically empty nor unavailable.
 */
export function classifyOutOfStock(pos: {
  onHand: number;
  available: number;
}): OutOfStockClass | null {
  if (pos.onHand <= 0) return "physical";
  if (pos.available <= 0) return "fully_committed";
  return null;
}

/**
 * Same threshold as procurement runReorderCheck:
 * low when available is not strictly above minStock (available <= minStock).
 */
export function isLowStockAgainstMin(
  available: number,
  minStock: number
): boolean {
  return available <= minStock;
}

export type ActiveReorderRuleInput = {
  lensType: LensType;
  lensId: string;
  minStock: number;
  targetStock: number;
};

export type InventoryCatalogRowInput = {
  lensType: LensType;
  lensId: string;
  category: string | null;
  brand: string | null;
  item: string | null;
  coating: string | null;
  /** Progressive `type` (HC/HMC/…); empty for other families. */
  progressiveType: string | null;
  /** Catalog index when the family has one; null otherwise. */
  index: number | null;
  sph: number | null;
  cyl: number | null;
  add: number | null;
  axis: number | null;
  eye: string | null;
  crossPower: number | null;
  onHand: number;
  isDisabled: boolean;
  /**
   * Catalog cost when the family has `costPrice` (SV / Kryptok / Progressive).
   * Null means missing optional cost, or family has no cost field.
   */
  costPrice?: number | null;
  /** Catalog selling / list price (`price` on all six families). */
  sellingPrice?: number | null;
};

export type InventoryOrderCommitInput = {
  lensType: LensType;
  lensId: string | null;
  reservedQuantity: number;
  pickedQuantity: number;
};

export type InventoryStockPosition = {
  lensType: LensType;
  lensId: string;
  category: string;
  brand: string;
  item: string;
  coating: string;
  progressiveType: string;
  index: number | null;
  power: string;
  sph: number | null;
  cyl: number | null;
  add: number | null;
  axis: number | null;
  eye: string | null;
  crossPower: number | null;
  onHand: number;
  committed: number;
  available: number;
  isDisabled: boolean;
};

export type InventoryQtyTotals = {
  onHand: number;
  committed: number;
  available: number;
  rowCount: number;
};

export function inventoryStockKey(
  lensType: LensType | string,
  lensId: string
): string {
  return `${lensType}:${lensId}`;
}

function displayOrDash(value: string | null | undefined): string {
  const t = value?.trim();
  return t ? t : "—";
}

function keyPart(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function numKey(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "";
  return String(Math.round(value * 1000) / 1000);
}

export function formatInventoryPowerLabel(row: {
  sph: number | null;
  cyl: number | null;
  add: number | null;
  axis: number | null;
  eye: string | null;
  crossPower: number | null;
}): string {
  const parts: string[] = [];
  const fmt = (n: number) => {
    const rounded = Math.round(n * 100) / 100;
    return rounded > 0 ? `+${rounded.toFixed(2)}` : rounded.toFixed(2);
  };

  if (row.crossPower != null && Number.isFinite(row.crossPower)) {
    parts.push(`CROSS ${fmt(row.crossPower)}`);
  } else {
    if (row.sph != null && Number.isFinite(row.sph)) {
      parts.push(`SPH ${fmt(row.sph)}`);
    }
    if (row.cyl != null && Number.isFinite(row.cyl)) {
      parts.push(`CYL ${fmt(row.cyl)}`);
    }
  }
  if (row.axis != null && Number.isFinite(row.axis)) {
    parts.push(`AXIS ${row.axis}`);
  }
  if (row.add != null && Number.isFinite(row.add)) {
    parts.push(`ADD ${fmt(row.add)}`);
  }
  if (row.eye) {
    parts.push(row.eye);
  }
  return parts.length > 0 ? parts.join(" · ") : "—";
}

/**
 * Product identity: lens family + catalog product fields.
 * Index / progressive type included where present so unrelated variants do not merge.
 */
export function productIdentityKey(row: {
  lensType: LensType | string;
  category: string | null;
  brand: string | null;
  item: string | null;
  coating: string | null;
  progressiveType?: string | null;
  index?: number | null;
}): string {
  return [
    row.lensType,
    keyPart(row.category),
    keyPart(row.brand),
    keyPart(row.item),
    keyPart(row.coating),
    keyPart(row.progressiveType),
    numKey(row.index ?? null),
  ].join("|");
}

/**
 * Power-wise key: product identity + SPH/CYL/AXIS/ADD (+ eye / cross when present).
 * Keeps lens family and product distinctions.
 */
export function powerIdentityKey(row: {
  lensType: LensType | string;
  category: string | null;
  brand: string | null;
  item: string | null;
  coating: string | null;
  progressiveType?: string | null;
  index?: number | null;
  sph: number | null;
  cyl: number | null;
  add: number | null;
  axis: number | null;
  eye: string | null;
  crossPower: number | null;
}): string {
  return [
    productIdentityKey(row),
    numKey(row.crossPower),
    numKey(row.sph),
    numKey(row.cyl),
    numKey(row.axis),
    numKey(row.add),
    keyPart(row.eye),
  ].join("|");
}

export function sumInventoryQty(
  rows: Array<{ onHand: number; committed: number; available: number }>
): InventoryQtyTotals {
  let onHand = 0;
  let committed = 0;
  let available = 0;
  for (const row of rows) {
    onHand += row.onHand;
    committed += row.committed;
    available += row.available;
  }
  return { onHand, committed, available, rowCount: rows.length };
}

/**
 * Batch-reduce open-order lines into committed qty by lensType + lensId.
 * Same formula as getCommittedQuantity (per line, then summed).
 */
export function aggregateCommittedByLens(
  orders: InventoryOrderCommitInput[]
): Map<string, number> {
  const map = new Map<string, number>();
  for (const order of orders) {
    if (!order.lensId) continue;
    if (
      !SUPPORTED_INVENTORY_REPORT_LENS_TYPES.includes(
        order.lensType as LensType
      )
    ) {
      continue;
    }
    const key = inventoryStockKey(order.lensType, order.lensId);
    const units = committedUnitsFromReservation(
      order.reservedQuantity,
      order.pickedQuantity
    );
    map.set(key, (map.get(key) ?? 0) + units);
  }
  return map;
}

export function buildInventoryStockPositions(
  catalog: InventoryCatalogRowInput[],
  committedByKey: Map<string, number>
): InventoryStockPosition[] {
  return catalog.map((row) => {
    const committed =
      committedByKey.get(inventoryStockKey(row.lensType, row.lensId)) ?? 0;
    return {
      lensType: row.lensType,
      lensId: row.lensId,
      category: displayOrDash(row.category),
      brand: displayOrDash(row.brand),
      item: displayOrDash(row.item),
      coating: displayOrDash(row.coating),
      progressiveType: displayOrDash(row.progressiveType),
      index: row.index,
      power: formatInventoryPowerLabel(row),
      sph: row.sph,
      cyl: row.cyl,
      add: row.add,
      axis: row.axis,
      eye: row.eye,
      crossPower: row.crossPower,
      onHand: row.onHand,
      committed,
      available: availableUnitsFromOnHand(row.onHand, committed),
      isDisabled: row.isDisabled,
    };
  });
}

/** Split catalog into enabled report rows vs disabled count. */
export function partitionEnabledCatalog(
  positions: InventoryStockPosition[]
): {
  enabled: InventoryStockPosition[];
  disabledProductCount: number;
} {
  const enabled: InventoryStockPosition[] = [];
  let disabledProductCount = 0;
  for (const pos of positions) {
    if (pos.isDisabled) {
      disabledProductCount += 1;
    } else {
      enabled.push(pos);
    }
  }
  return { enabled, disabledProductCount };
}

export type ProductStockGroup = {
  lensType: string;
  category: string;
  brand: string;
  item: string;
  coating: string;
  progressiveType: string;
  index: string;
  skuCount: number;
  onHand: number;
  committed: number;
  available: number;
};

export type PowerStockGroup = {
  lensType: string;
  category: string;
  brand: string;
  item: string;
  coating: string;
  progressiveType: string;
  index: string;
  sph: string;
  cyl: string;
  axis: string;
  add: string;
  eye: string;
  power: string;
  skuCount: number;
  onHand: number;
  committed: number;
  available: number;
};

function formatIndexLabel(index: number | null): string {
  if (index == null || !Number.isFinite(index)) return "—";
  return String(index);
}

function formatPowerField(value: number | null, kind: "power" | "axis"): string {
  if (value == null || !Number.isFinite(value)) return "—";
  if (kind === "axis") return String(value);
  const rounded = Math.round(value * 100) / 100;
  return rounded > 0 ? `+${rounded.toFixed(2)}` : rounded.toFixed(2);
}

export function aggregateProductWise(
  positions: InventoryStockPosition[]
): ProductStockGroup[] {
  const map = new Map<string, ProductStockGroup>();
  for (const pos of positions) {
    const key = productIdentityKey({
      lensType: pos.lensType,
      category: pos.category === "—" ? "" : pos.category,
      brand: pos.brand === "—" ? "" : pos.brand,
      item: pos.item === "—" ? "" : pos.item,
      coating: pos.coating === "—" ? "" : pos.coating,
      progressiveType:
        pos.progressiveType === "—" ? "" : pos.progressiveType,
      index: pos.index,
    });
    const cur = map.get(key) ?? {
      lensType: pos.lensType,
      category: pos.category,
      brand: pos.brand,
      item: pos.item,
      coating: pos.coating,
      progressiveType: pos.progressiveType,
      index: formatIndexLabel(pos.index),
      skuCount: 0,
      onHand: 0,
      committed: 0,
      available: 0,
    };
    cur.skuCount += 1;
    cur.onHand += pos.onHand;
    cur.committed += pos.committed;
    cur.available += pos.available;
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => {
    if (b.onHand !== a.onHand) return b.onHand - a.onHand;
    return a.lensType.localeCompare(b.lensType);
  });
}

export function aggregatePowerWise(
  positions: InventoryStockPosition[]
): PowerStockGroup[] {
  const map = new Map<string, PowerStockGroup>();
  for (const pos of positions) {
    const key = powerIdentityKey({
      lensType: pos.lensType,
      category: pos.category === "—" ? "" : pos.category,
      brand: pos.brand === "—" ? "" : pos.brand,
      item: pos.item === "—" ? "" : pos.item,
      coating: pos.coating === "—" ? "" : pos.coating,
      progressiveType:
        pos.progressiveType === "—" ? "" : pos.progressiveType,
      index: pos.index,
      sph: pos.sph,
      cyl: pos.cyl,
      add: pos.add,
      axis: pos.axis,
      eye: pos.eye,
      crossPower: pos.crossPower,
    });
    const cur = map.get(key) ?? {
      lensType: pos.lensType,
      category: pos.category,
      brand: pos.brand,
      item: pos.item,
      coating: pos.coating,
      progressiveType: pos.progressiveType,
      index: formatIndexLabel(pos.index),
      sph:
        pos.crossPower != null
          ? `CROSS ${formatPowerField(pos.crossPower, "power")}`
          : formatPowerField(pos.sph, "power"),
      cyl:
        pos.crossPower != null ? "—" : formatPowerField(pos.cyl, "power"),
      axis: formatPowerField(pos.axis, "axis"),
      add: formatPowerField(pos.add, "power"),
      eye: pos.eye?.trim() || "—",
      power: pos.power,
      skuCount: 0,
      onHand: 0,
      committed: 0,
      available: 0,
    };
    cur.skuCount += 1;
    cur.onHand += pos.onHand;
    cur.committed += pos.committed;
    cur.available += pos.available;
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) => {
    if (a.lensType !== b.lensType) return a.lensType.localeCompare(b.lensType);
    if (a.sph !== b.sph) return a.sph.localeCompare(b.sph);
    if (a.cyl !== b.cyl) return a.cyl.localeCompare(b.cyl);
    return b.onHand - a.onHand;
  });
}

function sortSkuRows(
  rows: InventoryStockPosition[],
  mode: "current" | "reserved" | "available"
): InventoryStockPosition[] {
  const copy = [...rows];
  if (mode === "reserved") {
    copy.sort((a, b) => {
      if (b.committed !== a.committed) return b.committed - a.committed;
      if (b.onHand !== a.onHand) return b.onHand - a.onHand;
      return a.lensType.localeCompare(b.lensType);
    });
  } else if (mode === "available") {
    copy.sort((a, b) => {
      if (a.available !== b.available) return a.available - b.available;
      if (a.onHand !== b.onHand) return a.onHand - b.onHand;
      return a.lensType.localeCompare(b.lensType);
    });
  } else {
    copy.sort((a, b) => {
      if (b.onHand !== a.onHand) return b.onHand - a.onHand;
      return a.lensType.localeCompare(b.lensType);
    });
  }
  return copy;
}

function skuColumns(
  mode: "current" | "reserved" | "available"
): ReportColumn[] {
  const base: ReportColumn[] = [
    { key: "lensType", label: "Lens type" },
    { key: "category", label: "Category" },
    { key: "brand", label: "Brand" },
    { key: "item", label: "Item" },
    { key: "coating", label: "Coating" },
    { key: "power", label: "Power" },
  ];
  if (mode === "current") {
    return [...base, { key: "onHand", label: "On hand", align: "right" }];
  }
  if (mode === "reserved") {
    return [
      ...base,
      { key: "onHand", label: "On hand", align: "right" },
      { key: "committed", label: "Reserved", align: "right" },
    ];
  }
  return [
    ...base,
    { key: "onHand", label: "On hand", align: "right" },
    { key: "committed", label: "Reserved", align: "right" },
    { key: "available", label: "Available", align: "right" },
  ];
}

function skuRow(
  pos: InventoryStockPosition,
  mode: "current" | "reserved" | "available"
): Record<string, string | number | null> {
  const common = {
    lensType: pos.lensType,
    category: pos.category,
    brand: pos.brand,
    item: pos.item,
    coating: pos.coating,
    power: pos.power,
  };
  if (mode === "current") return { ...common, onHand: pos.onHand };
  if (mode === "reserved") {
    return { ...common, onHand: pos.onHand, committed: pos.committed };
  }
  return {
    ...common,
    onHand: pos.onHand,
    committed: pos.committed,
    available: pos.available,
  };
}

const PRODUCT_COLUMNS: ReportColumn[] = [
  { key: "lensType", label: "Lens type" },
  { key: "category", label: "Category" },
  { key: "brand", label: "Brand" },
  { key: "item", label: "Item" },
  { key: "coating", label: "Coating" },
  { key: "progressiveType", label: "Type" },
  { key: "index", label: "Index" },
  { key: "skuCount", label: "SKUs", align: "right" },
  { key: "onHand", label: "On hand", align: "right" },
  { key: "committed", label: "Reserved", align: "right" },
  { key: "available", label: "Available", align: "right" },
];

const POWER_COLUMNS: ReportColumn[] = [
  { key: "lensType", label: "Lens type" },
  { key: "category", label: "Category" },
  { key: "brand", label: "Brand" },
  { key: "item", label: "Item" },
  { key: "coating", label: "Coating" },
  { key: "progressiveType", label: "Type" },
  { key: "index", label: "Index" },
  { key: "sph", label: "SPH" },
  { key: "cyl", label: "CYL" },
  { key: "axis", label: "AXIS" },
  { key: "add", label: "ADD" },
  { key: "eye", label: "Eye" },
  { key: "skuCount", label: "SKUs", align: "right" },
  { key: "onHand", label: "On hand", align: "right" },
  { key: "committed", label: "Reserved", align: "right" },
  { key: "available", label: "Available", align: "right" },
];

function commonSummary(
  enabled: InventoryStockPosition[],
  matchingCount: number,
  returnedCount: number,
  totals: InventoryQtyTotals,
  disabledProductCount: number,
  truncated: boolean
): Record<string, string | number | null> {
  return {
    catalogEnabledCount: enabled.length,
    matchingCount,
    returnedCount,
    totalOnHand: totals.onHand,
    totalCommitted: totals.committed,
    totalAvailable: totals.available,
    disabledProductCount,
    disabledCountScope: DISABLED_COUNT_SCOPE,
    lensFamilies: INVENTORY_LENS_FAMILIES_LABEL,
    coverageNote: truncated
      ? `Showing first ${returnedCount} of ${matchingCount} rows (sorted). Totals above include all matching enabled rows.`
      : "All matching enabled rows shown. Totals include every matching enabled row.",
    reservationBasis:
      "reservedQuantity − pickedQuantity on PENDING, PICKING, PACKED, DISPATCHED, PARTIALLY_FULFILLED, AWAITING_PROCUREMENT (Order FK per lens family)",
    operationalNote:
      "Pick/pack stock mutation in order-inventory still covers SV/Kryptok/Progressive only; reports read Order reservations for all six families without changing that path.",
  };
}

const OOS_COLUMNS: ReportColumn[] = [
  { key: "classification", label: "Classification" },
  { key: "lensType", label: "Lens type" },
  { key: "category", label: "Category" },
  { key: "brand", label: "Brand" },
  { key: "item", label: "Item" },
  { key: "coating", label: "Coating" },
  { key: "power", label: "Power" },
  { key: "onHand", label: "On hand", align: "right" },
  { key: "committed", label: "Reserved", align: "right" },
  { key: "available", label: "Available", align: "right" },
];

const LOW_STOCK_COLUMNS: ReportColumn[] = [
  { key: "lensType", label: "Lens type" },
  { key: "category", label: "Category" },
  { key: "brand", label: "Brand" },
  { key: "item", label: "Item" },
  { key: "coating", label: "Coating" },
  { key: "power", label: "Power" },
  { key: "onHand", label: "On hand", align: "right" },
  { key: "committed", label: "Reserved", align: "right" },
  { key: "available", label: "Available", align: "right" },
  { key: "minStock", label: "Min stock", align: "right" },
  { key: "targetStock", label: "Target", align: "right" },
  { key: "deficit", label: "Below min by", align: "right" },
  { key: "stockStatus", label: "Stock status" },
];

export type OutOfStockRow = InventoryStockPosition & {
  classification: OutOfStockClass;
};

export function collectOutOfStockRows(
  enabled: InventoryStockPosition[]
): OutOfStockRow[] {
  const rows: OutOfStockRow[] = [];
  for (const pos of enabled) {
    const classification = classifyOutOfStock(pos);
    if (!classification) continue;
    rows.push({ ...pos, classification });
  }
  rows.sort((a, b) => {
    if (a.classification !== b.classification) {
      return a.classification === "physical" ? -1 : 1;
    }
    if (a.onHand !== b.onHand) return a.onHand - b.onHand;
    if (a.available !== b.available) return a.available - b.available;
    return a.lensType.localeCompare(b.lensType);
  });
  return rows;
}

export type LowStockRow = InventoryStockPosition & {
  minStock: number;
  targetStock: number;
  deficit: number;
  outOfStockClass: OutOfStockClass | null;
};

export function collectLowStockRows(
  enabled: InventoryStockPosition[],
  rules: ActiveReorderRuleInput[]
): LowStockRow[] {
  const byKey = new Map(
    enabled.map((pos) => [inventoryStockKey(pos.lensType, pos.lensId), pos])
  );
  const rows: LowStockRow[] = [];
  for (const rule of rules) {
    const pos = byKey.get(inventoryStockKey(rule.lensType, rule.lensId));
    if (!pos) continue; // rule for missing/disabled catalog row — skip
    if (!isLowStockAgainstMin(pos.available, rule.minStock)) continue;
    rows.push({
      ...pos,
      minStock: rule.minStock,
      targetStock: rule.targetStock,
      deficit: Math.max(0, rule.minStock - pos.available),
      outOfStockClass: classifyOutOfStock(pos),
    });
  }
  rows.sort((a, b) => {
    if (b.deficit !== a.deficit) return b.deficit - a.deficit;
    if (a.available !== b.available) return a.available - b.available;
    return a.lensType.localeCompare(b.lensType);
  });
  return rows;
}

function stockStatusLabel(oos: OutOfStockClass | null): string {
  if (oos === "physical") return "Also physical out of stock";
  if (oos === "fully_committed") return "Also fully committed / unavailable";
  return "Below min (still some available)";
}

/**
 * Build a table payload from full catalog positions (including disabled).
 * Disabled rows are excluded from tables; only their count appears in summary.
 */
export function inventoryStockToReportPayload(
  positions: InventoryStockPosition[],
  mode: InventoryStockReportMode,
  options?: { rowLimit?: number; reorderRules?: ActiveReorderRuleInput[] }
): ReportTablePayload {
  const rowLimit = options?.rowLimit ?? INVENTORY_REPORT_ROW_LIMIT;
  const { enabled, disabledProductCount } = partitionEnabledCatalog(positions);

  if (mode === "out-of-stock") {
    const oosRows = collectOutOfStockRows(enabled);
    const physicalCount = oosRows.filter(
      (r) => r.classification === "physical"
    ).length;
    const fullyCommittedCount = oosRows.filter(
      (r) => r.classification === "fully_committed"
    ).length;
    const unavailableCount = enabled.filter((p) => p.available <= 0).length;
    const totals = sumInventoryQty(oosRows);
    const displayed = oosRows.slice(0, rowLimit);
    const truncated = oosRows.length > displayed.length;
    return {
      kind: "table",
      columns: OOS_COLUMNS,
      rows: displayed.map((r) => ({
        classification: OUT_OF_STOCK_CLASS_LABEL[r.classification],
        lensType: r.lensType,
        category: r.category,
        brand: r.brand,
        item: r.item,
        coating: r.coating,
        power: r.power,
        onHand: r.onHand,
        committed: r.committed,
        available: r.available,
      })),
      summary: {
        ...commonSummary(
          enabled,
          oosRows.length,
          displayed.length,
          totals,
          disabledProductCount,
          truncated
        ),
        affectedSkuCount: oosRows.length,
        physicalOutOfStockCount: physicalCount,
        fullyCommittedCount,
        unavailableForOrdersCount: unavailableCount,
        classificationNote:
          "Each SKU appears once. Physical (on hand ≤ 0) and fully committed (available ≤ 0, on hand > 0) are mutually exclusive on a row. Unavailable-for-orders count includes both.",
      },
      meta: {
        truncated,
        rowLimit,
        supportedLensTypes: SUPPORTED_INVENTORY_REPORT_LENS_TYPES.join(","),
        mode,
      },
    };
  }

  if (mode === "low-stock") {
    const rules = options?.reorderRules ?? [];
    const lowRows = collectLowStockRows(enabled, rules);
    const alsoPhysical = lowRows.filter(
      (r) => r.outOfStockClass === "physical"
    ).length;
    const alsoCommitted = lowRows.filter(
      (r) => r.outOfStockClass === "fully_committed"
    ).length;
    const totals = sumInventoryQty(lowRows);
    const displayed = lowRows.slice(0, rowLimit);
    const truncated = lowRows.length > displayed.length;
    return {
      kind: "table",
      columns: LOW_STOCK_COLUMNS,
      rows: displayed.map((r) => ({
        lensType: r.lensType,
        category: r.category,
        brand: r.brand,
        item: r.item,
        coating: r.coating,
        power: r.power,
        onHand: r.onHand,
        committed: r.committed,
        available: r.available,
        minStock: r.minStock,
        targetStock: r.targetStock,
        deficit: r.deficit,
        stockStatus: stockStatusLabel(r.outOfStockClass),
      })),
      summary: {
        ...commonSummary(
          enabled,
          lowRows.length,
          displayed.length,
          totals,
          disabledProductCount,
          truncated
        ),
        activeReorderRuleCount: rules.length,
        lowStockSkuCount: lowRows.length,
        alsoPhysicalOutOfStockCount: alsoPhysical,
        alsoFullyCommittedCount: alsoCommitted,
        lowStockRule:
          "Active ReorderRule only (isActive=true). Low when available ≤ minStock — same comparison as procurement. SKUs without a rule are omitted. No global default minimum.",
      },
      meta: {
        truncated,
        rowLimit,
        supportedLensTypes: SUPPORTED_INVENTORY_REPORT_LENS_TYPES.join(","),
        mode,
      },
    };
  }

  if (mode === "product") {
    const groups = aggregateProductWise(enabled);
    const totals = sumInventoryQty(groups);
    const displayed = groups.slice(0, rowLimit);
    const truncated = groups.length > displayed.length;
    return {
      kind: "table",
      columns: PRODUCT_COLUMNS,
      rows: displayed.map((g) => ({
        lensType: g.lensType,
        category: g.category,
        brand: g.brand,
        item: g.item,
        coating: g.coating,
        progressiveType: g.progressiveType,
        index: g.index,
        skuCount: g.skuCount,
        onHand: g.onHand,
        committed: g.committed,
        available: g.available,
      })),
      summary: {
        ...commonSummary(
          enabled,
          groups.length,
          displayed.length,
          totals,
          disabledProductCount,
          truncated
        ),
        productKeyBasis:
          "lensType + category + brand + item + coating + progressive type (when set) + index (when set)",
      },
      meta: {
        truncated,
        rowLimit,
        supportedLensTypes: SUPPORTED_INVENTORY_REPORT_LENS_TYPES.join(","),
        mode,
      },
    };
  }

  if (mode === "power") {
    const groups = aggregatePowerWise(enabled);
    const totals = sumInventoryQty(groups);
    const displayed = groups.slice(0, rowLimit);
    const truncated = groups.length > displayed.length;
    return {
      kind: "table",
      columns: POWER_COLUMNS,
      rows: displayed.map((g) => ({
        lensType: g.lensType,
        category: g.category,
        brand: g.brand,
        item: g.item,
        coating: g.coating,
        progressiveType: g.progressiveType,
        index: g.index,
        sph: g.sph,
        cyl: g.cyl,
        axis: g.axis,
        add: g.add,
        eye: g.eye,
        skuCount: g.skuCount,
        onHand: g.onHand,
        committed: g.committed,
        available: g.available,
      })),
      summary: {
        ...commonSummary(
          enabled,
          groups.length,
          displayed.length,
          totals,
          disabledProductCount,
          truncated
        ),
        powerKeyBasis:
          "product identity + SPH/CYL/AXIS/ADD (+ eye / CROSS when present); families kept separate",
      },
      meta: {
        truncated,
        rowLimit,
        supportedLensTypes: SUPPORTED_INVENTORY_REPORT_LENS_TYPES.join(","),
        mode,
      },
    };
  }

  let filtered = enabled;
  if (mode === "reserved") {
    filtered = enabled.filter((p) => p.committed > 0);
  }

  const sorted = sortSkuRows(filtered, mode);
  const totals = sumInventoryQty(sorted);
  const displayed = sorted.slice(0, rowLimit);
  const truncated = sorted.length > displayed.length;

  return {
    kind: "table",
    columns: skuColumns(mode),
    rows: displayed.map((p) => skuRow(p, mode)),
    summary: commonSummary(
      enabled,
      sorted.length,
      displayed.length,
      totals,
      disabledProductCount,
      truncated
    ),
    meta: {
      truncated,
      rowLimit,
      supportedLensTypes: SUPPORTED_INVENTORY_REPORT_LENS_TYPES.join(","),
      mode,
    },
  };
}
