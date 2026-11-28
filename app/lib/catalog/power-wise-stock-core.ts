/**
 * Pure helpers for Power-wise Inventory (no Prisma / I/O).
 * Spec: docs/stock-management/POWER-WISE-INVENTORY.md
 *
 * Level 2 lists matrix sheets (power range + axis), matching
 * `buildCatalogMatrix` grouping — ADD/eye are columns, not separate rows.
 */

import {
  classifyVariantPowerShape,
  type CatalogMatrixSheet,
} from "@/app/lib/catalog/catalog-matrix";
import { catalogAvailable } from "@/app/lib/catalog/catalog-stock-position-core";
import { encodeStockLeafKey } from "@/app/lib/catalog/lens-product-stock-core";

export class PowerWiseStockError extends Error {
  status: number;
  code: string;
  constructor(message: string, status = 400, code = "POWER_WISE_ERROR") {
    super(message);
    this.name = "PowerWiseStockError";
    this.status = status;
    this.code = code;
  }
}

export type PowerWiseMatrixCell = {
  onHand: number;
  reserved: number;
  available: number;
  blocked: number;
};

export type PowerWiseSearchableCard = {
  name: string;
  familyName: string;
  baseName: string;
  materialName: string | null;
  coatingName: string | null;
  colorName: string | null;
  diameterName: string | null;
  progressiveTypeName: string | null;
};

/** Level 2 row = one catalog matrix sheet (range + axis). */
export type PowerWiseVariantFilterable = {
  skuCode: string;
  name: string;
  rangeLabel: string;
  axis: number | null;
  additions?: number[];
  eyes?: string[];
};

export type PowerWiseUngroupedVariant = {
  id: string;
  skuCode: string;
  name: string;
  isActive: boolean;
  sphMin: number;
  sphMax: number;
  cylMin: number;
  cylMax: number;
  axis: number | null;
  eye: string | null;
  addition: number | null;
  rangeLabel: string;
  totalOnHand: number;
  totalReserved: number;
  totalAvailable: number;
  totalBlocked: number;
};

export type PowerWiseMatrixGroupRow = {
  /** Representative variant id for Level 3 URL. */
  id: string;
  groupKey: string;
  skuCode: string;
  name: string;
  isActive: boolean;
  sphMin: number;
  sphMax: number;
  cylMin: number;
  cylMax: number;
  /** Sheet axis — null for pure sphere sheets (same as catalog matrix). */
  axis: number | null;
  rangeLabel: string;
  additions: number[];
  eyes: string[];
  variantCount: number;
  variantIds: string[];
  totalOnHand: number;
  totalReserved: number;
  totalAvailable: number;
  totalBlocked: number;
};

/**
 * Same key as catalog `groupVariants`: shape|range|axis.
 * Sphere sheets ignore stored axis so ADD siblings stay on one sheet.
 */
export function powerWiseMatrixGroupKey(input: {
  sphMin: number;
  sphMax: number;
  cylMin: number;
  cylMax: number;
  axis: number | null;
}): string {
  const shape = classifyVariantPowerShape(input);
  const axis = shape === "sphere" ? null : input.axis;
  return `${shape}|${input.sphMin}|${input.sphMax}|${input.cylMin}|${input.cylMax}|axis:${axis ?? "none"}`;
}

export function powerWiseSheetAxis(input: {
  sphMin: number;
  sphMax: number;
  cylMin: number;
  cylMax: number;
  axis: number | null;
}): number | null {
  const shape = classifyVariantPowerShape(input);
  return shape === "sphere" ? null : input.axis;
}

function normalizeEyeLabel(eye: string | null): string | null {
  if (!eye) return null;
  const upper = eye.trim().toUpperCase();
  if (upper === "RIGHT" || upper === "RE") return "RE";
  if (upper === "LEFT" || upper === "LE") return "LE";
  return upper;
}

