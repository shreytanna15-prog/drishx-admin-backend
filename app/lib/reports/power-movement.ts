import { LensType } from "@prisma/client";
import { prisma } from "@/app/lib/prisma";
import type { ParsedDateRange } from "./date-range";
import { formatDateKey } from "./date-range";
import { REPORT_EXPORT_ROW_LIMIT } from "./export-format";
import { formatInventoryPowerLabel } from "./inventory-stock-format";
import {
  DEAD_POWERS_COLUMNS,
  DEAD_POWERS_LOOKBACK_DAYS,
  POWER_MOVEMENT_COLUMNS,
  aggregateSoldQtyByLens,
  netSoldQty,
  powerMovementKey,
  selectPowerMovementRows,
  type PowerMovementMode,
  type PowerMovementRow,
} from "./power-movement-format";
import type { ReportTablePayload } from "./types";

const INVENTORY_LENS_TYPES: LensType[] = [
  LensType.SINGLE_VISION,
  LensType.KRYPTOK,
  LensType.PROGRESSIVE,
  LensType.ORI_VISION,
  LensType.MAGNUS,
  LensType.BIFOCAL,
];

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

/** Inclusive lookback ending at `range.to` (calendar days). */
export function lookbackRangeEndingAt(
  end: Date,
  days: number
): ParsedDateRange {
  const to = new Date(
    end.getFullYear(),
    end.getMonth(),
    end.getDate(),
    23,
    59,
    59,
    999
  );
  const from = new Date(to);
  from.setDate(from.getDate() - (Math.max(1, days) - 1));
  from.setHours(0, 0, 0, 0);
  return {
    from,
    to,
    fromKey: formatDateKey(from),
    toKey: formatDateKey(to),
  };
}

async function loadCatalogMovementRows(): Promise<PowerMovementRow[]> {
  const [sv, kryptok, progressive, oriVision, magnus, bifocal] =
    await Promise.all([
      prisma.singleVisionLens.findMany({
        where: { isDisabled: false },
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
          createdAt: true,
        },
      }),
      prisma.kryptokLens.findMany({
        where: { isDisabled: false },
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
          createdAt: true,
        },
      }),
      prisma.progressiveLens.findMany({
        where: { isDisabled: false },
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
          createdAt: true,
        },
      }),
      prisma.oriVisionLens.findMany({
        select: {
          id: true,
          brand: true,
          item: true,
          category: true,
          coating: true,
          sph: true,
          cyl: true,
          quantity: true,
          createdAt: true,
        },
      }),
      prisma.magnusLens.findMany({
        select: {
          id: true,
          item: true,
          category: true,
          coating: true,
          sph: true,
          cyl: true,
          quantity: true,
          createdAt: true,
        },
      }),
      prisma.bifocalLens.findMany({
        select: {
          id: true,
          brand: true,
          item: true,
          coating: true,
          sph: true,
          cyl: true,
          add: true,
          quantity: true,
          createdAt: true,
        },
      }),
    ]);

  const rows: PowerMovementRow[] = [];
  for (const r of sv) {
    rows.push({
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
      soldQty: 0,
      introducedAt: r.createdAt,
    });
  }
  for (const r of kryptok) {
    rows.push({
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
      soldQty: 0,
      introducedAt: r.createdAt,
    });
  }
  for (const r of progressive) {
    rows.push({
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
      soldQty: 0,
      introducedAt: r.createdAt,
    });
  }
  for (const r of oriVision) {
    rows.push({
      lensType: LensType.ORI_VISION,
      lensId: r.id,
      label: productLabel(r),
      power: formatInventoryPowerLabel({
        sph: numOrNull(r.sph),
        cyl: numOrNull(r.cyl),
        add: null,
        axis: null,
        eye: null,
        crossPower: null,
      }),
      onHand: Number(r.quantity) || 0,
      soldQty: 0,
      introducedAt: r.createdAt,
    });
  }
  for (const r of magnus) {
    rows.push({
      lensType: LensType.MAGNUS,
      lensId: r.id,
      label: productLabel({
        brand: null,
        item: r.item,
        category: r.category,
        coating: r.coating,
      }),
      power: formatInventoryPowerLabel({
        sph: numOrNull(r.sph),
        cyl: numOrNull(r.cyl),
        add: null,
        axis: null,
        eye: null,
        crossPower: null,
      }),
      onHand: Number(r.quantity) || 0,
      soldQty: 0,
      introducedAt: r.createdAt,
    });
  }
  for (const r of bifocal) {
    rows.push({
      lensType: LensType.BIFOCAL,
      lensId: r.id,
      label: productLabel({
        brand: r.brand,
        item: r.item,
        category: null,
        coating: r.coating,
      }),
      power: formatInventoryPowerLabel({
        sph: numOrNull(r.sph),
        cyl: numOrNull(r.cyl),
        add: numOrNull(r.add),
        axis: null,
        eye: null,
        crossPower: null,
      }),
      onHand: Number(r.quantity) || 0,
      soldQty: 0,
      introducedAt: r.createdAt,
    });
  }
  return rows;
}