/** Collapse LensProductVariant rows into catalog matrix sheet groups. */
export function groupPowerWiseVariantsByMatrixSheet(
  rows: PowerWiseUngroupedVariant[]
): PowerWiseMatrixGroupRow[] {
  const groups = new Map<
    string,
    {
      members: PowerWiseUngroupedVariant[];
      sheetAxis: number | null;
    }
  >();

  for (const row of rows) {
    const groupKey = powerWiseMatrixGroupKey(row);
    const existing = groups.get(groupKey);
    if (existing) {
      existing.members.push(row);
      continue;
    }
    groups.set(groupKey, {
      members: [row],
      sheetAxis: powerWiseSheetAxis(row),
    });
  }

  const out: PowerWiseMatrixGroupRow[] = [];
  for (const [groupKey, { members, sheetAxis }] of groups) {
    const sorted = members.toSorted((a, b) =>
      a.skuCode.localeCompare(b.skuCode)
    );
    const primary = sorted[0]!;
    const additions = [
      ...new Set(
        sorted
          .map((m) => m.addition)
          .filter((v): v is number => v != null && Number.isFinite(v))
      ),
    ].toSorted((a, b) => a - b);
    const eyes = [
      ...new Set(
        sorted
          .map((m) => normalizeEyeLabel(m.eye))
          .filter((v): v is string => Boolean(v))
      ),
    ].toSorted((a, b) => a.localeCompare(b));

    let totalOnHand = 0;
    let totalReserved = 0;
    let totalAvailable = 0;
    let totalBlocked = 0;
    for (const m of sorted) {
      totalOnHand += m.totalOnHand;
      totalReserved += m.totalReserved;
      totalAvailable += m.totalAvailable;
      totalBlocked += m.totalBlocked;
    }

    out.push({
      id: primary.id,
      groupKey,
      skuCode: primary.skuCode,
      name: primary.rangeLabel,
      isActive: sorted.some((m) => m.isActive),
      sphMin: primary.sphMin,
      sphMax: primary.sphMax,
      cylMin: primary.cylMin,
      cylMax: primary.cylMax,
      axis: sheetAxis,
      rangeLabel: primary.rangeLabel,
      additions,
      eyes,
      variantCount: sorted.length,
      variantIds: sorted.map((m) => m.id),
      totalOnHand,
      totalReserved,
      totalAvailable,
      totalBlocked,
    });
  }

  return out.toSorted((a, b) => {
    if (a.rangeLabel !== b.rangeLabel) {
      return a.rangeLabel.localeCompare(b.rangeLabel);
    }
    const aa = a.axis ?? Number.POSITIVE_INFINITY;
    const bb = b.axis ?? Number.POSITIVE_INFINITY;
    return bb - aa || a.skuCode.localeCompare(b.skuCode);
  });
}

export function zeroPowerWiseCell(): PowerWiseMatrixCell {
  return { onHand: 0, reserved: 0, available: 0, blocked: 0 };
}

/** Shared available formula for Power-wise cells. */
export function buildPowerWiseLeafCell(input: {
  onHand: number;
  blockedQty: number;
  reservedQty: number;
}): PowerWiseMatrixCell {
  return {
    onHand: input.onHand,
    reserved: input.reservedQty,
    available: catalogAvailable({
      onHand: input.onHand,
      blockedQty: input.blockedQty,
      reservedQty: input.reservedQty,
    }),
    blocked: input.blockedQty,
  };
}

export function buildPowerWiseProductName(
  parts: Array<string | null | undefined>
): string {
  return parts.filter(Boolean).join(" · ");
}

export function powerWiseProductMatchesQuery(
  card: PowerWiseSearchableCard,
  q: string
): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const hay = [
    card.name,
    card.familyName,
    card.baseName,
    card.materialName,
    card.coatingName,
    card.colorName,
    card.diameterName,
    card.progressiveTypeName,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(needle);
}

/** Valid matrix cells with no DB leaf → 0/0/0/0. */
export function fillMissingPowerWiseCells(
  sheets: CatalogMatrixSheet[],
  leaves: Record<string, PowerWiseMatrixCell>
): void {
  for (const sheet of sheets) {
    for (const row of sheet.rows) {
      for (const col of sheet.dataColumns) {
        const cell = row.cells[col.key];
        if (!cell?.allowed || !cell.present || !cell.variantId) continue;
        const key = encodeStockLeafKey(
          cell.variantId,
          cell.cellKey.sph,
          cell.cellKey.cyl
        );
        if (!leaves[key]) leaves[key] = zeroPowerWiseCell();
      }
    }
  }
}

export function filterPowerWiseVariants<T extends PowerWiseVariantFilterable>(
  rows: T[],
  filters: {
    q?: string;
    axis?: number;
  }
): T[] {
  let out = rows;
  const q = filters.q?.trim().toLowerCase();
  if (q) {
    out = out.filter((row) => {
      const addHay = (row.additions ?? [])
        .map((n) => n.toFixed(2))
        .join(" ");
      const eyeHay = (row.eyes ?? []).join(" ");
      return (
        row.skuCode.toLowerCase().includes(q) ||
        row.name.toLowerCase().includes(q) ||
        row.rangeLabel.toLowerCase().includes(q) ||
        addHay.includes(q) ||
        eyeHay.toLowerCase().includes(q) ||
        (row.axis != null && String(row.axis).includes(q))
      );
    });
  }
  if (filters.axis != null && Number.isFinite(filters.axis)) {
    out = out.filter(
      (row) =>
        row.axis != null && Math.abs(row.axis - filters.axis!) < 1e-9
    );
  }
  return out;
}

/** Shortage = configured rules and available at/below threshold. */
export function isPowerWiseShortage(input: {
  available: number;
  minStock: number;
  targetStock: number;
}): boolean {
  return (
    (input.minStock > 0 || input.targetStock > 0) &&
    input.available <= input.minStock
  );
}