async function loadIssuedSoldQtyMap(
  range: ParsedDateRange
): Promise<Map<string, number>> {
  const lines = await prisma.invoiceLine.findMany({
    where: {
      lensType: { in: INVENTORY_LENS_TYPES },
      lensId: { not: null },
      invoice: {
        issuedAt: { gte: range.from, lte: range.to },
        status: { notIn: ["CANCELLED", "VOID"] },
      },
    },
    select: {
      lensType: true,
      lensId: true,
      quantity: true,
    },
  });
  return aggregateSoldQtyByLens(
    lines.map((l) => ({
      lensType: l.lensType,
      lensId: l.lensId,
      quantity: Number(l.quantity),
    }))
  );
}

/**
 * Returned units from StockMovement RETURNED in the window.
 * Missing return movements are treated as zero adjustment (not invented sales).
 */
async function loadReturnedQtyMap(
  range: ParsedDateRange
): Promise<Map<string, number>> {
  const movements = await prisma.stockMovement.findMany({
    where: {
      movementType: "RETURNED",
      lensType: { in: INVENTORY_LENS_TYPES },
      createdAt: { gte: range.from, lte: range.to },
    },
    select: {
      lensType: true,
      lensId: true,
      quantityDelta: true,
    },
  });
  return aggregateSoldQtyByLens(
    movements.map((m) => ({
      lensType: m.lensType,
      lensId: m.lensId,
      quantity: Math.abs(Number(m.quantityDelta) || 0),
    }))
  );
}

export async function computePowerMovementReport(
  mode: PowerMovementMode,
  range: ParsedDateRange,
  thresholds: { minUnits?: number; maxUnits?: number },
  options?: { rowLimit?: number; now?: Date }
): Promise<ReportTablePayload> {
  const now = options?.now ?? new Date();
  const effectiveRange =
    mode === "dead"
      ? lookbackRangeEndingAt(range.to, DEAD_POWERS_LOOKBACK_DAYS)
      : range;

  const [catalog, soldMap, returnedMap] = await Promise.all([
    loadCatalogMovementRows(),
    loadIssuedSoldQtyMap(effectiveRange),
    loadReturnedQtyMap(effectiveRange),
  ]);

  const withSales = catalog.map((row) => {
    const key = powerMovementKey(row.lensType, row.lensId);
    const sold = soldMap.get(key) ?? 0;
    const returned = returnedMap.get(key) ?? 0;
    return {
      ...row,
      soldQty: netSoldQty(sold, returned),
    };
  });

  let selected: Array<
    PowerMovementRow & { eligibility?: "DEAD" | "INSUFFICIENT_HISTORY" }
  >;
  try {
    selected = selectPowerMovementRows(withSales, mode, thresholds, {
      now,
      deadLookbackDays: DEAD_POWERS_LOOKBACK_DAYS,
    });
  } catch (err) {
    const code = err instanceof Error ? err.message : "";
    if (code === "FAST_THRESHOLD_REQUIRED") {
      throw new PowerMovementParamError(
        "Enter a minimum sold quantity (minUnits) for Fast Moving Powers."
      );
    }
    if (code === "SLOW_THRESHOLD_REQUIRED") {
      throw new PowerMovementParamError(
        "Enter a maximum sold quantity (maxUnits) for Slow Moving Powers."
      );
    }
    throw err;
  }

  const limit = options?.rowLimit ?? REPORT_EXPORT_ROW_LIMIT;
  const truncated = selected.length > limit;
  const slice = truncated ? selected.slice(0, limit) : selected;
  const soldTotal = slice.reduce((s, r) => s + r.soldQty, 0);
  const onHandTotal = slice.reduce((s, r) => s + r.onHand, 0);
  const deadCount =
    mode === "dead"
      ? slice.filter((r) => r.eligibility === "DEAD").length
      : 0;
  const insufficientCount =
    mode === "dead"
      ? slice.filter((r) => r.eligibility === "INSUFFICIENT_HISTORY").length
      : 0;

  const columns =
    mode === "dead" ? DEAD_POWERS_COLUMNS : POWER_MOVEMENT_COLUMNS;

  return {
    kind: "table",
    columns,
    rows: slice.map((r) => {
      const base: Record<string, string | number | null> = {
        lensType: r.lensType,
        label: r.label,
        power: r.power,
        onHand: r.onHand,
        soldQty: r.soldQty,
      };
      if (mode === "dead") {
        base.eligibility =
          r.eligibility === "DEAD" ? "Dead" : "Insufficient History";
      }
      return base;
    }),
    summary: {
      skuCount: slice.length,
      soldQty: soldTotal,
      onHand: onHandTotal,
      truncated: truncated ? 1 : 0,
      ...(mode === "dead"
        ? {
            deadSkuCount: deadCount,
            insufficientHistorySkuCount: insufficientCount,
          }
        : {}),
    },
    meta: {
      mode,
      rowLimit: limit,
      truncated,
      totalMatching: selected.length,
      minUnits: thresholds.minUnits ?? null,
      maxUnits: thresholds.maxUnits ?? null,
      salesFrom: effectiveRange.fromKey,
      salesTo: effectiveRange.toKey,
      salesBasis: "issued invoice lines − RETURNED stock movements (net ≥ 0)",
      ...(mode === "dead"
        ? {
            deadLookbackDays: DEAD_POWERS_LOOKBACK_DAYS,
            historyBasis: "catalog createdAt must be ≥ lookback days ago",
          }
        : {}),
    },
  };
}

export class PowerMovementParamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PowerMovementParamError";
  }
}
